// What the player is showing, and what the workbench holds that it is not.
//
// The storyboard edits `brief`. The player, the MP4 renderer and the public URL
// read `baked_brief` — the copy a run fixed (migration 0050,
// docs/old/event-cm-refactor-plan.md §9.5). So the two disagree by design, and the
// screen's job is to say by how much rather than to hide it.
//
// This module is the only place that answers "how much", and it answers it
// FIELD BY FIELD (docs/video-state-model.md §3.2). Every surface reads the same
// list — the pipeline's badge, the one button's count, the notice under the
// player, the chips in the fact list — because a badge saying 2 over a notice
// saying nothing is how the last round of bugs started.
//
// Compared on the STORED form of the two briefs, which is what makes a field
// comparison possible at all: stored, a photograph is `material:<uuid>` and
// stays that string forever. The client's copy has those pointers replaced by
// signed URLs that are re-minted on every load, so comparing THAT would report
// a change on a page refresh. Hence the rule this module depends on: it is
// called by API routes, never by the browser (§3.3).
//
// It used to compare three timestamps instead. That could not name what had
// changed, and worse, one of the three (`factsUpdatedAt`) deliberately ignores
// music, photographs and logos — so replacing the BGM moved nothing, the badge
// read 0, and the player went on playing the old track with no way to tell.

import { isSuppressed, isSpokenFact } from "./facts";
import { voicePresetByName } from "@/lib/voice/voices";
import { EVENT_CM_GOAL } from "@/lib/pipeline/event-cm";
import {
  EVENT_CM_VOICE_PATH,
  eventCmSceneKey,
  eventCmSpoken,
  narrationStaleness,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

/**
 * One field the workbench holds differently from the played film.
 *
 * Named with the same path and the same label the fact list uses, so "what is
 * unreflected" and "where do I correct it" are the same word on screen.
 */
export interface BakeChange {
  /** A goal path: "bgm" / "visuals.value" / "guests[0].photo" / "narration". */
  path: string;
  /** The user's word for it: 「BGM」「主役の写真」. */
  label: string;
  /** What reflecting this change costs. Music needs no re-reading (§3.5). */
  needs: FilmStep[];
}

/**
 * The changed fields, in the user's words, short enough to sit under a player.
 *
 * Folded at three because a structuring run can rewrite a dozen fields at once,
 * and a notice that grows into a wall stops being read — but a bare number
 * ("12件") does not answer the only question worth asking, which is *what*.
 */
export function describeChanges(changes: BakeChange[], limit = 3): string {
  const named = changes.slice(0, limit).map((change) => change.label);
  const rest = changes.length - named.length;
  return rest > 0 ? `${named.join("、")}、他${rest}件` : named.join("、");
}

export interface BakeState {
  /**
   * Whether this video has ever been run.
   *
   * `false` is the ordinary opening state, not an error: a take plays from its
   * own seeded brief the moment it is created, which is the product's whole
   * first impression. The screen answers it with guidance (§9.9).
   */
  baked: boolean;
  /** Empty when the player is showing everything the workbench has. */
  changes: BakeChange[];
}

/**
 * The step the one button still has to take.
 *
 * `bake` is the fixing itself: copying the working brief over the played one.
 * It is last because the two before it change what would be copied.
 */
export type FilmStep = "narration" | "voice" | "bake";

export const FILM_STEP_LABEL: Record<FilmStep, string> = {
  narration: "ナレーションを書く",
  voice: "読み上げる",
  // 「動画プレビュー」 so it cannot be read as the MP4 (docs/video-state-model.md §2).
  bake: "動画プレビューに反映する",
};

/** The order the one button runs them in. Fixing is always last. */
const FILM_STEP_ORDER: readonly FilmStep[] = ["narration", "voice", "bake"];

/**
 * The value of one field, in a form two briefs can be compared by.
 *
 * Reads the STORED brief, so `material:<uuid>` pointers compare as themselves.
 * A field the film does not draw has no entry and is therefore never a change —
 * which is the same rule as "a brief may only hold fields some scene draws".
 */
function factValueOf(brief: EventCmBrief, path: string): string {
  const guestPhoto = /^guests\[(\d+)\]\.photo$/.exec(path);
  if (guestPhoto) {
    return JSON.stringify(brief.guests[Number(guestPhoto[1])]?.photo ?? null);
  }
  switch (path) {
    // The words, not their clock: a narration rewritten to the same sentences is
    // the same narration, and re-running the writer must not invent a change.
    case "narration":
      return JSON.stringify(
        brief.narration.scenes.map((scene) => [eventCmSceneKey(scene), scene.text]),
      );
    // The recording's own stamp, never `voice.audio`: that pointer is rewritten
    // as a freshly signed URL for the client, and a re-record of the same words
    // is still a different recording.
    case "voice":
      return brief.voice?.track.generatedAt ?? "";
    // Who was asked to read it. Absent means the standard narrator, and an
    // absent setting must compare equal to an absent setting.
    case "narrator":
      return brief.narrator ?? "";
    // People are compared by who they are; their portraits have their own paths
    // above, so replacing a photograph says 「◯◯の写真」 rather than 「登壇者」.
    case "guests":
      return JSON.stringify(brief.guests.map((guest) => [guest.name, guest.role]));
    case "programs":
      return JSON.stringify(brief.programs.map((program) => program.title));
    case "valueLines":
      return JSON.stringify(brief.valueLines);
    case "logos":
      return JSON.stringify(brief.logos);
    case "visuals.value":
      return JSON.stringify(brief.visuals.value);
    case "visuals.programs":
      return JSON.stringify(brief.visuals.programs);
    case "visuals.closing":
      return JSON.stringify(brief.visuals.closing);
    case "bgm":
      return brief.bgm ?? "";
    case "title":
      return brief.title;
    case "subtitle":
      return brief.subtitle;
    case "seriesLabel":
      return brief.seriesLabel;
    case "presenter":
      return brief.presenter;
    case "valueChip":
      return brief.valueChip ?? "";
    case "cta":
      return brief.cta;
    case "schedule.date":
      return brief.schedule.date;
    case "schedule.time":
      return brief.schedule.time;
    case "schedule.venue":
      return brief.schedule.venue ?? "";
    case "schedule.fee":
      return brief.schedule.fee ?? "";
    default:
      return "";
  }
}

/**
 * Every field worth comparing, with the word the screen calls it.
 *
 * The goal's list plus one row per speaker's portrait, taken from whichever
 * brief has more people: a speaker who was added still has a portrait slot to
 * differ in, and one who was removed is already reported through `guests`.
 */
function comparableFields(
  working: EventCmBrief,
  baked: EventCmBrief,
): Array<{ path: string; label: string }> {
  const fields = EVENT_CM_GOAL.map((field) => ({
    path: field.path,
    label: field.label,
  }));
  // Not in the goal, because it is never missing — there is always a narrator,
  // and a fact list row saying so would be a row nobody can act on. It is still
  // a setting somebody changes and therefore something the film can be behind.
  fields.push({ path: "narrator", label: "ボイスの声" });
  // Same reasoning, and the same shape: never missing, so not a goal row, but a
  // decision the played film can be behind on. It has no VALUE at all — only an
  // on/off — which the suppression half of the comparison above already covers.
  fields.push({ path: "captions", label: "字幕" });
  const people = Math.max(working.guests.length, baked.guests.length);
  for (let index = 0; index < people; index += 1) {
    const name = working.guests[index]?.name ?? baked.guests[index]?.name ?? "";
    fields.push({ path: `guests[${index}].photo`, label: `${name}の写真` });
  }
  return fields;
}

/**
 * What reflecting one field costs.
 *
 * The knowledge is already written down: `isSpokenFact` knows which fields the
 * narration could be reading. Changing one of those means the words describe an
 * older event, so they get rewritten and read again; changing the music or a
 * photograph means neither. That is why replacing the BGM reflects in seconds
 * and costs nothing, while correcting the date does not.
 *
 * The two standing refusals apply here as they do everywhere: hand-written
 * words are never rewritten, and a narration switched off is not turned back on.
 */
function needsFor(path: string, working: EventCmBrief): FilmStep[] {
  const steps: FilmStep[] = [];
  // Changing the reader changes the recording and not one word of it, so the
  // writer stays out of it — the same reason swapping the music costs nothing.
  const spoken = path === "narration" || (path !== "narrator" && isSpokenFact(path));
  const rerecord = spoken || path === "narrator";

  if (spoken && path !== "narration" && working.narration.source !== "human") {
    steps.push("narration");
  }
  if (rerecord && !voiceIsOff(working) && working.narration.scenes.length > 0) {
    steps.push("voice");
  }
  steps.push("bake");
  return steps;
}

/**
 * Field by field, what the workbench holds that the played film does not.
 *
 * Includes being switched off: a suppressed field is emptied before the film is
 * drawn and before the narration is written, so deciding to hide the venue is a
 * change to the venue.
 */
export function bakeChanges(
  working: EventCmBrief,
  baked: EventCmBrief | null,
): BakeChange[] {
  // Never run: there is no played film to be ahead of. The screen answers this
  // state with guidance rather than a count (§9.9).
  if (!baked) return [];

  return comparableFields(working, baked)
    .filter(
      (field) =>
        factValueOf(working, field.path) !== factValueOf(baked, field.path) ||
        isSuppressed(working, field.path) !== isSuppressed(baked, field.path),
    )
    .map((field) => ({
      path: field.path,
      label: field.label,
      needs: needsFor(field.path, working),
    }));
}

/**
 * Whether the recording says what the narration now says.
 *
 * Compared text by text against the scene it was read for, rather than by
 * timestamp: a narration that was rewritten to the same words is the same
 * narration, and a take whose clock moved is not a reason to spend a TTS call.
 *
 * Against the SPOKEN copy of each line, which is the reading when one was given
 * (types.ts `eventCmSpoken`). The recording stores what it said, so comparing it
 * to the subtitle would report every line with a reading as stale forever — a
 * permanent 「録音が古い」 on a take that is perfectly current, and one that no
 * amount of re-recording could clear.
 *
 * A recording is what fixes the film's length (§9.9), so this is also the
 * question "does the player know how long this film is".
 */
export function voiceReadsNarration(brief: EventCmBrief): boolean {
  const track = brief.voice?.track;
  if (!track) return false;
  const lines = brief.narration.scenes;
  if (track.scenes.length !== lines.length) return false;
  const spoken = new Map(
    track.scenes.map((scene) => [eventCmSceneKey(scene), scene.text] as const),
  );
  return lines.every((line) => spoken.get(eventCmSceneKey(line)) === eventCmSpoken(line));
}

/**
 * Whether the user switched the narration off.
 *
 * Recorded as an ordinary suppression, so "I do not want a voice" is stored the
 * same way as "I do not want the venue on screen" — a decision, not an empty
 * field. Without it the two decided rules collide: the one button must always
 * reach a recording (§9.9), and a narration that was turned off must stay off
 * (§9.3). The first would silently undo the second on the next run.
 */
export const voiceIsOff = (brief: EventCmBrief): boolean =>
  isSuppressed(brief, EVENT_CM_VOICE_PATH);

/**
 * Whether the recording is in the voice that was asked for.
 *
 * Separate from `voiceReadsNarration`, which asks whether it says the right
 * words. Choosing a different narrator leaves the words untouched and the
 * recording wrong, and without this the setting could be saved, fixed into the
 * film, and never acted on — the film keeping a voice nobody chose.
 */
export function voiceUsesNarrator(brief: EventCmBrief): boolean {
  const recorded = brief.voice?.track.voice;
  if (!recorded) return true;
  // Nobody has asked for a particular voice, so whatever was recorded is the
  // one that was wanted. Takes recorded before the presets existed carry voice
  // names that map to no preset, and treating those as a mismatch would put a
  // permanent 読み上げ on the button and spend a TTS call to replace a
  // narration nobody had complained about.
  if (!brief.narrator) return true;
  return voicePresetByName(recorded)?.id === brief.narrator;
}

/**
 * How far the played film is behind the workbench.
 *
 * `baked` null = never run, which is guidance rather than a difference.
 */
export function bakeState(
  working: EventCmBrief,
  baked: EventCmBrief | null,
): BakeState {
  return { baked: Boolean(baked), changes: bakeChanges(working, baked) };
}

/**
 * What the one button will do to this video, in order.
 *
 * The count of these is the badge. It is a forward projection, not a status
 * scan: writing the narration makes the recording stale, and a recording makes
 * the fixed copy stale, so a step that WILL become necessary is listed now.
 * A badge that says 1 and then runs three steps is worse than no badge.
 *
 * Two things are never listed:
 *   - a hand-written narration. It is not overwritten, and counting a change
 *     nobody will make is what makes a badge unclearable (§9.8).
 *   - a narration the user switched off. See `voiceIsOff`.
 *
 * MP4 is not here at all. Export is outside the chain (§9.4) — putting it in
 * would run a several-minute render every time somebody tried a voice.
 */
export function pendingFilmSteps(
  working: EventCmBrief,
  baked: EventCmBrief | null,
  options: {
    /**
     * Ask for everything again, because the user pressed the button with
     * nothing pending. Every step here is a model call, and a draft that came
     * out slightly wrong is an ordinary reason to ask again — the same reason
     * the reading stages stay pressable when their badge is empty.
     *
     * It does not override the two refusals: hand-written words and a narration
     * switched off are decisions, not stale state.
     */
    redo?: boolean;
  } = {},
): FilmStep[] {
  const steps = new Set<FilmStep>();

  // What the WORKING brief owes on its own, whatever the player is showing: a
  // narration nobody has written yet, or one describing an older event, and a
  // recording that does not say what the narration now says.
  const handWritten = working.narration.source === "human";
  const unwritten = working.narration.scenes.length === 0;
  const narrationPending =
    !handWritten && (options.redo || unwritten || narrationStaleness(working) !== null);
  if (narrationPending) steps.add("narration");

  // Always reached unless it was switched off or there is nothing to read: the
  // length of the film is not known until something has been spoken, so "no
  // recording" is pending work rather than a finished state.
  //
  // `narrationPending` counts as words-to-come, which is what keeps the badge a
  // projection: writing the narration is what makes the recording necessary. But
  // a narration nobody is going to write — hand-authored and still empty — has
  // nothing to read, and listing it would promise a step that answers 409.
  const voicePending =
    !voiceIsOff(working) &&
    (narrationPending ||
      (!unwritten &&
        (options.redo ||
          !working.voice ||
          !voiceReadsNarration(working) ||
          !voiceUsesNarrator(working))));
  if (voicePending) steps.add("voice");

  // And what the DIFFERENCES cost. Each field says for itself, so a video whose
  // only change is its music asks for the fixing step alone — one that runs in
  // seconds and spends nothing (§3.5).
  for (const change of bakeChanges(working, baked)) {
    for (const step of change.needs) steps.add(step);
  }

  // Never run is NOT owed work.
  //
  // `!baked` used to add the fixing step on its own, which contradicted the
  // rule `bakeChanges` states two hundred lines up — 「there is no played film
  // to be ahead of; the screen answers this state with guidance rather than a
  // count」 (§9.9). The two disagreed and the badge won: a take opened seconds
  // after it was created showed outstanding work against a film nobody had
  // touched. Nothing was actually owed — the player reads `baked ?? working`
  // and so does the renderer, so an unbaked take plays and exports exactly what
  // it holds.
  //
  // The fixing step is owed when something above produced words or a recording
  // that the played film does not have yet, or when a field was edited. Asking
  // for everything again (`redo`) still reaches it, because that is a person
  // pressing the button on purpose.
  if (options.redo || steps.size > 0) steps.add("bake");
  return FILM_STEP_ORDER.filter((step) => steps.has(step));
}

/**
 * Everything a screen needs to say how far the player is behind — computed once,
 * on the server, and handed over (docs/video-state-model.md §4).
 *
 * The surfaces that read it (the notice under the player, the badge on the one
 * button, the chips in the fact list, the marks on the storyboard, the bar's
 * last stage) do not recompute any part of it. They rephrase it.
 */
export interface FilmPending {
  /** When the played film was fixed. Null = never run: guidance, not a warning. */
  bakedAt: string | null;
  changes: BakeChange[];
  /** What the one button will run now. */
  steps: FilmStep[];
  /**
   * What it would run if asked with nothing outstanding.
   *
   * Sent alongside because the button stays pressable at zero — a draft that
   * came out slightly wrong is an ordinary reason to ask again — and its label
   * has to name what that press would do without the browser working it out.
   */
  redoSteps: FilmStep[];
}

/**
 * Which of the four things the player is, in one word.
 *
 * Data rather than a chain of ternaries in the component, because getting it
 * wrong is invisible in a screenshot: the first attempt called a take "settled"
 * whenever it matched the storyboard, and one of the three real takes then
 * showed a green 「最新の状態です」 directly above a button reading 未処理3件.
 * Matching the workbench and being finished are different questions.
 *
 *   unrun     never run — plays the draft. Guidance, not a warning (§9.9)
 *   behind    the workbench has changes the film does not (amber)
 *   matched   plays exactly the storyboard, and there is still work in it
 *   settled   nothing outstanding anywhere (green)
 */
export type FilmStatus = "unrun" | "behind" | "matched" | "settled";

export function filmStatus(
  state: Pick<BakeState, "baked" | "changes">,
  steps: FilmStep[],
): FilmStatus {
  if (!state.baked) return "unrun";
  if (state.changes.length > 0) return "behind";
  return steps.length > 0 ? "matched" : "settled";
}

export function filmPending(
  working: EventCmBrief,
  baked: EventCmBrief | null,
  bakedAt: string | null,
): FilmPending {
  return {
    bakedAt,
    changes: bakeChanges(working, baked),
    steps: pendingFilmSteps(working, baked),
    redoSteps: pendingFilmSteps(working, baked, { redo: true }),
  };
}

/**
 * Whether the exported MP4 is older than the film the player shows.
 *
 * Both timestamps or nothing: a video with no export has no stale export, and
 * one that has never been run has nothing to be older than.
 */
export const renderIsBehind = (
  renderedAt: string | null,
  bakedAt: string | null,
): boolean =>
  Boolean(renderedAt && bakedAt && new Date(renderedAt) < new Date(bakedAt));
