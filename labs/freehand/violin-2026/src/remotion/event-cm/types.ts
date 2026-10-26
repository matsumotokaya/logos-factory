// Narrated event promo — the data contract.
//
// Same subject as `event-promo`, opposite spine. event-promo is a fixed 30s
// timeline (remotion/event/palette.ts EVENT_SCENES) that BGM and typography
// carry alone. Here the narration is written first and its timing decides the
// film: scene order comes from the narration's roles, scene length from the TTS
// track, exactly as product-cm does (remotion/cm/CmComposition.tsx).
//
// The art direction does not change — ink black × gold × mincho, the treatment
// proven by 世界が恋する日本酒.
//
// The brief USED to be `extends EventBrief`, which was convenient and wrong: it
// gave event-cm three fields no event-cm scene draws (`sideCopy`,
// `visuals.inkArt`, `visuals.texture` — event-promo's), and they surfaced in the
// goal and the fact list as things a user was invited to manage. Nothing on
// screen would ever change. So the two templates now share the VALUE types
// (a photo is a photo, a logo is a logo) and not each other's field lists.
//
// Facts are still never invented (docs/deliverable-architecture.md §17.2): the
// narration may only speak what the brief already knows. A null venue is not
// narrated as "会場は後日発表" — it is simply not said.

import type {
  EventGuest,
  EventLogo,
  EventPhoto,
  EventProgram,
  EventSchedule,
} from "@/remotion/event/types";
import type { CmVoiceTrackOf } from "@/lib/campaign/cm-types";

/**
 * The film, scene by scene, always in this order.
 *
 * One message per picture, and one line of narration per picture. That single
 * rule is what the earlier version got wrong: `program` produced two pictures
 * from one line, so a sentence ran across a cut and the storyboard and the film
 * disagreed about how many times the screen changes. A presentation does not
 * put one message on two slides, and neither should this.
 *
 * The film opens and closes on the presenter's mark. Those two are silent: the
 * opening exists so the viewer knows whose film this is before anyone speaks,
 * and the close exists so they remember. Everything between them is narrated,
 * and the narration begins with the title call — an announcement names itself
 * first, rather than teasing and then explaining what was being teased.
 *
 * product-cm's roles are a sales argument (hook → problem → solution →
 * features → cta). An announcement is not an argument: nobody has a problem
 * that an event solves. It says whose it is, what it is, why it is worth an
 * evening, what happens, who speaks, and when.
 */
/**
 * How many agenda pictures this template has.
 *
 * Three, always — not "one per programme listed". The film's shape is decided
 * before anything is known about the event (2026-08-17), because a structure
 * that grew and shrank with the facts meant TWO sources of truth for what the
 * film consists of, and everything that walks the film had to keep asking which
 * one won. That disagreement is exactly what `narrationStaleness` had to report
 * as `shape`, and what made a warning nobody could clear.
 *
 * An evening with one programme keeps three pictures and deletes two
 * (lib/event-cm/panel-actions.ts). An evening that needs five uses a different
 * template — flexing this one is how it stopped being a template.
 */
export const EVENT_CM_PROGRAM_SCENES = 3;

/**
 * The film, as the template declares it. Nine pictures, in this order.
 *
 * `removable` is the template's answer to "may this picture be absent", and it
 * is the ONLY reason a film has fewer than nine. It lives here rather than in
 * the menu that offers deletion, because the renderer, the storyboard and the
 * server all have to agree with the menu — and because the answer is a fact
 * about the template's shape, not about the button.
 */
export const EVENT_CM_SCENES = [
  /** オープニング — the presenter's mark, alone. Music only. */
  { role: "logoIn", narrated: false, count: 1, removable: false },
  /** タイトル — the title screen, and the narration that calls it. */
  { role: "title", narrated: true, count: 1, removable: false },
  /** テーマ — why attend. The one promise the evening makes. */
  { role: "value", narrated: true, count: 1, removable: false },
  /** アジェンダ — what actually happens. Three pictures, always. */
  { role: "program", narrated: true, count: EVENT_CM_PROGRAM_SCENES, removable: true },
  /** 登壇者紹介 — who speaks. Present from the start, before anybody has been
   *  announced: an event template presupposes speakers, and a picture that
   *  appeared only once the facts allowed it made the film's shape a moving
   *  target. An event with none deletes the picture. */
  { role: "guests", narrated: true, count: 1, removable: true },
  /** CTA — when, where, and what to do. */
  { role: "cta", narrated: true, count: 1, removable: false },
  /** エンドカード — the mark again, fading. Music only. */
  { role: "logoOut", narrated: false, count: 1, removable: false },
] as const;

export type EventCmSceneRole = (typeof EVENT_CM_SCENES)[number]["role"];

/**
 * What each scene is called, on screen and in the prompts.
 *
 * The roles above are the contract and stay English. This is the vocabulary the
 * template is *discussed* in — by whoever reads the storyboard, by the refusal
 * messages, and by the narration prompt. It used to live in two tables (the
 * storyboard's own and the prompt's `ROLE_BRIEFS`), which is a way of saying the
 * screen and the model could be given different names for the same picture.
 *
 * The words are an event's, not this tool's: an opening card, a theme, an
 * agenda, the speakers, the call to action, an end card. `program` is the one
 * split on purpose — the *values* stay プログラム wherever they are listed,
 * because that is what the organiser wrote, while アジェンダ names the picture
 * they go on. A seminar has an agenda; it does not have a 「価値」.
 */
export const EVENT_CM_SCENE_LABELS: Record<EventCmSceneRole, string> = {
  logoIn: "オープニング",
  title: "タイトル",
  value: "テーマ",
  program: "アジェンダ",
  guests: "登壇者紹介",
  cta: "CTA",
  logoOut: "エンドカード",
};

/** Every role the template uses, in film order. One entry per role — `program`
 *  appears once here and three times in the film (`EVENT_CM_PROGRAM_SCENES`). */
export const EVENT_CM_SCENE_ROLES = EVENT_CM_SCENES.map(
  (scene) => scene.role,
) as readonly EventCmSceneRole[];

/** The roles that carry a narration line, for any brief. */
export const EVENT_CM_NARRATED_ROLES = EVENT_CM_SCENES.filter(
  (scene) => scene.narrated,
).map((scene) => scene.role) as readonly EventCmSceneRole[];

export interface EventCmScene {
  role: EventCmSceneRole;
  /**
   * Which item this picture is about, when its role repeats.
   *
   * Only `program` repeats today: an evening with three programmes gets three
   * pictures, one each, because "one message per picture" applies to programmes
   * as much as to anything else — a numbered list of three is three messages
   * crammed onto one slide, and the narration line for it can only say
   * 「いろいろあります」. Absent when the role appears once, which keeps every
   * single-programme take exactly as it was.
   */
  index?: number;
  /**
   * The sentence itself: what the subtitles show, and what the narrator reads
   * unless `reading` says otherwise. No headings, no stage directions.
   */
  text: string;
  /**
   * How to SAY the sentence, when its spelling cannot be read aloud.
   *
   * 「〆張鶴」 is the case that asked for this — a brewery whose name is read
   * しめはりつる, which no TTS voice can be trusted to guess. Writing the kana
   * into `text` would fix the voice and break the subtitle: the screen would
   * spell a two-hundred-year-old brand in kana. So the two are separated. The
   * eye reads `text`, the ear reads this, and this one is optional because for
   * almost every line they are the same sentence.
   *
   * The WHOLE line, not a per-word gloss. A reading is only useful if it can be
   * handed to TTS as it stands; a substitution table would be a parser nobody
   * asked for, and it would still have to decide what to do about 「〆」 at the
   * start of a word versus inside one.
   */
  reading?: string;
}

/**
 * One picture in the film: a role, and which item it is about.
 *
 * This is what replaced "a scene IS a role". The moment a role can appear more
 * than once, everything that has to agree about the film — the timeline, the
 * captions, the storyboard panel, the line of narration — has to agree about
 * WHICH picture, and the role alone stopped being able to say.
 */
export interface EventCmSceneStep {
  role: EventCmSceneRole;
  narrated: boolean;
  index?: number;
}

/** The stable identity of one picture. Used as a map key wherever two parts of
 *  the system have to be talking about the same scene. */
export const eventCmSceneKey = (scene: {
  role: EventCmSceneRole;
  index?: number;
}): string => (scene.index === undefined ? scene.role : `${scene.role}#${scene.index}`);

/**
 * Total narration budget. Not a hard limit on the render — the timeline is
 * whatever the voice turns out to be (§ the user's "ナレーション長ドリブン") —
 * but the number the writer is held to, so the result lands near 30 seconds.
 * Japanese TTS at CM pace runs roughly 7 characters per second.
 */
export const EVENT_CM_TARGET_SECONDS = 30;
export const EVENT_CM_MIN_CHARS = 180;
export const EVENT_CM_MAX_CHARS = 260;

/** Japanese CM narration pace. Only an estimate — the voice stage measures the
 *  real timeline — but enough to tell "about 30 seconds" from "45". */
export const EVENT_CM_CHARS_PER_SECOND = 7;

/**
 * How long each beat may run, in characters.
 *
 * Written down rather than left to the prompt because the screen is built on
 * it: a `program` beat at twice its budget is not a long sentence, it is a
 * twelve-second scene where eight were designed. Told to the writer AND
 * checked after, since a model asked for 62 characters returns 89.
 */
const SCENE_BUDGET: Record<EventCmSceneRole, { min: number; max: number }> = {
  // Silent. Their length is fixed by the timeline, not by anything written.
  logoIn: { min: 0, max: 0 },
  logoOut: { min: 0, max: 0 },
  title: { min: 24, max: 34 },
  value: { min: 40, max: 52 },
  program: { min: 38, max: 50 },
  guests: { min: 26, max: 36 },
  cta: { min: 30, max: 42 },
};

export const sceneChars = (scene: EventCmScene): number =>
  scene.text.replace(/\s/g, "").length;

/**
 * How long one picture's line may be.
 *
 * Per scene rather than per role, because a role that repeats does less work
 * each time: one programme per picture is a shorter sentence than a summary of
 * three, and three pictures at the single-scene budget would add ninety
 * characters to the film. The first programme picture gets more room because it
 * also says what the set of them adds up to.
 */
export function eventCmSceneBudget(scene: {
  role: EventCmSceneRole;
  index?: number;
}): { min: number; max: number } {
  if (scene.role === "program" && scene.index !== undefined) {
    // Raised on 2026-08-25, when the programmes started carrying what they
    // cover (EventProgram.detail) instead of only a format label. The old
    // 58/40 fitted 「主催者が解説します」 and cut off the sentence that makes an
    // agenda picture worth watching — 「一つ目は金融の歴史です。貨幣の歴史から
    // 資本主義へ、そして投資の発明に迫ります」 is 65 characters.
    //
    // The film gets longer, and that is the correct trade: 「30秒は要件ではなく、
    // 正しい尺が要件」. The first picture still gets more room because it also
    // says what the three add up to.
    return scene.index === 0 ? { min: 45, max: 84 } : { min: 30, max: 62 };
  }
  return SCENE_BUDGET[scene.role];
}

/**
 * Marker kept in a field's provenance note when the user takes it off screen.
 *
 * Lives here, at the bottom of the stack, because the SHAPE of the film depends
 * on it: a suppressed speaker list means there is no speaker picture. Anything
 * that asks "what does this film consist of" therefore has to be able to see
 * it, including modules that must not import the editing layer.
 */
export const EVENT_CM_SUPPRESSED_NOTE = "__suppressed__";

/**
 * Switching the SUBTITLES off.
 *
 * The narration has two outputs — spoken and shown — and both can be declined
 * without the words themselves going anywhere. Until now only the spoken one
 * could: the subtitles were mandatory, which made the pair asymmetric for no
 * reason the model could state.
 *
 * A suppression rather than a field, for the same reason narration-off is one:
 * there is nothing to null out. Subtitles are derived on every read
 * (captions.ts) and never stored, so "off" has to be recorded as a DECISION or
 * the next read would simply produce them again.
 *
 * The default stays on, and that is not a technicality: business video is
 * watched muted, so a film with no subtitles says nothing to most of the people
 * who see it. Off is for the case where the picture is doing the talking — a
 * loop behind a booth, a cut for a channel that burns in its own captions.
 */
export const EVENT_CM_CAPTIONS_PATH = "captions";

/**
 * Switching the READING off — the narration's other output.
 *
 * A constant rather than a literal because three places now write or read it:
 * the seeder (which starts it off), the editor, and `voiceIsOff`
 * (lib/event-cm/bake.ts). Named beside the subtitles on purpose — 「オフにでき
 * るのは言葉ではなく、言葉の出力先2つ」 — so the pair stays visible as a pair.
 *
 * The default here is OFF, unlike the subtitles. Words on screen with music
 * under them is a complete film; a reading is something somebody asks for, and
 * asking is what makes it owed (owner's call, 2026-08-30).
 */
export const EVENT_CM_VOICE_PATH = "voice";

export const captionsAreOff = (brief: {
  provenance?: EventCmProvenance;
}): boolean =>
  brief.provenance?.[EVENT_CM_CAPTIONS_PATH]?.note === EVENT_CM_SUPPRESSED_NOTE;

type PlanInput = { provenance?: EventCmProvenance };

const isOff = (brief: PlanInput, path: string): boolean =>
  brief.provenance?.[path]?.note === EVENT_CM_SUPPRESSED_NOTE;

/**
 * Where a picture's deletion is recorded.
 *
 * Agenda pictures need one path each, because there are three of them and they
 * are deleted one at a time. Removing the ITEM from `programs` used to be how
 * an agenda picture went away, which only worked while the number of pictures
 * followed the number of items — with the count fixed, that would leave the
 * frame standing with nothing in it.
 */
export const eventCmScenePath = (scene: {
  role: EventCmSceneRole;
  index?: number;
}): string =>
  scene.role === "program" && scene.index !== undefined
    ? `program.${scene.index}`
    : scene.role;

/**
 * The pictures this brief produces, in film order.
 *
 * The shape is the TEMPLATE's, not the brief's: nine pictures, every time, and
 * the only thing this reads is which of them the user deleted. Before
 * 2026-08-17 it counted programmes and looked for announced speakers, so the
 * film changed shape underneath a narration that had already been written and
 * recorded — the `shape` half of `narrationStaleness` exists only because of it.
 *
 * Reads suppression itself rather than trusting the caller to have emptied the
 * brief first. That was the bug behind a warning nobody could clear: the film
 * was drawn from the suppressed brief while `narrationIsStale` was computed from
 * the stored one, so a correct, freshly written and recorded narration was
 * reported as out of date for ever.
 */
export function eventCmScenePlan(brief: PlanInput): EventCmSceneStep[] {
  const steps: EventCmSceneStep[] = [];
  for (const scene of EVENT_CM_SCENES) {
    if (!scene.removable) {
      // Asked deliberately narrowly: `title` and `cta` name a picture AND a
      // field the user can switch off in the fact list, and switching a field
      // off empties the value — it has never meant "drop the picture".
      steps.push({ role: scene.role, narrated: scene.narrated });
      continue;
    }
    if (scene.count === 1) {
      if (isOff(brief, scene.role)) continue;
      steps.push({ role: scene.role, narrated: scene.narrated });
      continue;
    }
    // Switching the whole field off takes every picture of it, which is what
    // 「消す」 on `programs` in the fact list means. One picture at a time is
    // the indexed path.
    if (isOff(brief, "programs")) continue;
    for (let index = 0; index < scene.count; index += 1) {
      if (isOff(brief, `${scene.role}.${index}`)) continue;
      steps.push({ role: scene.role, narrated: scene.narrated, index });
    }
  }
  return steps;
}

/** The pictures this brief needs a narration line for, in film order. */
export const eventCmNarratedSteps = (brief: PlanInput): EventCmSceneStep[] =>
  eventCmScenePlan(brief).filter((scene) => scene.narrated);

/**
 * Beats outside their budget, with the direction they went. Empty = on spec.
 *
 * `index` travels with the role because a role that repeats does not share one
 * budget: the first programme picture is allowed 45–84 characters and the rest
 * 30–62 (`eventCmSceneBudget`). A caller handed only the role would look the
 * budget up again against the wrong picture and report 「アジェンダ 70字（予算
 * 30〜62字）」 for a line that was inside its budget.
 */
export function narrationBudgetIssues(
  narration: EventCmNarration,
): Array<{ role: EventCmSceneRole; index?: number; chars: number; over: boolean }> {
  return narration.scenes.flatMap((scene) => {
    const budget = eventCmSceneBudget(scene);
    const chars = sceneChars(scene);
    if (chars >= budget.min && chars <= budget.max) return [];
    return [
      {
        role: scene.role,
        ...(scene.index === undefined ? {} : { index: scene.index }),
        chars,
        over: chars > budget.max,
      },
    ];
  });
}

export interface EventCmNarration {
  version: 1;
  scenes: EventCmScene[];
  /**
   * Who last wrote this text. A human edit is never silently regenerated.
   *
   * Three values, not two, because the template writes lines of its own: a
   * seeded film has a placeholder for every picture that speaks, so it plays
   * before a model has been asked anything (README「捏造の方針」). Those lines
   * used to be recorded as `"llm"` — overwritable, which was the intent, but
   * the record then said a model had written them. Anything that reads
   * provenance (a cost report, a reviewer asking what was generated) was being
   * told something untrue. `"seed"` is overwritten exactly as `"llm"` is; every
   * decision in this repo asks whether the source is `"human"`.
   */
  source: "seed" | "llm" | "human";
  updatedAt: string;
  /** The angle the writer committed to, in one line. Shown next to the narration
   *  so a reader can tell whether the take is arguing the right thing before
   *  reading five paragraphs to find out. */
  angle: string;
}

/**
 * Where each field's value came from, keyed by the goal's field path
 * (lib/pipeline/event-cm.ts EVENT_CM_GOAL).
 *
 * The template hands the user a finished film before they have said anything,
 * so parts of it are the tool's proposal. That is only honest if the proposal
 * is labelled: a seeded date is not a fact this event has, it is a plausible
 * one offered for confirmation. Absent provenance means `user` — everything
 * written before this existed was authored by hand.
 */
export type EventCmProvenance = Record<
  string,
  {
    origin: "brand" | "extracted" | "inferred" | "user";
    note?: string;
    /** What was read, as a label for people. */
    source?: string;
    /**
     * The material ids this value rests on — several when several documents
     * state it, and for a placed portrait the picture plus the document that
     * named the person. Absent on values recorded before attribution existed,
     * which reads as 「由来未記録」, never as 「根拠なし」. This is what lets a
     * removed document take its values with it (lib/event-cm/withdraw.ts).
     */
    sources?: string[];
  }
>;

/**
 * The brand's own look, pinned into the take at creation.
 *
 * On the brief rather than fetched at render time for the same reason the
 * materials are: a take renders from what it fixed, so a palette adopted after
 * the fact cannot silently change a film somebody already approved.
 *
 * Absent values keep the theme's own — a brand with no accent is a real
 * answer, and the theme's gold stands in as the tool's proposal.
 */
export interface EventCmThemeInput {
  palette?: { primary?: string; accent?: string; background?: string; text?: string };
  headingFont?: string | null;
  bodyFont?: string | null;
}

/**
 * The photographs an event-cm scene stands on.
 *
 * Three, because the film has three scenes that take a ground: the value scene
 * (hero), the programme scenes and the closing card (both support). event-promo's
 * `inkArt` and `texture` are not here — this film's ground is the drifting ink
 * the theme paints, and a slot nothing draws is a slot a user is invited to fill
 * for nothing (see the file header).
 */
export interface EventCmVisuals {
  /** Full-bleed photo behind the value scene. */
  value: EventPhoto | null;
  /** Full-bleed photo behind the programme scenes, heavily dimmed. */
  programs: EventPhoto | null;
  /** Full-bleed photo behind the closing card. */
  closing: EventPhoto | null;
}

/**
 * Everything the narrated event video renders from.
 *
 * The field list is exactly what `remotion/kit/scenes/event-cm.ts` reads plus
 * what the take needs to know about itself (provenance, theme, timestamps,
 * narration, voice). If a field is added here and no scene reads it, the goal and
 * the fact list will offer it to the user and nothing will happen — which is the
 * mistake `extends EventBrief` made three times over.
 */
export interface EventCmBrief {
  /** Who presents this — the mark scenes and the closing credit. */
  presenter: string;
  seriesLabel: string;
  title: string;
  subtitle: string;
  /** The single strongest value, one line per array entry. */
  valueLines: string[];
  /** Small gold chip under the value lines. */
  valueChip: string | null;
  programsHeading: string;
  programs: EventProgram[];
  guestsHeading: string;
  guests: EventGuest[];
  schedule: EventSchedule;
  cta: string;
  /** Small print on the closing scene, e.g. age restriction. */
  footnote: string | null;
  logos: EventLogo[];
  visuals: EventCmVisuals;
  /** material:<uuid> or a staticFile name of the BGM; null = silent. */
  bgm: string | null;
  provenance?: EventCmProvenance;
  /**
   * WHICH art direction this film is painted in (`remotion/kit/theme.ts`).
   *
   * Style, not content: changing it does not touch one word of the narration,
   * one fact, or the length of a single scene. The same brief renders as a
   * corporate webinar announcement or as a 和モダン campaign piece.
   *
   * Absent means the take predates the field, and those were all 墨
   * (`LEGACY_THEME_ID`) — never the current default, or approved films would
   * repaint themselves. Not a spoken fact, so changing it does not make the
   * narration stale (`isSpokenFact`).
   */
  artDirection?: string;
  /** The brand's own colours, dressed onto whichever art direction is chosen. */
  theme?: EventCmThemeInput;
  /**
   * When the facts last changed — a document was read, or somebody corrected
   * a value.
   *
   * Exists so the narration can be known to be out of date. The narration is
   * written FROM the facts, so a fact that changes after it was written means
   * the film is now saying something about a different event. Comparing
   * against `takes.updated_at` would not work: writing the narration updates the
   * take too, so every narration would immediately look current.
   */
  factsUpdatedAt?: string;
  /**
   * A proposed video name the user turned down.
   *
   * Only exists so the offer to rename does not come back on every load. Held
   * on the brief rather than in the browser because "I already answered this"
   * is a fact about the take, not about the machine that asked.
   */
  titleDeclined?: string | null;
  narration: EventCmNarration;
  /**
   * Who reads it, as a preset id (lib/voice/voices.ts).
   *
   * A SETTING, like the choice of music — not the recording. Picking a voice
   * writes this and nothing else; the reading itself happens when the one
   * button runs, alongside everything else that is waiting. It used to start a
   * text-to-speech call the instant somebody pressed 「この声で読み上げる」,
   * which meant a minute of waiting, a dialog that finally closed, and a player
   * that had not changed — because a recording is not a film until the film is
   * fixed. Absent = the template's standard narrator.
   */
  narrator?: string;
  /** Present once the narration has been spoken. Nothing waits for a human to
   *  approve the text: the golden path runs narration → voice → film unattended,
   *  and editing is what you reach for after seeing the result, not before.
   *  `narration.source` is what keeps a re-run from overwriting an edit.
   *  `track.voice` is the voice that ACTUALLY read it — compared against
   *  `narrator` to know whether the recording is the one that was asked for. */
  voice?: {
    track: CmVoiceTrackOf<EventCmScene>;
    /** material:<uuid> of the mixed WAV, pinned through take_inputs. */
    audio: string;
  };
}

/**
 * Whether the narration still describes the facts it was written from.
 *
 * The narration is the film's spine — it decides the scene order and the scene
 * lengths — so a narration written before the facts changed does not merely
 * contain a stale sentence: the whole film is about a different event. This is
 * what went wrong when reading a flyer changed the title and left the voice
 * announcing the seeded proposal.
 */
/**
 * Why the narration and the film disagree, when they do.
 *
 * Two different problems, and telling them apart matters because the fix is
 * different. `shape` means the film gained or lost a picture and the narration has
 * the wrong set of lines; `facts` means the words are about an older version of
 * the same event. The single boolean said 「変わる前の内容を読み上げています」 for
 * both, which was wrong for the first case and unfixable when the comparison
 * itself was wrong.
 */
export type NarrationStaleness = "shape" | "facts" | null;

export function narrationStaleness(brief: EventCmBrief): NarrationStaleness {
  if (brief.narration.scenes.length === 0) return null;
  const expected = eventCmNarratedSteps(brief).map(eventCmSceneKey);
  const actual = brief.narration.scenes.map(eventCmSceneKey);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    return "shape";
  }
  if (!brief.factsUpdatedAt) return null;
  return brief.narration.updatedAt < brief.factsUpdatedAt ? "facts" : null;
}

export const narrationIsStale = (brief: EventCmBrief): boolean =>
  narrationStaleness(brief) !== null;

/**
 * What the narrator says for one scene: the reading when there is one, the
 * sentence otherwise.
 *
 * One expression, in one place, because four different consumers have to agree
 * on it — the TTS call, its character-count guard, the pre-recording length
 * estimate, and the record of what was actually read. Two spellings of this
 * rule would mean a film whose voice says one thing while its 「録音は最新」
 * badge is answering about another.
 */
export const eventCmSpoken = (scene: EventCmScene): string =>
  scene.reading && scene.reading.trim().length > 0 ? scene.reading : scene.text;

export const narrationText = (narration: EventCmNarration): string =>
  narration.scenes.map((scene) => scene.text).join("");

export const narrationChars = (narration: EventCmNarration): number =>
  narrationText(narration).replace(/\s/g, "").length;
