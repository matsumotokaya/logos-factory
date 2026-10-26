// Where each scene starts and ends, in frames.
//
// The still checks (`npx remotion still ... --frame=N`) need a frame number per
// role, and the only place that knows the answer is eventCmFilm(). Printing it
// here keeps those numbers derived rather than guessed — the film's lengths
// move whenever the narration is edited.
//
// Usage: npx tsx scripts/scene-frames.ts

import { eventCmFilm } from "@/remotion/event-cm/film";
import { EVENT_FPS } from "@/remotion/event/palette";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { GROUNDS, heroVideo } from "@/freehand/sources";
import brief from "../props.json";

/** Ground.tsx's DISSOLVE_FRAMES, copied rather than imported: that module
 *  pulls in @remotion/media, which only resolves inside the bundler. */
const DISSOLVE_FRAMES = 18;

/** How much of a clip must be left unplayed. A clip that runs out freezes. */
const CLIP_TAIL_SECONDS = 0.35;

/** Seconds of a file, via ffprobe. Null when it cannot be asked. */
const clipSeconds = (path: string): number | null => {
  if (!existsSync(path)) return null;
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { encoding: "utf8" },
    );
    const value = Number(out.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const film = eventCmFilm(brief as unknown as EventCmBrief);
const fps = EVENT_FPS;

console.log(`fps=${fps} totalMs=${film.totalMs} totalFrames=${Math.round((film.totalMs / 1000) * fps)}`);
console.log(`timingSource=${film.timingSource} hasVoice=${film.hasVoice}`);
console.log(
  `voiceStartMs=${film.voiceStartMs} voiceEndMs=${film.voiceEndMs} missingLines=${film.missingLines.join(",")}`,
);
/**
 * Slot lengths inside a scene, the way SequenceGround works them out.
 *
 * This exists because the weights in sources.ts are tuned against particular
 * scene lengths, and scene lengths move every time the narration is re-cut.
 * On 2026-09-11 a longer programme I took the b1 clip's slot from 143 frames
 * to 242 against a 156-frame file — three seconds of frozen video that no
 * type error would have caught. Now the script that reports the lengths also
 * reports what they do to the clips.
 */
const slotsOf = (length: number, weights: number[]): number[] => {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const slots: number[] = [];
  let used = 0;
  for (const [i, w] of weights.entries()) {
    const slot = i === weights.length - 1 ? length - used : Math.round((length * w) / total);
    slots.push(slot);
    used += slot;
  }
  return slots;
};

const problems: string[] = [];

for (const scene of film.scenes) {
  const from = Math.round((scene.fromMs / 1000) * fps);
  const length = Math.max(1, Math.round((scene.durationMs / 1000) * fps));
  const mid = from + Math.floor(length / 2);
  console.log(
    [
      scene.key.padEnd(12),
      `index=${scene.index ?? "-"}`,
      `from=${String(from).padStart(4)}`,
      `len=${String(length).padStart(4)}`,
      `mid=${String(mid).padStart(4)}`,
      `captions=${scene.captions.length}`,
    ].join("  "),
  );

  // film.ts labels the programme scenes "program#0"; GROUNDS keys them
  // "program0", which is what scenes.tsx asks groundOf() for.
  const key = scene.key.replace("#", "");
  const shots = GROUNDS[key]?.hero?.shots;
  if (!shots) continue;
  const slots = slotsOf(length, shots.map((shot) => shot.weight ?? 1));
  for (const [i, shot] of shots.entries()) {
    if (shot.landed !== "video" || !shot.id) continue;
    const span = slots[i] + (i > 0 ? DISSOLVE_FRAMES : 0);
    const seconds = clipSeconds(`public/${heroVideo(shot.id)}`);
    const limit = seconds === null ? null : (seconds - CLIP_TAIL_SECONDS) * fps;
    const verdict =
      limit === null ? "file not measured" : span <= limit ? "ok" : "OVERRUNS — WILL FREEZE";
    const line = `    clip ${shot.id} slot=${span}f (${(span / fps).toFixed(2)}s) file=${
      seconds === null ? "?" : seconds.toFixed(2) + "s"
    } ${verdict}`;
    console.log(line);
    if (limit !== null && span > limit) problems.push(`${key}: ${shot.id} ${line.trim()}`);
  }
}

if (problems.length > 0) {
  console.log("");
  console.log("CLIPS THAT WILL FREEZE — re-weight them in src/freehand/sources.ts:");
  for (const problem of problems) console.log(`  ${problem}`);
  process.exitCode = 1;
}
