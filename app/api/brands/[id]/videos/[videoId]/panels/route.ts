// One picture of one film, removed.
//
// The rule lives in lib/event-cm/panel-actions.ts and the storyboard reads it to
// decide what the menu offers. This route reads the SAME function before writing
// anything, which is the point: a menu is an affordance, not an authority, and
// the brief it is describing may have moved since the page loaded (a stage run
// can drop the last speaker, leaving an open dialog offering a delete that no
// longer means anything).
//
// It exists at all because the client used to compose the write itself —
// suppressing a field here, rewriting the programme list there. That made the
// button a second way to author a brief, so the rule and the write could drift
// apart. Now the client asks for a picture to be removed and the template
// decides what that means.

import { guardLabsRequest } from "@/lib/labs-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { validateBrief } from "@/lib/templates/brief-schemas";
import { setSuppressed } from "@/lib/templates/event-cm/facts";
import { panelDeletion } from "@/lib/templates/event-cm/panel-actions";
import {
  EVENT_CM_SCENES,
  type EventCmBrief,
  type EventCmSceneRole,
} from "@/remotion/event-cm/types";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

const isSceneRole = (value: string): value is EventCmSceneRole =>
  EVENT_CM_SCENES.some((scene) => scene.role === value);

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? "";
  const rawIndex = url.searchParams.get("index");
  if (!isSceneRole(role)) {
    return Response.json({ error: "シーンを指定してください" }, { status: 400 });
  }
  const index = rawIndex === null ? undefined : Number(rawIndex);
  if (index !== undefined && !Number.isInteger(index)) {
    return Response.json({ error: "シーンを指定してください" }, { status: 400 });
  }

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
    return Response.json({ error: "このテンプレートには対応していません" }, { status: 400 });
  }

  const brief = take.brief as EventCmBrief;
  const decision = panelDeletion(brief, { role, index });
  // The reason is the template's own sentence, so the band under the storyboard
  // says what the menu would have said. 409, not 400: the request was well
  // formed and this film simply does not have that shape.
  if (!decision.can) {
    return Response.json({ error: decision.reason }, { status: 409 });
  }

  // Every deletion is a suppression: the picture goes, the values stay. The
  // agenda used to be the exception — one programme dropped out of `programs`
  // and the picture went with it — which stopped being true when the template
  // fixed the number of agenda pictures (EVENT_CM_PROGRAM_SCENES).
  const next: EventCmBrief = setSuppressed(brief, decision.path, true);

  const validated = validateBrief("event-cm", next);
  if (!validated.ok) {
    return Response.json(
      { error: `シーンを削除できません: ${validated.issues.join(", ")}` },
      { status: 400 },
    );
  }
  const { error: saveError } = await supabase
    .from("takes")
    .update({ brief: validated.brief, updated_at: new Date().toISOString() })
    .eq("id", take.id);
  if (saveError) {
    return Response.json({ error: saveError.message }, { status: 500 });
  }
  return Response.json({ ok: true, kind: decision.kind });
}
