// Sound effects: where, how present, and — mostly — where not.
//
// The system is sake-2026's, unchanged, because it was right: a sound means
// SOMEBODY DECIDED, it marks structure and nothing else, and its level is
// `measured gain × presence` rather than a number picked by ear against
// whoever mastered the sample. What changes is the instrument family. sumi
// was 拍子木・和太鼓・鈴; this film is a concert hall, so 和楽器 are out
// (FINDINGS「音」) and what is left is a piano and a lighting board. The
// glass and the metallophone that opened the film have been withdrawn — see
// below.
//
// One cue, three firings:
//   program  ピアノの単音   the chapter turn, three times, the same note
//
// The spotlight that lit the guests picture went with the picture
// (2026-09-14). The moderator arriving beside programme III gets nothing: a
// cue on a portrait inside a scene would mark him louder than the players.
//
// THE OPENING IS EMPTY AND WAITING. logoIn carried shine1 and title carried
// kira1; the client asked for both to come out (2026-09-10) and will say
// later what goes in their place, so the choice is not this file's to make.
// The shape of the cue sheet is left intact — putting something back is one
// line per scene. The film opens on music alone until then.
//
// Deliberately silent, and these are decisions rather than gaps:
//   value    the promise runs 15 seconds and wants to be watched
//   cta      the date is the loudest thing on screen; doubling it with a
//            hit is what makes an invitation read as an advert
//   logoOut  the film should end on music alone (sake's reason, unchanged)
//
// The gains are the pool's own measurements, imported rather than copied:
// src/public/defaults/sfx/catalog.json ships with the export and is the
// ledger the template itself uses.

import type { EventCmSceneRole } from "@/remotion/event-cm/types";
import catalog from "@/public/defaults/sfx/catalog.json";

export interface SfxCue {
  src: string;
  /** Milliseconds after the scene starts. */
  atMs: number;
  /** The final multiplier, measured × editorial. Do not set by hand. */
  volume: number;
  /** The pool's own label, so a reviewer can find the file by ear. */
  label: string;
  why: string;
}

const SOUNDS = (catalog as { sounds: Record<string, { label: string; gain: number }> }).sounds;

/**
 * How present a cue should feel, 0–1, AFTER levelling.
 *
 * The scale is the film's, not the file's. The remaining cue plays under
 * narration and music, which is why it stays below a third.
 */
const PRESENCE = {
  chapter: 0.3,
} as const;

const cue = (file: string, presence: number, atMs: number, why: string): SfxCue => {
  const sound = SOUNDS[file];
  return {
    src: `assets/sfx/${file}`,
    atMs,
    // Clamped because levelling multiplies: a quiet file needs more than
    // unity to reach the reference, and a presence chosen without that in
    // mind would ask for more than 1 and clip against the music under it.
    volume: Number(Math.min(1, (sound?.gain ?? 1) * presence).toFixed(3)),
    label: sound?.label ?? file,
    why,
  };
};

export const SFX: Partial<Record<EventCmSceneRole, (index: number) => SfxCue | null>> = {
  // logoIn: awaiting the client's choice. It ran shine1.mp3 at +350ms until
  //         2026-09-10; add a line here to give it a sound again.
  // title:  awaiting the client's choice. It ran kira1.mp3 at +120ms.
  //
  // The chapter turn. A single piano note, the same one all three times —
  // three different transitions read as three unrelated films. (sake ruled
  // the piano out for being the wrong instrument family for 和モダン; here
  // it is exactly the right one, which is the cleanest illustration of what
  // changed between the two art directions.)
  program: () => cue("piano-single1.mp3", PRESENCE.chapter, 0, "章が変わる"),
};

export const cueFor = (role: EventCmSceneRole, index = 0): SfxCue | null =>
  SFX[role]?.(index) ?? null;
