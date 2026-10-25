// One fact of one video.
//
// The list under the preview is the input surface, so this is what it writes
// to. Three operations and no others: replace a value, switch a field off,
// switch it back on.
//
// Editing records `user` as the origin, which is what stops a later re-run
// from putting the guess back. Switching off records a decision rather than a
// gap, so the field stops being counted as something still to collect.

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { validateBrief } from "@/lib/templates/brief-schemas";
import {
  applyAssetChoice,
  applyFactEdit,
  isAssetSlot,
  isEditable,
  markUserEdited,
  setSuppressed,
} from "@/lib/templates/event-cm/facts";
import { DEFAULT_ASSETS } from "@/lib/assets/defaults";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function PATCH(
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

  let body: { path?: unknown; lines?: unknown; suppressed?: unknown; src?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "リクエストを解釈できませんでした" }, { status: 400 });
  }
  const path = typeof body.path === "string" ? body.path : "";
  if (!path) return Response.json({ error: "項目が必要です" }, { status: 400 });

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

  let next = take.brief as EventCmBrief;

  if (body.src !== undefined && isAssetSlot(path)) {
    // Choosing an asset, not typing a value. The source has to be one of two
    // things: a track from the system pool, or a material pinned to THIS take.
    // Without that check the brief could be pointed at an arbitrary R2 key.
    const src = body.src === null ? null : String(body.src);
    if (src !== null) {
      const fromPool = DEFAULT_ASSETS.some((asset) => asset.src === src);
      const materialId = src.startsWith("material:") ? src.slice("material:".length) : null;
      let pinned = false;
      if (materialId) {
        const { data } = await supabase
          .from("take_inputs")
          .select("material_id")
          .eq("take_id", take.id)
          .eq("material_id", materialId)
          .maybeSingle();
        pinned = Boolean(data);
      }
      if (!fromPool && !pinned) {
        return Response.json(
          {
            error:
              path === "bgm"
                ? "この音源は選べません。デフォルトから選ぶか、素材として追加してください"
                : "この素材は選べません。先にこの動画へ素材として追加してください",
          },
          { status: 400 },
        );
      }
    }
    const chosen = applyAssetChoice(next, path, src);
    if (!chosen) {
      return Response.json({ error: "この項目は選択できません" }, { status: 400 });
    }
    next = markUserEdited(chosen, path);
  } else if (typeof body.suppressed === "boolean") {
    next = setSuppressed(next, path, body.suppressed);
  } else if (Array.isArray(body.lines)) {
    if (!isEditable(path)) {
      return Response.json(
        { error: "この項目はここでは編集できません" },
        { status: 400 },
      );
    }
    const lines = body.lines.filter((line): line is string => typeof line === "string");
    const edited = applyFactEdit(next, path, lines);
    if (!edited) {
      return Response.json({ error: "この項目は編集できません" }, { status: 400 });
    }
    next = markUserEdited(edited, path);
  } else {
    return Response.json({ error: "値・音源・表示のいずれかの指定が必要です" }, { status: 400 });
  }

  const validated = validateBrief("event-cm", next);
  if (!validated.ok) {
    return Response.json(
      { error: `内容が不正です: ${validated.issues.join(", ")}` },
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
  return Response.json({ ok: true });
}
