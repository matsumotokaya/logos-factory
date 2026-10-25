// The narration of one video — the main sentence of each panel (§9.1).
//
// POST writes a fresh draft from the take's own facts. PATCH stores an edit.
//
// This is the words, never the recording. Reading them aloud is a separate
// endpoint (./voice) because the voice is derived from this and not the other
// way round: subtitles are cut from these sentences whether or not anybody has
// paid for TTS, and the film's shape is decided here.
//
// The two differ in one field that decides everything downstream: `source`. A
// draft is `llm` and may be replaced by another draft; an edit is `human` and
// is never overwritten by a re-run unless the caller says so explicitly. That
// is what lets the golden path stay unattended — generate, speak, render, with
// nobody approving anything — while an edit still survives the next generation
// (the user's own framing: 直さなくても良い、直したければ直せる).

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { draftEventCmNarration, eventCmNarrationAvailable } from "@/lib/templates/event-cm/narration";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { validateBrief } from "@/lib/templates/brief-schemas";
import {
  eventCmSceneKey,
  type EventCmBrief,
  type EventCmSceneRole,
} from "@/remotion/event-cm/types";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

async function loadTake(
  supabase: ReturnType<typeof createServerSupabaseForToken>,
  brandId: string,
  videoId: string,
) {
  const { data, error } = await supabase
    .from("takes")
    .select("id, template_id, brief")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (error) return { error: "動画を確認できませんでした", status: 500 } as const;
  if (!data) return { error: "動画が見つかりません", status: 404 } as const;
  if (data.template_id !== "event-cm") {
    return { error: "このテンプレートはナレーションを持ちません", status: 400 } as const;
  }
  return { take: data } as const;
}

/** Write a brief back, validated against the template it is pinned to. */
async function saveBrief(
  supabase: ReturnType<typeof createServerSupabaseForToken>,
  takeId: string,
  brief: EventCmBrief,
) {
  const validated = validateBrief("event-cm", brief);
  if (!validated.ok) {
    return { error: `ナレーションが不正です: ${validated.issues.join(", ")}`, status: 400 } as const;
  }
  const { error } = await supabase
    .from("takes")
    .update({ brief: validated.brief, updated_at: new Date().toISOString() })
    .eq("id", takeId);
  if (error) return { error: error.message, status: 500 } as const;
  return { ok: true } as const;
}

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

  const loaded = await loadTake(supabase, brandId, videoId);
  if ("error" in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }
  if (!eventCmNarrationAvailable()) {
    return Response.json({ error: "ナレーションの生成が設定されていません" }, { status: 503 });
  }

  const brief = loaded.take.brief as EventCmBrief;
  const body = (await req.json().catch(() => ({}))) as { force?: unknown };
  if (brief.narration.source === "human" && body.force !== true) {
    return Response.json(
      { error: "編集済みのナレーションがあります。上書きするには force を指定してください" },
      { status: 409 },
    );
  }

  let draft;
  try {
    // Written against the brief AS THE FILM SEES IT. A field switched off is not
    // on screen, so it must not be spoken either — and, more mechanically, the
    // shape of the narration has to match the shape of the film: with the speakers
    // switched off there is no speaker picture, and a line written for one would
    // have nowhere to go.
    draft = await draftEventCmNarration(eventCmFilm(brief).drawn, {
      now: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ナレーションを生成できませんでした" },
      { status: 502 },
    );
  }

  // The recording stays.
  //
  // It used to be deleted here, on the reasoning that a voice reading replaced
  // words is a lie. The reasoning was right and the remedy was wrong: editing
  // is supposed to accumulate until the user decides to run (§9.2), and a film
  // that fell silent halfway through a rewrite was the editor reaching into the
  // result. Now the result does not move at all until it is baked, and the
  // disagreement is SAID instead — `voiceReadsNarration` (lib/event-cm/bake.ts)
  // is what the screen reads to say it.
  // A reading survives a redraft when the sentence it belongs to comes back
  // unchanged.
  //
  // The drafter never writes readings: how 「〆張鶴」 is pronounced is knowledge
  // about a name, not about this event, and it is the one thing on this screen a
  // human had to supply. Without this, pressing 「ナレーションを書き直す」 would
  // silently discard every reading and the next recording would mispronounce
  // lines that had already been fixed — once, quietly, with nothing on screen to
  // say why. A line whose WORDS changed does lose its reading, because a reading
  // of a sentence nobody says any more is not information about anything.
  const readings = new Map(
    brief.narration.scenes
      .filter((scene) => scene.reading)
      .map((scene) => [eventCmSceneKey(scene), scene] as const),
  );
  const narration = {
    ...draft.narration,
    scenes: draft.narration.scenes.map((scene) => {
      const before = readings.get(eventCmSceneKey(scene));
      return before && before.text === scene.text
        ? { ...scene, reading: before.reading }
        : scene;
    }),
  };
  const next: EventCmBrief = { ...brief, narration };

  const saved = await saveBrief(supabase, loaded.take.id as string, next);
  if ("error" in saved) {
    return Response.json({ error: saved.error }, { status: saved.status });
  }
  return Response.json({ narration });
}

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

  const loaded = await loadTake(supabase, brandId, videoId);
  if ("error" in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }

  let body: { scenes?: unknown; angle?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "リクエストを解釈できませんでした" }, { status: 400 });
  }
  if (!Array.isArray(body.scenes)) {
    return Response.json({ error: "ナレーションのシーンが必要です" }, { status: 400 });
  }

  // Keyed by scene identity: a caller editing the second programme's line sends
  // `{ role: "program", index: 1 }`, and keying by role alone would have written
  // that text over all three programme pictures.
  const texts = new Map<string, string>();
  const readings = new Map<string, string>();
  for (const raw of body.scenes) {
    if (!raw || typeof raw !== "object") continue;
    const scene = raw as {
      role?: unknown;
      index?: unknown;
      text?: unknown;
      reading?: unknown;
    };
    if (typeof scene.role === "string" && typeof scene.text === "string") {
      const key = eventCmSceneKey({
        role: scene.role as EventCmSceneRole,
        index: typeof scene.index === "number" ? scene.index : undefined,
      });
      texts.set(key, scene.text.trim());
      // Sent at all — including as "" — is how a reading is written and how it
      // is cleared. Absent leaves whatever was there, so a caller that edits
      // only the sentence does not silently throw the reading away.
      if (typeof scene.reading === "string") readings.set(key, scene.reading.trim());
    }
  }
  const brief = loaded.take.brief as EventCmBrief;
  // The narration holds the narrated PICTURES of this brief — four with nobody
  // announced, one per programme when several are listed — not all seven scenes.
  // Walking every role and reading the previous text by array index did both
  // wrong: it demanded words for the two silent mark scenes, and it lined line 1
  // up against scene 0. So the shape comes from the brief and previous text is
  // looked up by scene identity, which is also what lets a caller send one line
  // and keep the rest.
  // The film's shape, not the brief's raw contents: a suppressed field has no
  // picture. The brief itself is saved unsuppressed — switching a field off is a
  // decision to hide it, never to delete it.
  const steps = eventCmFilm(brief).scenes.filter((scene) => scene.narrated);
  const previous = new Map(
    brief.narration.scenes.map((scene) => [eventCmSceneKey(scene), scene] as const),
  );
  // A partial narration is a legal, ordinary state — not an error.
  //
  // This used to demand a line for every narrated picture, which made saving ONE
  // line impossible the moment the film gained a picture nobody had written yet:
  // splitting three programmes into three pictures left two of them blank, so
  // every single-line save was refused with 「空のシーンがあります」. Everything
  // downstream already handles a missing line: the timeline falls back to that
  // scene's budget, the captions skip it, and `narrationIsStale` reports that the
  // narration is not finished. So lines with no words are simply not stored, and
  // the order of the ones that are is the film's order.
  const scenes = steps
    .map((step) => {
      const before = previous.get(step.key);
      const reading = readings.has(step.key)
        ? (readings.get(step.key) as string)
        : (before?.reading ?? "");
      return {
        role: step.role,
        ...(step.index === undefined ? {} : { index: step.index }),
        text: texts.get(step.key) ?? before?.text ?? "",
        // Stored only when there is one. An empty reading is not a reading, and
        // a "" left in the brief would say "somebody decided this line needs
        // spelling out" for the rest of the take's life.
        ...(reading ? { reading } : {}),
      };
    })
    .filter((scene) => scene.text.length > 0);
  if (scenes.length === 0) {
    return Response.json(
      { error: "ナレーションの本文がありません" },
      { status: 400 },
    );
  }

  const next: EventCmBrief = {
    ...brief,
    narration: {
      version: 1,
      scenes,
      // The edit is the point of the record: a later draft will refuse to
      // overwrite this without being told to.
      source: "human",
      updatedAt: new Date().toISOString(),
      angle:
        typeof body.angle === "string" ? body.angle.trim() : (brief.narration.angle ?? ""),
    },
  };
  // The recording stays — see the POST handler. Saving one line is the smallest
  // edit there is, and it was the one that used to silence the film.

  const saved = await saveBrief(supabase, loaded.take.id as string, next);
  if ("error" in saved) {
    return Response.json({ error: saved.error }, { status: saved.status });
  }
  return Response.json({ narration: next.narration });
}
