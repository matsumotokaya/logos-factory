#!/usr/bin/env node
// Re-say ONE scene, and leave the rest of the recording untouched.
//
// The client changed a single word in scene 2 ("価値をアップデート" →
// "価値を深めて"). Regenerating the whole narration would be one call to
// generateVoice(), but it would also re-read every other scene — and those
// readings are approved, including 「〆張鶴」 which the model happens to voice
// correctly as しめはりつる. A reading that already passed review is an asset;
// paying TTS to roll the dice on it again is a regression waiting to happen.
//
// So: decode the existing WAV, cut it at the section boundaries the track
// already records, synthesize only the scene that changed, and re-mix. Because
// mixEpisode() with bgm=null does nothing but add sections into silence — no
// normalisation, no envelope, no fade — every sample of every other scene comes
// out identical to what it was.
//
// The film's timing follows the recording rather than the reverse: the new
// section is shorter, so the sections after it start earlier, and props.json's
// voice.track is rewritten from the measured mix.
//
// Usage:
//   node labs/freehand/scripts/resay-scene.mjs <labDir> <sceneIndex> [--apply]
//
// Without --apply this only self-checks: it re-mixes the UNCHANGED cuts and
// asserts the result reproduces the stored track. If that fails, the cutting is
// wrong and nothing should be written.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { synthesizeSection } from "../../../lib/voice/tts-lib/tts.mjs";
import { parseUtterances, speechText, buildTimingJson } from "../../../lib/voice/tts-lib/timing.mjs";
import {
  int16ToF32,
  injectIntervals,
  mixEpisode,
  encodeWav16,
} from "../../../lib/voice/tts-lib/audio.mjs";

// Decode at the channel count the file already has.
//
// NOT tts-lib's decodeAudioFile(): that helper exists to read BGM, so it always
// asks ffmpeg for two channels — and ffmpeg's mono→stereo upmix applies -3dB
// (measured here: 0.707107). The narration is mono, so reading it through that
// helper and re-encoding would have quietly dropped every untouched scene by
// 3dB. The self-check below is what caught it, and only after it was taught to
// compare samples instead of just durations.
const decodeMono = (path, sampleRate) => {
  const run = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", String(sampleRate), "-"],
    { maxBuffer: 1 << 30 },
  );
  if (run.status !== 0) {
    throw new Error(`ffmpeg failed to decode ${path}: ${run.stderr?.toString().slice(0, 400)}`);
  }
  const buf = run.stdout;
  const frames = Math.floor(buf.length / 4);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + frames * 4));
};

/** A 16-bit PCM WAV's samples, for comparing one mix against another. */
const samplesOf = (buf) => {
  if (buf.toString("ascii", 36, 40) !== "data") throw new Error("unexpected WAV layout");
  const frames = Math.floor((buf.length - 44) / 2);
  return new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + 44 + frames * 2));
};

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

const [labArg, sceneArg, ...flags] = process.argv.slice(2);
if (!labArg || sceneArg === undefined) {
  console.error("usage: resay-scene.mjs <labDir> <sceneIndex> [--apply]");
  process.exit(2);
}
const APPLY = flags.includes("--apply");
const LAB = resolve(REPO, labArg);
const SCENE = Number(sceneArg);
const PROPS = join(LAB, "props.json");

// --- the values this script must not invent -------------------------------
//
// Every parameter below is read from the thing that owns it, not copied here.
// A persona typed out twice is two personas the day someone edits one of them.

const personaFrom = (source) => {
  const block = source.match(/export const EVENT_CM_PERSONA = \[([\s\S]*?)\]\.join\(""\);/);
  if (!block) throw new Error("EVENT_CM_PERSONA not found in lib/event-cm/delivery.ts");
  const parts = [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (parts.length === 0) throw new Error("EVENT_CM_PERSONA is empty");
  return parts.join("");
};
const constFrom = (source, name) => {
  const found = source.match(new RegExp(`${name} = "([^"]+)"`));
  if (!found) throw new Error(`${name} not found`);
  return found[1];
};

const PERSONA = personaFrom(readFileSync(join(REPO, "lib/event-cm/delivery.ts"), "utf8"));
const MODEL = constFrom(readFileSync(join(REPO, "lib/voice/synthesize.ts"), "utf8"), "TTS_MODEL");

// The key lives in .env.local; this script is a recipe, not a service.
const envFile = join(REPO, ".env.local");
if (!process.env.GEMINI_API_KEY && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const kv = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (kv && !process.env[kv[1]]) process.env[kv[1]] = kv[2];
  }
}

// --- the recording as it stands -------------------------------------------

const props = JSON.parse(readFileSync(PROPS, "utf8"));
const track = props.voice?.track;
if (!track) throw new Error("props.json has no voice.track");
// The SPOKEN copy of each line, by the same rule the app uses
// (`eventCmSpoken` in remotion/event-cm/types.ts): a line with a `reading` is
// read from the reading, and the subtitle keeps the written sentence. Two
// spellings of this rule would mean the lab re-says a line differently from the
// way the product would.
const texts = props.narration.scenes.map((scene) =>
  scene.reading && scene.reading.trim().length > 0 ? scene.reading : scene.text,
);
if (texts.length !== track.scenes.length) {
  throw new Error(`narration has ${texts.length} scenes, the track has ${track.scenes.length}`);
}
if (!(SCENE >= 0 && SCENE < texts.length)) throw new Error(`scene ${SCENE} out of range`);

const SR = track.sampleRate;
const WAV = join(LAB, "public", props.voice.audio);

// The pause between sections, measured off the recording itself rather than
// assumed: this WAV was mixed with one gap, and that gap is the one to keep.
const gaps = track.scenes
  .slice(0, -1)
  .map((scene, i) => track.scenes[i + 1].startMs - (scene.startMs + scene.durationMs));
const gapMs = gaps[0];
if (gaps.some((g) => Math.abs(g - gapMs) > 2)) {
  throw new Error(`section gaps are not uniform: ${gaps.join(", ")}ms`);
}

console.log(`lab        ${labArg}`);
console.log(`wav        ${props.voice.audio}`);
console.log(`voice      ${track.voice} / ${MODEL}`);
console.log(`sections   ${track.scenes.length}, gap ${gapMs}ms, ${SR}Hz, total ${track.totalMs}ms`);
console.log(`scene ${SCENE}    ${texts[SCENE]}`);

// --- cut it at the boundaries the track records ---------------------------

const decoded = decodeMono(WAV, SR);
const cuts = track.scenes.map((scene) => {
  const from = Math.round((scene.startMs / 1000) * SR);
  const len = Math.round((scene.durationMs / 1000) * SR);
  if (from + len > decoded.length + 1) {
    throw new Error(`section at ${scene.startMs}ms runs past the end of the WAV`);
  }
  return { f32: decoded.subarray(from, from + len), sampleRate: SR };
});

const mixOpts = {
  sampleRate: SR,
  introDelaySec: 0,
  sectionGapSec: gapMs / 1000,
  outroDelaySec: 0.8, // ignored when bgm is null (audio.mjs uses 0.5)
  fadeOutSec: 0,
  bgmVolume: 0,
  bgmMaxRatio: 0,
  duckRatio: 0,
};

// Self-check, in two halves, because the first half alone passed a mix that was
// 3dB quiet: TIMING (do the cuts land where the track says) and WAVEFORM (does
// decode → cut → re-mix → encode give back the file we started from). Only the
// second one can see a gain error, and a gain error is exactly the kind of
// damage that would ship silently — every approved scene, quieter.
const rebuilt = mixEpisode(cuts, null, mixOpts);
const drift = track.scenes.map((scene, i) =>
  Math.max(
    Math.abs(rebuilt.sectionStartsMs[i] - scene.startMs),
    Math.abs(rebuilt.sectionDurationsMs[i] - scene.durationMs),
  ),
);
const worst = Math.max(...drift, Math.abs(rebuilt.totalMs - track.totalMs));
console.log(`self-check timing   drift ${worst}ms (starts/durations/total vs the stored track)`);

const original = samplesOf(readFileSync(WAV));
const roundTrip = samplesOf(encodeWav16([rebuilt.L], SR));
let peak = 0;
const n = Math.min(original.length, roundTrip.length);
for (let i = 0; i < n; i++) {
  const d = Math.abs(original[i] - roundTrip[i]);
  if (d > peak) peak = d;
}
const lengthDelta = Math.abs(original.length - roundTrip.length);
console.log(
  `self-check waveform peak |diff| ${peak} LSB over ${n} samples (length delta ${lengthDelta})`,
);
// One LSB is the f32→int16 truncation and nothing else. Anything above it means
// the samples themselves changed on the way through.
if (worst > 2 || peak > 1 || lengthDelta > 2) {
  console.error("self-check failed: the round trip does not reproduce the recording. Nothing written.");
  process.exit(1);
}
if (!APPLY) {
  console.log("dry run — pass --apply to synthesize and write.");
  process.exit(0);
}

// --- say the one scene again ----------------------------------------------

const text = texts[SCENE];
if (speechText(text).length === 0) throw new Error("the scene has no text to read");
console.log(`synthesizing scene ${SCENE} (${speechText(text).length} chars)…`);
const { pcm, sampleRate } = await synthesizeSection({
  text: speechText(text),
  voice: track.voice,
  persona: PERSONA,
  model: MODEL,
  provider: track.provider ?? "gemini",
  apiKey: process.env.GEMINI_API_KEY,
});
const fresh = injectIntervals(int16ToF32(pcm), sampleRate, parseUtterances(text));
const beforeMs = track.scenes[SCENE].durationMs;
const afterMs = Math.round((fresh.length / sampleRate) * 1000);
console.log(`scene ${SCENE}: ${beforeMs}ms → ${afterMs}ms (${afterMs - beforeMs >= 0 ? "+" : ""}${afterMs - beforeMs}ms)`);

const sections = cuts.map((cut, i) => (i === SCENE ? { f32: fresh, sampleRate } : cut));
const mix = mixEpisode(sections, null, mixOpts);

// --- write: WAV first, then the track that describes it -------------------

const backup = WAV.replace(/\.wav$/, `.before-resay-${SCENE}.wav`);
if (!existsSync(backup)) copyFileSync(WAV, backup);
writeFileSync(WAV, encodeWav16([mix.L], SR));

// The track records WHAT WAS READ, which is not always what the narration now
// says — and the difference is information, not drift. v9 changed 「しめはりつる」
// to 「〆張鶴」 in the narration and deliberately left the audio alone, because
// the reading is identical; the track kept the old spelling, correctly. Copying
// the current narration over every scene erases the record of that decision, so
// only the scene actually re-said gets its text updated.
const recorded = track.scenes.map((scene, i) => (i === SCENE ? texts[i] : scene.text));
const timing = buildTimingJson(recorded, mix.sectionStartsMs, mix.sectionDurationsMs);
props.voice.track = {
  ...track,
  generatedAt: new Date().toISOString(),
  totalMs: mix.totalMs,
  scenes: track.scenes.map((scene, i) => ({
    ...scene,
    text: recorded[i],
    startMs: mix.sectionStartsMs[i],
    durationMs: mix.sectionDurationsMs[i],
  })),
  captions: timing.map((entry, i) => ({
    text: entry.text,
    startMs: entry.start_ms,
    endMs: timing[i + 1]?.start_ms ?? mix.totalMs,
  })),
};
writeFileSync(PROPS, `${JSON.stringify(props, null, 2)}\n`);

console.log(`total      ${track.totalMs}ms → ${mix.totalMs}ms`);
console.log(`backup     ${backup.replace(`${LAB}/`, "")}`);
console.log("written: narration.wav + props.json (voice.track)");
