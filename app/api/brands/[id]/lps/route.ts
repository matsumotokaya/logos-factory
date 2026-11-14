// LPs of one brand — the list, and the one button that makes another.
//
// An LP is a take of the `brand-lp` template: the kit as it stood, the words,
// and where each section's facts came from, frozen in the brief
// (lib/templates/brand-lp). POST makes one from the brand as it is now and
// streams the account of the work, the same way adding a video does.

import { guardBrandRequest } from "@/lib/brand-access";
import type { PipelineStageId } from "@/lib/pipeline/stages";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { parseLpBrief, LP_SECTIONS } from "@/lib/templates/brand-lp/brief-schema";
import { createBrandLp, LP_CREATE_STEPS } from "@/lib/templates/brand-lp/create";

export const maxDuration = 300;

export type LpSummary = {
  id: string;
  title: string;
  createdAt: string;
  headline: string;
  /** Sections whose facts did not come from the kit. */
  gaps: number;
};

/** One line of the creation log (NDJSON), as the videos route streams it. */
export type LpCreateEvent =
  | { type: "step"; label: string; index: number; total: number; stage: PipelineStageId }
  | { type: "done"; id: string; note: string | null }
  | { type: "error"; message: string };

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const { data: brand, error: brandError } = await supabase
    .from("brand_entities")
    .select("id, name")
    .eq("id", brandId)
    .maybeSingle();
  if (brandError) return Response.json({ error: "ブランドを確認できませんでした" }, { status: 500 });
  if (!brand) return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });

  const takes = await supabase
    .from("takes")
    .select("id, title, brief, created_at")
    .eq("brand_id", brandId)
    .eq("template_id", "brand-lp")
    .order("created_at", { ascending: false });
  if (takes.error) return Response.json({ error: "LPを取得できませんでした" }, { status: 500 });

  const lps: LpSummary[] = (takes.data ?? []).flatMap((take) => {
    const brief = parseLpBrief(take.brief);
    if (!brief) return [];
    return [
      {
        id: take.id as string,
        title: take.title as string,
        createdAt: take.created_at as string,
        headline: brief.content.hero.headline.replace(/\n/g, ""),
        gaps: LP_SECTIONS.filter((section) => brief.basis[section].origin !== "kit").length,
      },
    ];
  });
  return Response.json({ brand: { id: brand.id, name: brand.name }, lps });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const { data: brand, error: brandError } = await supabase
    .from("brand_entities")
    .select("id")
    .eq("id", brandId)
    .maybeSingle();
  if (brandError) return Response.json({ error: "ブランドを確認できませんでした" }, { status: 500 });
  if (!brand) return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });

  // Everything above answers with a status; the work below streams.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      // The reader may leave — a reload, a closed tab. The work does not stop
      // for that: writing to a closed stream throws, and a throw here would
      // abandon a take half made. The result still lands in the lists.
      let open = true;
      const send = (event: LpCreateEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await createBrandLp({
          supabase,
          brandId,
          userId: user.id,
          step: (label, index, stage) => send({ type: "step", label, index, total: LP_CREATE_STEPS, stage }),
        });
        send({ type: "done", id: result.takeId, note: result.writer.note });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "LPを作成できませんでした",
        });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // Already closed by the reader leaving.
          }
        }
      }
    },
  });
  return new Response(stream, {
    status: 201,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Nothing may buffer this: a progress log delivered whole is the silence
      // it was meant to replace.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
