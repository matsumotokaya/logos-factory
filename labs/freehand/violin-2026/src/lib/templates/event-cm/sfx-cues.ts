// How this template sounds its structure — the audio sibling of delivery.ts.
//
// delivery.ts is the template's opinion about how its words are READ; this is
// its opinion about which moments RING. Same register, same justification: an
// event announcement marks its own structure — it begins, its title lands, its
// chapters turn, its speakers arrive, its close arrives — and marks nothing
// else. "やりすぎるとチープ" was the client's one-line brief for this layer,
// so two scenes are deliberately silent: the promise (fourteen seconds that
// want to be watched, not punctuated) and the end card (the film closes on
// music alone; a hit there reads as a stinger from another genre). The
// corporate column silences a third — the opening (owner, 2026-08-30): the
// standard film starts on the music alone.
//
// **`presence` is not a volume.** The pool's files are mastered 10 dB apart,
// so a hand-picked volume per cue encodes the sample-maker's mastering as if
// it were a decision — measured on the Freehand Lab's first cut, where the
// opening clap arrived quieter than the chapter turns it outranks and the
// speakers' bell did not survive the narration at all (+25 RMS against +887).
// Each file is measured once at ingest (scripts/fetch-default-sfx.mjs →
// public/defaults/sfx/catalog.json, first-second mean → gain to −20 dB); the
// cue sheet only says how far forward a moment steps relative to the others.
//
// Levelling gets a file into range; it does not equalise instruments. A bell
// is diffuse where a woodblock is a transient, so 鈴 carries a higher presence
// than its role alone would suggest (measured: at equal presence it arrived at
// a third of every other cue's energy).

import type { EventCmSceneRole } from "@/remotion/event-cm/types";
import type { ThemeSound } from "@/remotion/kit/theme";
import catalog from "@/public/defaults/sfx/catalog.json";

export interface SfxCue {
  /** Path under public/, for resolveSrc/staticFile. */
  src: string;
  /** Milliseconds after the scene starts. */
  atMs: number;
  /** Final multiplier: measured gain × editorial presence. Never hand-set. */
  volume: number;
}

type CatalogEntry = { src: string; gain: number };
const SOUNDS = (catalog as { sounds: Record<string, CatalogEntry> }).sounds;

/** How far forward a cue steps, 0–1, AFTER levelling. The film's scale, not
 *  the file's: only the opening plays against music alone. */
const PRESENCE = {
  opening: 0.5,
  title: 0.4,
  chapter: 0.45,
  arrival: 0.45,
  closing: 0.35,
} as const;

/**
 * One trim over the whole cue sheet — a listening judgment, not a measurement.
 *
 * The requester's note on the first watch with SFX in place: 「サウンド
 * エフェクトがちょっと大きいので今より70%ぐらいの音量でいい」. Applied here
 * rather than by scaling the five numbers above, because those say how far each
 * moment steps forward RELATIVE TO THE OTHERS and that ranking did not change —
 * only how loudly the whole layer sits under the music and the voice. Rewriting
 * them to 0.35 / 0.28 / 0.315 … would encode one global decision five times and
 * lose the record of why 鈴 outranks its role.
 */
const SFX_TRIM = 0.7;

const cue = (file: string | null, presence: number, atMs: number): SfxCue | null => {
  // A column may leave a moment to the music alone (null): the moment still
  // exists in the template, this palette just declines to mark it.
  if (!file) return null;
  const entry = SOUNDS[file];
  // A file missing from the catalog is a pool problem, not a film problem:
  // the cue silently stands down rather than pointing Audio at a 404.
  if (!entry) return null;
  return {
    src: entry.src,
    atMs,
    volume: Number(Math.min(1, entry.gain * presence * SFX_TRIM).toFixed(3)),
  };
};

/**
 * Which file rings each moment, per sound palette (theme.ts `ThemeSound`).
 *
 * The MOMENTS and their presence are the template's and are the same in both
 * columns; only the instrument changes. Two scenes stay silent in both — the
 * promise and the end card — for the reason in the file header.
 */
const INSTRUMENTS: Record<ThemeSound["cues"], Record<"opening" | "title" | "chapter" | "arrival" | "closing", string | null>> = {
  // The 和モダン palette, approved on the delivered commission.
  wa: {
    // 拍子木: the two wooden blocks that open a performance — the one moment
    // with no voice and no picture to compete with.
    opening: "hyoushigi1.mp3",
    // A single taiko as the title draws in, before the first narrated line.
    title: "drum-japanese1.mp3",
    // The chapter turn rings the 鈴 (client call, 2026-08-18 — the synthetic
    // woosh sat wrong against an acoustic palette).
    chapter: "bell1.mp3",
    // The same bell announces the speakers: people arriving and chapters
    // turning are the same kind of moment, and one instrument says so.
    arrival: "bell1.mp3",
    // 和太鼓のドドン under the date landing — the film's one two-beat hit,
    // saved for its biggest fact (client call; the koto glissando didn't sit).
    closing: "drum-japanese2.mp3",
  },
  // The corporate palette. Selected to MATCH THE APPROVED COLUMN'S MEASURED
  // ENVELOPE, not by ear (2026-08-26): every 和 cue is a one-shot that has died
  // within a second — played tails measure −48…−60 dB — which is why seven
  // hits in fifty seconds read as 演出 and not as noise. The first corporate
  // draft was picked by label alone and two of its four files were multi-second
  // jingles still at −25…−34 dB a second in (logo-animation1, text-impact2):
  // categorically different sounds, and the requester heard exactly that
  // (「効果音が異常に大きい」— it was not their first-second level, which
  // matches 和 by construction; it was the ringing). Current picks, measured:
  //
  //             dur    played tail (1s+)     和の対応
  //   title1    1.73s  −46 dB                和太鼓ドン −48 dB
  //   switch2   1.90s  −62 dB                鈴 −60 dB
  //   spotlight 1.77s  −54 dB                和太鼓ドドン −60 dB
  //
  // Still unheard — the register (does a piano note suit this film) is an ear
  // question for the first watch. What is no longer possible is a cue that
  // rings past its moment: `npm run sfx:envelope` checks every column against
  // the approved envelope, and the numbers above come from it.
  corporate: {
    // No opening hit (owner, 2026-08-30). The standard film begins on the
    // music alone: the piano note was the sheet's strongest presence landing
    // inside the BGM's 20-frame ramp-in — the loudest cue at the film's
    // quietest moment — and the owner judged the mark itself needs no
    // punctuation. The 和 column keeps its 拍子木, which was approved on the
    // delivered commission.
    opening: null,
    // タイトル表示 — made for exactly this moment.
    title: "title1.mp3",
    // The scene-turn woosh: the corporate chapter idiom. Chapters and
    // speakers ring the same cue (the 和 column's pairing rule, kept).
    chapter: "sceneswitch2.mp3",
    arrival: "sceneswitch2.mp3",
    // The date landing: a reveal hit, over in under two seconds.
    closing: "spotlight1.mp3",
  },
};

/**
 * The cue for one scene role, by identity — three programme pictures ring the
 * same bell on purpose (three different transitions read as three unrelated
 * films), and `index` stays a parameter so a template that wants to vary them
 * can. `cues` is the theme's sound palette; absent means the 和 column, which
 * is what every take painted before the field existed was scored with.
 */
export function eventCmSfxCue(
  role: EventCmSceneRole,
  _index = 0,
  cues: ThemeSound["cues"] = "wa",
): SfxCue | null {
  const files = INSTRUMENTS[cues] ?? INSTRUMENTS.wa;
  switch (role) {
    case "logoIn":
      return cue(files.opening, PRESENCE.opening, 450);
    case "title":
      return cue(files.title, PRESENCE.title, 120);
    case "program":
      return cue(files.chapter, PRESENCE.chapter, 0);
    case "guests":
      return cue(files.arrival, PRESENCE.arrival, 60);
    case "cta":
      return cue(files.closing, PRESENCE.closing, 0);
    // value: watched, not punctuated. logoOut: music alone.
    default:
      return null;
  }
}
