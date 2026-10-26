import {
  EVENT_CM_CHARS_PER_SECOND,
  eventCmSceneBudget,
  eventCmSceneKey,
  eventCmScenePlan,
  eventCmSpoken,
  type EventCmBrief,
  type EventCmSceneRole,
  type EventCmSceneStep,
} from "./types";

// How long each scene runs.
//
// The film exists before the narration does, and before the voice does. So the
// timeline is derived from whatever is known, and each stage sharpens it:
//
//   nothing written   → the scene budget (types.ts eventCmSceneBudget)
//   narration written  → the characters actually written, at reading pace
//   voice recorded    → the measured track, which is the truth
//
// This is why a seeded take can be handed over as a finished film with no LLM
// call and no render: "add a video" produces something that plays. Writing the
// narration changes the timing; speaking it changes it again. Nothing along
// the way is a placeholder frame or a spinner.

export interface SceneTiming {
  role: EventCmSceneRole;
  /** Which item, when the role repeats (programmes). */
  index?: number;
  fromMs: number;
  durationMs: number;
}

export type TimingSource = "budget" | "narration" | "voice";

export interface EventCmTimeline {
  scenes: SceneTiming[];
  totalMs: number;
  /** What the durations came from — the screen says which, honestly. */
  source: TimingSource;
  /** When the narration starts. Music runs alone before it. */
  voiceStartMs: number;
  /** When the narration ends, so the music can come back up under the close. */
  voiceEndMs: number;
}

// Per picture, not per role: the second and third programme pictures carry a
// shorter line than a lone programme list, and their unwritten fallback should
// say so too (types.ts eventCmSceneBudget).
const budgetMs = (step: EventCmSceneStep): number => {
  const budget = eventCmSceneBudget(step);
  const chars = (budget.min + budget.max) / 2;
  return (
    Math.round((chars / EVENT_CM_CHARS_PER_SECOND) * 1000) + EVENT_CM_SCENE_GAP_MS
  );
};

/** A beat needs long enough to be read even when its line is short. */
const MIN_SCENE_MS = 2500;

/**
 * The opening: the presenter's mark, with music alone.
 *
 * A film that starts talking on frame one has no opening, and a viewer who
 * reaches the end without knowing whose film it was has been told nothing about
 * the brand. This is also the only moment where the music plays at full level.
 *
 * Four seconds, not the second and a half it started as. A mark that appears and
 * vanishes inside a second reads as a glitch rather than a credit — long enough
 * to be recognised is the whole requirement.
 */
export const EVENT_CM_INTRO_MS = 4000;

/** The close: the mark again, fading, with the music coming back up. */
export const EVENT_CM_OUTRO_MS = 4000;

/**
 * The pause after each narrated scene.
 *
 * Each picture is a chapter, and chapters need air between them: without it the
 * film reads as one breathless run-on, and the next line starts before the last
 * one has landed. The music does not stop — only the voice waits.
 *
 * The voice generator inserts the same gap between its sections
 * (app/api/.../voice/route.ts), so the pre-recording estimate and the measured
 * track describe the same rhythm rather than two different films.
 *
 * The consequence is a longer film: 30 seconds was never the requirement, the
 * right length is. Forty-five is fine.
 */
export const EVENT_CM_SCENE_GAP_MS = 900;

const silentMs = (role: EventCmSceneRole): number =>
  role === "logoIn" ? EVENT_CM_INTRO_MS : EVENT_CM_OUTRO_MS;

export function eventCmTimeline(brief: EventCmBrief): EventCmTimeline {
  const plan = eventCmScenePlan(brief);
  const narrated = plan.filter((step) => step.narrated);
  // Keyed by scene identity, not by role: three programme pictures are three
  // different lines, and looking them up by role would give all three the first
  // one's length.
  // The SPOKEN copy, which is not always the written one: a line with a reading
  // is read from the reading, so that is the text whose length this scene will
  // take (types.ts `eventCmSpoken`). Estimating from 「〆張鶴」 while the voice
  // says 「しめはりつる」 would make every such scene short before the recording
  // lands and correct after it — the kind of drift that looks like a renderer bug.
  const spoken = new Map(
    brief.narration.scenes.map((scene) => [eventCmSceneKey(scene), eventCmSpoken(scene)]),
  );
  // Any line at all means the timing is being read from the narration; a scene with
  // nothing written falls back to its budget on its own (see `writtenMs`).
  const written = narrated.some(
    (step) => (spoken.get(eventCmSceneKey(step)) ?? "").trim().length > 0,
  );

  const track = brief.voice?.track;
  const measured = track && track.scenes.length === narrated.length ? track : null;

  // Per role, not per film. A flyer that names a speaker adds a scene the narration
  // has no line for yet, and collapsing every other scene back to its budget
  // because of that one would throw away timings that are still right.
  const writtenMs = (step: EventCmSceneStep): number => {
    const text = (spoken.get(eventCmSceneKey(step)) ?? "").replace(/\s/g, "");
    if (text.length === 0) return budgetMs(step);
    return (
      Math.max(
        MIN_SCENE_MS,
        Math.round((text.length / EVENT_CM_CHARS_PER_SECOND) * 1000),
      ) + EVENT_CM_SCENE_GAP_MS
    );
  };

  // Measured: the narration's own boundaries decide the cuts, so a scene lasts
  // until the next line starts rather than until its own audio stops. A gap
  // between lines would otherwise show an empty stage for a beat.
  const spans = measured
    ? narrated.map((step, at) => {
        const start = EVENT_CM_INTRO_MS + measured.scenes[at].startMs;
        const nextStart =
          at + 1 < measured.scenes.length
            ? EVENT_CM_INTRO_MS + measured.scenes[at + 1].startMs
            : EVENT_CM_INTRO_MS +
              (measured.totalMs ??
                measured.scenes.reduce((total, scene) => total + scene.durationMs, 0));
        return { step, durationMs: Math.max(1, nextStart - start) };
      })
    : narrated.map((step) => ({ step, durationMs: writtenMs(step) }));

  const byKey = new Map(spans.map((span) => [eventCmSceneKey(span.step), span]));
  const scenes: SceneTiming[] = [];
  let cursor = 0;
  for (const step of plan) {
    const durationMs = step.narrated
      ? (byKey.get(eventCmSceneKey(step))?.durationMs ?? budgetMs(step))
      : silentMs(step.role);
    // Laid end to end whatever the source: the measured spans are already
    // contiguous, and reading them through the cursor keeps one rule for where a
    // scene starts.
    scenes.push({
      role: step.role,
      ...(step.index === undefined ? {} : { index: step.index }),
      fromMs: cursor,
      durationMs,
    });
    cursor += durationMs;
  }

  const spokenScenes = scenes.filter((scene) => scene.role !== "logoIn" && scene.role !== "logoOut");
  const first = spokenScenes[0];
  const last = spokenScenes[spokenScenes.length - 1];

  return {
    scenes,
    totalMs: cursor,
    source: measured ? "voice" : written ? "narration" : "budget",
    voiceStartMs: first?.fromMs ?? EVENT_CM_INTRO_MS,
    voiceEndMs: last ? last.fromMs + last.durationMs : cursor,
  };
}

/**
 * A length in frames. Never zero — a scene that rounds to no frames at all
 * would silently not exist.
 */
export const msToFrames = (ms: number, fps: number): number =>
  Math.max(1, Math.round((ms / 1000) * fps));

/**
 * A moment in frames. Distinct from `msToFrames` because a *timestamp* of zero
 * is zero: clamping it to one frame started the film's first scene at frame 1
 * and left frame 0 with nothing on it but the background. Invisible at 1/30s,
 * and wrong — the storyboard found it by asking where the first cut is.
 */
export const msToFrame = (ms: number, fps: number): number =>
  Math.max(0, Math.round((ms / 1000) * fps));
