// Render one v2 video Take to MP4 and store it in R2.
//
// Fire-and-forget with the state kept on the take's own row: a render takes
// minutes, so the request returns 202 and the detail screen polls. Progress lives in metadata.render rather than in memory
// so a reload — or a different machine — still sees what happened.

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { renderTake } from "@/lib/takes/render";

export const maxDuration = 300;

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const { data: take, error: takeError } = await supabase
    .from("takes")
    .select("id, template_id, brief")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (takeError) {
    return Response.json({ error: "動画を確認できませんでした" }, { status: 500 });
  }
  if (take) {
    const takeBrief = take.brief as Record<string, unknown> | null;
    if (
      take.template_id === "product-cm" &&
      (!takeBrief?.voice || typeof takeBrief.voice !== "object")
    ) {
      return Response.json(
        { error: "先にProduct CMのナレーションを生成してください" },
        { status: 409 },
      );
    }
    const { data: render, error: renderError } = await supabase
      .from("take_renders")
      .select("id, status")
      .eq("take_id", take.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (renderError || !render) {
      return Response.json({ error: "動画の出力単位が見つかりません" }, { status: 500 });
    }
    if (render.status === "running") {
      return Response.json({ status: "running" }, { status: 202 });
    }

    const { error: startError } = await supabase
      .from("take_renders")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", render.id);
    if (startError) {
      return Response.json({ error: "MP4作成を開始できませんでした" }, { status: 500 });
    }

    void renderTake(supabase, render.id).then((result) => {
      if (!result.ok) console.error("v2 video MP4 render failed:", result.error);
    });
    return Response.json({ status: "running" }, { status: 202 });
  }

  return Response.json({ error: "動画が見つかりません" }, { status: 404 });
}
