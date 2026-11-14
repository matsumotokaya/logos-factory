// One LP: the page, and the account of where it came from.
//
//   GET     the brief's content and basis, the rendered HTML (plain, and with
//           the gaps outlined), what the design had to correct, and whether
//           the kit has moved since
//   DELETE  the take
//
// The HTML is derived from the brief on every read (render.ts is pure), so a
// renderer fix reaches every LP at once and nothing is stored twice.

import { guardBrandRequest } from "@/lib/brand-access";
import { buildKitBrief } from "@/lib/brand/kit/build";
import { kitContentHash } from "@/lib/brand/kit/snapshot";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { deleteTake } from "@/lib/takes/delete";
import { LP_SECTIONS, parseLpBrief, type BrandLpBrief } from "@/lib/templates/brand-lp/brief-schema";
import { lpDesign } from "@/lib/templates/brand-lp/design";
import { lpAssets } from "@/lib/templates/brand-lp/preview";
import { renderBrandLp } from "@/lib/templates/brand-lp/render";
import type { BrandFeature, BrandVoice } from "@/lib/brand/content";
import { lpPipeline, type LpPipeline } from "@/lib/pipeline/brand-lp";

export type LpDetail = {
  id: string;
  title: string;
  createdAt: string;
  brand: { id: string; name: string };
  content: BrandLpBrief["content"];
  basis: BrandLpBrief["basis"];
  writer: BrandLpBrief["writer"];
  /** Kit values the page could not use as they stood (lib/templates/brand-lp/design.ts). */
  designNotes: { path: string; note: string }[];
  /** When the kit this page was drawn from was read. */
  kitReadAt: string;
  /** The brand's kit differs from the one frozen in this page. */
  kitChanged: boolean;
  /** Fields this page read as 推定 that the kit carries now (adopted since). */
  nowInKit: string[];
  /** The five stages and the kit before them (lib/pipeline/brand-lp.ts). */
  pipeline: LpPipeline;
  /** What the extract stage found. */
  read: { features: BrandFeature[]; voices: BrandVoice[] } | null;
  /** What the input stage used. */
  input: { values: number; logo: boolean; screen: boolean; website: string };
  html: string;
  /** The same page with the sections that are not from the kit outlined. */
  htmlMarked: string;
};

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

async function session(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return { denied };
  try {
    const user = await requireUser(req);
    return { user, supabase: createServerSupabaseForToken(user.token) };
  } catch {
    return { denied: unauthorized() };
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string; lpId: string }> }) {
  const s = await session(req);
  if (s.denied) return s.denied;
  const { id: brandId, lpId } = await ctx.params;

  const { data: take, error } = await s.supabase
    .from("takes")
    .select("id, title, brief, created_at")
    .eq("id", lpId)
    .eq("brand_id", brandId)
    .eq("template_id", "brand-lp")
    .maybeSingle();
  if (error) return Response.json({ error: "LPを取得できませんでした" }, { status: 500 });
  const brief = parseLpBrief(take?.brief);
  if (!take || !brief) return Response.json({ error: "LPが見つかりません" }, { status: 404 });

  const [assets, current] = await Promise.all([
    lpAssets(s.supabase, { brandId, brief, origin: new URL(req.url).origin }),
    buildKitBrief(s.supabase, brandId),
  ]);

  const designNotes = lpDesign(brief.kit).notes;
  const kitChanged = current.ok ? kitContentHash(current.brief) !== kitContentHash(brief.kit) : false;
  const detail: LpDetail = {
    id: take.id as string,
    title: take.title as string,
    createdAt: take.created_at as string,
    brand: { id: brandId, name: brief.kit.brand.name },
    content: brief.content,
    basis: brief.basis,
    writer: brief.writer,
    designNotes,
    kitReadAt: brief.kit.snapshotAt,
    kitChanged,
    pipeline: lpPipeline({ brief, createdAt: take.created_at as string, kitChanged, designNotes: designNotes.length }),
    read: brief.read ?? null,
    input: {
      values: Object.keys(brief.kit.values).length,
      logo: brief.kit.logos.length > 0,
      screen: assets.screen !== null,
      website: brief.kit.brand.website,
    },
    nowInKit: current.ok
      ? [...new Set(LP_SECTIONS.flatMap((section) => brief.basis[section].pending))].filter(
          (path) => path in current.brief.values,
        )
      : [],
    html: renderBrandLp(brief, assets, { newTab: true }),
    htmlMarked: renderBrandLp(brief, assets, { markGaps: true, newTab: true }),
  };
  return Response.json({ lp: detail }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; lpId: string }> }) {
  const s = await session(req);
  if (s.denied) return s.denied;
  const { id: brandId, lpId } = await ctx.params;

  const { data: take, error } = await s.supabase
    .from("takes")
    .select("id")
    .eq("id", lpId)
    .eq("brand_id", brandId)
    .eq("template_id", "brand-lp")
    .maybeSingle();
  if (error) return Response.json({ error: "LPを確認できませんでした" }, { status: 500 });
  if (!take) return Response.json({ error: "LPが見つかりません" }, { status: 404 });

  // An LP owns no files of its own: the logo is inside the brief and the
  // screen is the brand's material.
  const outcome = await deleteTake(s.supabase, { brandId, takeId: take.id as string, disposition: "discard" });
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
