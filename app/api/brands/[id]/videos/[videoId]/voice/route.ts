// Speak this video's narration.
//
// The last step that turns a proposal into a film: the narration is read aloud,
// the WAV is pinned to the take, and the timeline stops estimating from
// character counts and starts following the measured track.

import { guardLabsRequest } from "@/lib/labs-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { generateVoice, voiceAvailable } from "@/lib/voice/synthesize";
import {
  DEFAULT_VOICE_PRESET,
  voicePresetById,
  voicePresetByName,
} from "@/lib/voice/voices";
import { EVENT_CM_PERSONA } from "@/lib/templates/event-cm/delivery";
import { isSuppressed, setSuppressed } from "@/lib/templates/event-cm/facts";
import { attachTakeNarration } from "@/lib/takes/narration";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { validateBrief } from "@/lib/templates/brief-schemas";
import { EVENT_CM_SCENE_GAP_MS } from "@/remotion/event-cm/timeline";
import { eventCmSpoken } from "@/remotion/event-cm/types";
import { type EventCmBrief } from "@/remotion/event-cm/types";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(
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

  // Which voice reads it. Unknown ids fall back rather than failing: the take's
  // own recorded voice first (re-recording keeps the voice you had), then the
  // template's standard narrator.
  let requestedVoiceId: string | null = null;
  try {
    const body = (await req.json()) as { voiceId?: unknown } | null;
    if (typeof body?.voiceId === "string") requestedVoiceId = body.voiceId;
  } catch {
    // No body is the ordinary case: "read it again as it was".
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
    return Response.json(
      { error: "このテンプレートはこの経路で音声を作りません" },
      { status: 400 },
    );
  }
  if (!voiceAvailable()) {
    return Response.json(
      { error: "音声の生成が設定されていません（GEMINI_API_KEY / CAMPAIGN_TTS_MOCK）" },
      { status: 503 },
    );
  }

  const brief = take.brief as EventCmBrief;
  const scenes = brief.narration.scenes;
  // The film's own shape decides how many lines are expected: four when nobody
  // is announced, one per programme when several are listed, and none for a
  // field the user switched off. The film object is the one place that shape
  // is derived, so the count comes from it.
  const expected = eventCmFilm(brief).scenes.filter((scene) => scene.narrated).length;
  if (scenes.length !== expected) {
    // Says which state it is in. A partial narration is the ordinary state while
    // somebody is writing, and 「先にナレーションを書いてください」 reads as though
    // nothing had been written at all.
    return Response.json(
      {
        error:
          scenes.length === 0
            ? "先にナレーションを書いてください"
            : `ナレーションが書かれていないシーンがあります（${scenes.length}/${expected}シーン）。残りを書いてから読み上げてください`,
      },
      { status: 409 },
    );
  }

  // Which voice reads it, most specific first: what this call asked for, then
  // what the take was set to, then what it happens to have been read in before,
  // then the template's standard narrator. The setting comes before the old
  // recording so the one button honours a choice made in the dialog — which is
  // the whole point of choosing being separate from recording.
  const chosen =
    voicePresetById(requestedVoiceId) ??
    voicePresetById(brief.narrator) ??
    voicePresetByName(brief.voice?.track.voice) ??
    DEFAULT_VOICE_PRESET;

  // Asking for it read aloud is the decision to have a narration, so a previous
  // "off" is withdrawn here — before the call rather than after it, because the
  // decision is the user's and does not depend on whether the provider answers.
  // Cleared through the ordinary suppression path so there is one spelling of
  // it (lib/event-cm/facts.ts).
  if (isSuppressed(brief, "voice")) {
    const restored = validateBrief("event-cm", setSuppressed(brief, "voice", false));
    if (restored.ok) {
      await supabase
        .from("takes")
        .update({ brief: restored.brief, updated_at: new Date().toISOString() })
        .eq("id", take.id);
    }
  }

  try {
    const { wav, track } = await generateVoice(
      // The narrator is handed the READING when a line has one, so the recording
      // can say 「しめはりつる」 while the subtitle keeps 「〆張鶴」 (types.ts
      // `eventCmSpoken`). The track therefore stores the spoken copy and not the
      // reading beside it: what a recording needs to remember is what it said,
      // and that is the string `voiceReadsNarration` compares against.
      scenes.map((scene) => ({
        role: scene.role,
        ...(scene.index === undefined ? {} : { index: scene.index }),
        text: eventCmSpoken(scene),
      })),
      {
        persona: EVENT_CM_PERSONA,
        voice: chosen.voice,
        // The same pause the pre-recording timeline assumes (timeline.ts).
        sceneGapMs: EVENT_CM_SCENE_GAP_MS,
      },
    );
    const attached = await attachTakeNarration(supabase, {
      takeId: take.id as string,
      brandId,
      userId: user.id,
      wav,
      track,
      role: "event_cm_voice",
      label: "イベント紹介動画のボイス",
      sourceRef: { narration_updated_at: brief.narration.updatedAt },
    });
    return Response.json({
      ok: true,
      materialId: attached.materialId,
      totalMs: track.totalMs,
      mock: track.mock,
      voiceId: chosen.id,
      voiceLabel: chosen.label,
    });
  } catch (voiceError) {
    return Response.json(
      {
        error:
          voiceError instanceof Error
            ? voiceError.message
            : "読み上げを作成できませんでした",
      },
      { status: 502 },
    );
  }
}

/**
 * Choose who reads it. Records the setting; records nothing aloud.
 *
 * Separate from POST because choosing and recording are different acts, and
 * conflating them produced the worst wait on the screen: pressing 「この声で
 * 読み上げる」 spent a minute in text-to-speech, closed the dialog, and left a
 * player that had not changed — the recording was made but the film had not
 * been fixed, so nothing the user could see was different. Now the choice saves
 * instantly, shows up as an unreflected change like any other, and the reading
 * happens when the one button runs (docs/video-state-model.md §3.5).
 *
 * Choosing a voice is also the decision to have a narration, so it withdraws a
 * previous "off" — the same rule POST follows, for the same reason.
 */
export async function PATCH(
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

  let voiceId: string | null = null;
  try {
    const body = (await req.json()) as { voiceId?: unknown } | null;
    if (typeof body?.voiceId === "string") voiceId = body.voiceId;
  } catch {
    // Falls through to the 400 below: this call is only ever about a choice.
  }
  const chosen = voicePresetById(voiceId);
  if (!chosen) {
    return Response.json({ error: "その声は選べません" }, { status: 400 });
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

  const stored = take.brief as EventCmBrief;
  const next = setSuppressed({ ...stored, narrator: chosen.id }, "voice", false);
  const validated = validateBrief("event-cm", next);
  if (!validated.ok) {
    return Response.json(
      { error: `声を変更できません: ${validated.issues.join(", ")}` },
      { status: 400 },
    );
  }
  const saved = await supabase
    .from("takes")
    .update({ brief: validated.brief, updated_at: new Date().toISOString() })
    .eq("id", take.id);
  if (saved.error) {
    return Response.json({ error: saved.error.message }, { status: 500 });
  }
  return Response.json({ ok: true, voiceId: chosen.id, voiceLabel: chosen.label });
}

/**
 * Turn the narration off.
 *
 * Only the brief's pointer is cleared. The WAV stays in R2 and stays pinned to
 * the take, because deleting the recording would make "off" an irreversible
 * act — and because the material list is where a person looks for what this
 * take is made of. Off means the film stops speaking: the timeline falls back
 * to estimating from the narration, the captions come from the narration's own text,
 * and the music plays at full level throughout. All three of those are
 * behaviours the composition already had for a take that had never been read
 * aloud (remotion/event-cm/timeline.ts), which is why this needs nothing else.
 */
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

  const stored = take.brief as EventCmBrief;
  if (!stored.voice && isSuppressed(stored, "voice")) {
    return Response.json({ ok: true, alreadyOff: true });
  }
  // Off is RECORDED, not merely enacted.
  //
  // Clearing the pointer alone made "off" indistinguishable from "never spoken",
  // and the one button always reaches a recording (§9.9) — so the next run would
  // hand back a narration the user had just removed. Written as a suppression
  // because that is what the brief already calls a decision to leave something
  // out, and it is reversible in the same way (§9.3).
  const brief = setSuppressed({ ...stored }, "voice", true);
  delete brief.voice;

  const validated = validateBrief("event-cm", brief);
  if (!validated.ok) {
    return Response.json(
      { error: `読み上げを外せません: ${validated.issues.join(", ")}` },
      { status: 400 },
    );
  }
  const saved = await supabase
    .from("takes")
    .update({ brief: validated.brief, updated_at: new Date().toISOString() })
    .eq("id", take.id);
  if (saved.error) {
    return Response.json({ error: saved.error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
