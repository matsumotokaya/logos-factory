// Fix the working brief as the film.
//
// The last step of the one button (docs/old/event-cm-refactor-plan.md §9.6). Until
// this runs, editing the storyboard changes nothing anybody watches: the
// player, the MP4 renderer and the public URL all read `baked_brief`, and this
// route is the only thing that writes it.
//
// It writes a copy and nothing else — no model call, no audio, no render. That
// is what makes "the video changed" an event with a cause the user chose,
// instead of a consequence of typing.

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { validateBrief } from "@/lib/templates/brief-schemas";

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

  const { data: take, error } = await supabase
    .from("takes")
    .select("id, template_id, brief")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (error) {
    return Response.json({ error: "動画を確認できませんでした" }, { status: 500 });
  }
  if (!take) return Response.json({ error: "動画が見つかりません" }, { status: 404 });
  if (take.template_id !== "event-cm") {
    return Response.json(
      { error: "このテンプレートは焼き付けを持ちません" },
      { status: 400 },
    );
  }

  // Validated before it is fixed, not after. A brief that cannot be rendered is
  // exactly the thing that must not become what the player and the exporter
  // read — the working copy can be halfway through anything, the fixed one is a
  // promise that this plays.
  const validated = validateBrief("event-cm", take.brief);
  if (!validated.ok) {
    return Response.json(
      { error: `この内容は動画にできません: ${validated.issues.join(", ")}` },
      { status: 400 },
    );
  }

  const bakedAt = new Date().toISOString();
  const { error: saveError } = await supabase
    .from("takes")
    // `updated_at` deliberately untouched: fixing a copy is not a change to the
    // working brief, and moving its clock would make the next comparison lie.
    .update({ baked_brief: validated.brief, baked_at: bakedAt })
    .eq("id", take.id);
  if (saveError) {
    return Response.json({ error: saveError.message }, { status: 500 });
  }

  return Response.json({ ok: true, bakedAt });
}
