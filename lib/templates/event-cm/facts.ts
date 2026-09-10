import {
  EVENT_CM_GOAL,
} from "@/lib/pipeline/event-cm";
import {
  EVENT_CM_SUPPRESSED_NOTE,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

// The facts a video is made of, as an editable list.
//
// This is the input surface, and it is deliberately the same list that sits
// under the preview saying where each value came from. A separate form would
// mean reading one screen and typing into another; here the thing that says
// "this date is a guess" is the thing you correct it in.
//
// The stance is different from a document that must not be wrong. This fills
// everything in confidently and then admits, in the open, which parts it made
// up — because the user is passive: they react to what appeared, they do not
// brief it. So there is no "XXX", and there is no empty state to stare at.
//
// Three operations, and no others:
//   edit      replace the value. Origin becomes `user` and no re-run overwrites it.
//   suppress  keep the field but take it off screen. A DECISION, not a gap.
//   restore   undo a suppression.

export type FactInput =
  /** One line of text. */
  | "text"
  /** Several lines, one per row — value lines, programme titles. */
  | "lines"
  /** Not editable here: an asset, changed by adding material. */
  | "asset"
  /** Not editable here: produced by a stage of its own. */
  | "generated";

export interface FactField {
  path: string;
  label: string;
  required: boolean;
  input: FactInput;
  /** Shown under the field when it needs saying. */
  hint?: string;
}

const INPUT_BY_PATH: Record<string, FactInput> = {
  title: "text",
  subtitle: "text",
  seriesLabel: "text",
  presenter: "text",
  valueLines: "lines",
  valueChip: "text",
  programs: "lines",
  guests: "generated",
  "schedule.date": "text",
  "schedule.time": "text",
  "schedule.venue": "text",
  "schedule.fee": "text",
  cta: "text",
  logos: "asset",
  "visuals.value": "asset",
  "visuals.programs": "asset",
  "visuals.closing": "asset",
  bgm: "asset",
  narration: "generated",
  voice: "generated",
};

/**
 * Slots that have their own control elsewhere on the screen.
 *
 * BGM is chosen in its own dialog from the header, next to the reading-aloud
 * one, because music is always present and always the same question ("which
 * one") — which a list of facts answers badly.
 */
const HANDLED_ELSEWHERE = new Set(["bgm"]);

export const FACT_FIELDS: FactField[] = EVENT_CM_GOAL.filter(
  (field) => !HANDLED_ELSEWHERE.has(field.path),
).map((field) => ({
  path: field.path,
  label: field.label,
  required: field.required,
  input: INPUT_BY_PATH[field.path] ?? "generated",
  ...(field.path === "guests"
    ? { hint: "人名は推測で埋めません。登壇者は自分で入れてください" }
    : {}),
}));

/** The photograph slots the film draws. Chosen from material, never typed. */
export const PHOTO_SLOTS = [
  "visuals.value",
  "visuals.programs",
  "visuals.closing",
] as const;

const GUEST_PHOTO = /^guests\[(\d+)\]\.photo$/;

export const isPhotoSlot = (path: string): boolean =>
  (PHOTO_SLOTS as readonly string[]).includes(path) || GUEST_PHOTO.test(path);

/**
 * The list for one brief, portraits included.
 *
 * A speaker's photograph is a slot like any other, but how many there are
 * depends on how many speakers were announced — so the list cannot be a
 * constant. Portraits appear whether or not one has been placed: an empty row
 * is where a person goes to choose the picture the automatic pass would not
 * commit to.
 */
export function factFieldsFor(brief: EventCmBrief): FactField[] {
  return [
    ...FACT_FIELDS,
    ...brief.guests.map((guest, index) => ({
      path: `guests[${index}].photo`,
      label: `${guest.name}の写真`,
      required: false,
      input: "asset" as const,
    })),
  ];
}

/** A value as it should read in the list. Never the raw JSON. */
export function previewOf(brief: EventCmBrief, path: string): string {
  switch (path) {
    case "valueLines":
      return brief.valueLines.join("");
    case "programs":
      return brief.programs.map((program) => program.title).join(" / ");
    case "guests":
      return brief.guests.map((guest) => guest.name).join("、");
    case "logos":
      return brief.logos.map((logo) => logo.name).join("、");
    case "visuals.value":
      return brief.visuals.value ? "写真あり" : "";
    case "visuals.programs":
      return brief.visuals.programs ? "写真あり" : "";
    case "visuals.closing":
      return brief.visuals.closing ? "写真あり" : "";
    case "bgm":
      return brief.bgm ? "あり" : "";
    case "narration":
      return brief.narration.scenes.length > 0
        ? brief.narration.scenes.map((scene) => scene.text).join("").slice(0, 60)
        : "";
    case "voice":
      return brief.voice ? `${Math.round(brief.voice.track.totalMs / 1000)}秒` : "";
    default: {
      const guest = GUEST_PHOTO.exec(path);
      if (guest) return brief.guests[Number(guest[1])]?.photo ? "写真あり" : "";
      const value = readScalar(brief, path);
      return value ?? "";
    }
  }
}

/** The image a photo slot currently holds, for a thumbnail. Null when empty. */
export function photoOf(brief: EventCmBrief, path: string): string | null {
  const guest = GUEST_PHOTO.exec(path);
  if (guest) return brief.guests[Number(guest[1])]?.photo?.src ?? null;
  switch (path) {
    case "visuals.value":
      return brief.visuals.value?.src ?? null;
    case "visuals.programs":
      return brief.visuals.programs?.src ?? null;
    case "visuals.closing":
      return brief.visuals.closing?.src ?? null;
    default:
      return null;
  }
}

/** The editable form of a value: one string per line for `lines`. */
export function editableValue(brief: EventCmBrief, path: string): string[] {
  switch (path) {
    case "valueLines":
      return [...brief.valueLines];
    case "programs":
      return brief.programs.map((program) => program.title);
    default:
      return [readScalar(brief, path) ?? ""];
  }
}

function readScalar(brief: EventCmBrief, path: string): string | null {
  switch (path) {
    case "title":
      return brief.title;
    case "subtitle":
      return brief.subtitle;
    case "seriesLabel":
      return brief.seriesLabel;
    case "presenter":
      return brief.presenter;
    case "valueChip":
      return brief.valueChip;
    case "schedule.date":
      return brief.schedule.date;
    case "schedule.time":
      return brief.schedule.time;
    case "schedule.venue":
      return brief.schedule.venue;
    case "schedule.fee":
      return brief.schedule.fee;
    case "cta":
      return brief.cta;
    default:
      return null;
  }
}

export const isEditable = (path: string): boolean => {
  const input = INPUT_BY_PATH[path];
  return input === "text" || input === "lines";
};

/**
 * Write an edited value back.
 *
 * Only the paths this file declares editable can be written. Returns null for
 * anything else, so a request naming an asset or a generated field is refused
 * rather than quietly ignored.
 */
export function applyFactEdit(
  brief: EventCmBrief,
  path: string,
  lines: string[],
): EventCmBrief | null {
  const clean = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  const first = clean[0] ?? "";

  switch (path) {
    case "title":
      return { ...brief, title: first };
    case "subtitle":
      return { ...brief, subtitle: first };
    case "seriesLabel":
      return { ...brief, seriesLabel: first };
    case "presenter":
      return { ...brief, presenter: first };
    case "valueChip":
      return { ...brief, valueChip: first || null };
    case "cta":
      return { ...brief, cta: first };
    case "valueLines":
      return { ...brief, valueLines: clean };
    case "programs":
      return { ...brief, programs: clean.map((title) => ({ title })) };
    case "schedule.date":
      return { ...brief, schedule: { ...brief.schedule, date: first } };
    case "schedule.time":
      return { ...brief, schedule: { ...brief.schedule, time: first } };
    case "schedule.venue":
      return { ...brief, schedule: { ...brief.schedule, venue: first || null } };
    case "schedule.fee":
      return { ...brief, schedule: { ...brief.schedule, fee: first || null } };
    default:
      return null;
  }
}

/**
 * Point an asset slot at a source.
 *
 * Asset slots are not typed into; they are chosen. `bgm` is the one that
 * matters today, because music is the asset nobody supplies and everybody
 * expects — and because a take created before the default pool existed has an
 * empty slot with no way to fill it.
 *
 * Deliberately NOT a render-time fallback. Letting the composition reach for
 * "whatever the pool currently holds" would mean an approved film changes when
 * the pool does; pinning the choice into the brief keeps a take rendering what
 * it was approved with.
 */
export function applyAssetChoice(
  brief: EventCmBrief,
  path: string,
  src: string | null,
): EventCmBrief | null {
  if (path === "bgm") return { ...brief, bgm: src };

  // Replacing a photograph keeps the framing. The focus point says where the
  // face or the subject sits in the frame, and a new picture arrives without
  // one — but the slot's existing framing was chosen for this composition, so
  // it stands until the new picture is read.
  const guest = GUEST_PHOTO.exec(path);
  if (guest) {
    const index = Number(guest[1]);
    if (!brief.guests[index]) return null;
    return {
      ...brief,
      guests: brief.guests.map((person, i) =>
        i === index ? { ...person, photo: photoValue(person.photo, src) } : person,
      ),
    };
  }

  const key = (PHOTO_SLOTS as readonly string[]).includes(path)
    ? (path.slice("visuals.".length) as "value" | "programs" | "closing")
    : null;
  if (key) {
    return {
      ...brief,
      visuals: { ...brief.visuals, [key]: photoValue(brief.visuals[key], src) },
    };
  }
  return null;
}

const photoValue = (
  current: { src: string; focus?: { x: number; y: number }; zoom?: number } | null,
  src: string | null,
) => (src === null ? null : { ...(current ?? {}), src });

export const isAssetSlot = (path: string): boolean =>
  path === "bgm" || isPhotoSlot(path);

/**
 * Record who decided this value. An edit is never overwritten by a re-run.
 *
 * Also stamps the facts as changed, which is what lets the narration know it
 * is out of date: a corrected date that leaves the voice announcing the old
 * one is worse than no correction at all.
 */
export function markUserEdited(
  brief: EventCmBrief,
  path: string,
  now: string = new Date().toISOString(),
): EventCmBrief {
  return {
    ...brief,
    ...(isSpokenFact(path) ? { factsUpdatedAt: now } : {}),
    provenance: {
      ...(brief.provenance ?? {}),
      [path]: { origin: "user" },
    },
  };
}

/**
 * Fields the narration could be reading.
 *
 * `factsUpdatedAt` exists for one job: telling the narration that it is
 * describing an older event (`narrationIsStale`). So it must move when a spoken
 * fact changes — and must not move for something the film only shows or plays.
 * Picking a different music track used to stamp it, which put 「ナレーションが
 * 書き直されていません」 on a film whose words were perfectly current. A warning
 * that appears when nothing is wrong is a warning people learn to ignore.
 *
 * `narration` and `voice` are here because they are the narration, not facts it
 * reads. Stamping when the words are written would make them stale the instant
 * they were saved, and switching the reading off would ask for a rewrite of a
 * narration nobody is going to speak.
 *
 * `theme` and `brandBase` are here for the music's reason: the palette and the
 * mark are seen, never said, so declining the brand's base restyles the film
 * without changing one word of what it announces.
 *
 * `captions` is here for the sharpest version of the same reason: the subtitles
 * ARE the narration, letter for letter. Switching them off changes who can read
 * the words, never what they say — so asking for a rewrite would be asking the
 * writer to fix something that is not wrong.
 */
const UNSPOKEN =
  /^(bgm$|logos$|theme$|brandBase$|captions$|visuals\.|guests\[\d+\]\.photo$|narration$|voice$|narrator$)/;

export const isSpokenFact = (path: string): boolean => !UNSPOKEN.test(path);

/**
 * Take a field off screen without losing it.
 *
 * Distinct from empty on purpose. An empty venue is something nobody has
 * confirmed and belongs on the collection list; a suppressed venue is a
 * decision not to show one, and must stop being asked about.
 *
 * Stamps the facts for the same reason an edit does. Switching a field off
 * changes what the film draws AND what it says — a suppressed field is not
 * spoken either (`applySuppression` empties it before the narration is written).
 * Without the stamp the change was invisible to everything downstream: the
 * narration stayed "current" while describing speakers that had been removed,
 * and `bakeState` — which compares these three stamps and nothing else —
 * reported no pending changes, so the one button had no step to run and the
 * player kept the deleted picture until somebody pressed it a second time.
 */
export function setSuppressed(
  brief: EventCmBrief,
  path: string,
  suppressed: boolean,
  now: string = new Date().toISOString(),
): EventCmBrief {
  const current = brief.provenance?.[path];
  const next = { ...(brief.provenance ?? {}) };
  if (suppressed) {
    next[path] = { ...(current ?? { origin: "user" }), note: SUPPRESSED_NOTE };
  } else if (current) {
    next[path] = { origin: current.origin };
  }
  return {
    ...brief,
    ...(isSpokenFact(path) ? { factsUpdatedAt: now } : {}),
    provenance: next,
  };
}

/** Marker kept in the note so no schema change is needed for a boolean.
 *  Defined in the data contract, because the film's SHAPE depends on it —
 *  `eventCmScenePlan` has to read it without importing this editing layer. */
export const SUPPRESSED_NOTE = EVENT_CM_SUPPRESSED_NOTE;

export const isSuppressed = (brief: EventCmBrief, path: string): boolean =>
  brief.provenance?.[path]?.note === SUPPRESSED_NOTE;

/** Paths the user has taken off screen. The renderer skips these. */
/**
 * Switching the BRAND'S BASE off for one deliverable.
 *
 * docs/asset-normalization.md §7.1. A collaboration sometimes has to carry the
 * partner's tone and none of ours — 「自社の雰囲気を完全に残さない」 — so the
 * base has to be declinable as one act rather than field by field.
 *
 * A suppression rather than a new column, for the same reason narration-off is
 * one: if switching it off only removed the values, the next run would put them
 * back, and 「基盤は必ず入る」 would quietly beat 「オフにできる」. Recorded as
 * a decision, it survives.
 *
 * What it takes off is the LOOK and the MARK — the two things the brand
 * contributes to a film's atmosphere (`seedEventCmFromBrand`: the palette and
 * type from BrandKnowledge, the mark from the canonical logo). What it leaves
 * alone are FACTS: the presenter is still whoever is presenting, and a film
 * that hid that would be lying rather than restyled.
 *
 * The mark is identified by position — `logos[0]` is the presenter's, which is
 * what the seed writes and what the opening and closing scenes draw. Partner
 * marks added later sit behind it and stay; with ours gone, the first of them
 * opens the film, which is what a collaboration under someone else's tone
 * looks like.
 */
export const BRAND_BASE_PATH = "brandBase";

export const brandBaseIsOff = (brief: EventCmBrief): boolean =>
  brief.provenance?.[BRAND_BASE_PATH]?.note === SUPPRESSED_NOTE;

export const suppressedPaths = (brief: EventCmBrief): string[] =>
  Object.entries(brief.provenance ?? {})
    .filter(([, entry]) => entry.note === SUPPRESSED_NOTE)
    .map(([path]) => path);

// NOTE: `applySuppression` — the brief with suppressed fields emptied — lives
// in remotion/event-cm/film.ts as a PRIVATE step of `eventCmFilm()`. It is not
// exported from anywhere on purpose: half of the 2026-08-14 bugs were callers
// deriving something from the raw brief because remembering to empty it first
// was their responsibility. A function nobody can call is a step nobody can
// skip. Anything that needs the drawn values reads `eventCmFilm(brief).drawn`.
