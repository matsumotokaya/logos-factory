import "server-only";

// Reading words aloud — shared by every narrated template.
//
// Template-neutral on purpose, so the words it is handed are just words: a
// template calls them its narration (remotion/event-cm/types.ts), and this
// module never learns which template it is.
//
// What a narrated template supplies is a list of scenes with text. What it
// gets back is the WAV and the timing, keyed to its own scene roles.

import { synthesizeSection } from "./tts-lib/tts.mjs";
import {
  parseUtterances,
  speechText,
  buildTimingJson,
} from "./tts-lib/timing.mjs";
import {
  int16ToF32,
  injectIntervals,
  mixEpisode,
  encodeWav16,
} from "./tts-lib/audio.mjs";
import { TTS_MAX_SECTION_CHARS } from "./limits";
import { explainTtsError } from "./errors";
import type { VoiceTrackOf } from "@/lib/voice/track";

export const TTS_PROVIDER = "gemini";
export const TTS_MODEL = "gemini-3.1-flash-tts-preview";
/** Even delivery — the default narrator for a 30s spot. */
export const TTS_VOICE = "Schedar";
// The section limit is NOT re-exported. It had two doorways, and a caller that
// reached it through here read "how the voice module happens to be configured"
// instead of "how long a section may be" — which is a fact about the provider
// (./limits.ts, mirrored in lib/voice/tts-lib/tts.mjs).
const MIX_SAMPLE_RATE = 24000; // Gemini TTS native rate; no resampling needed

export interface VoiceOptions {
  /** How the narrator should read — the one knob a template turns. */
  persona: string;
  /** Which prebuilt voice reads it (lib/voice/voices.ts). Defaults to the
   *  even-delivery narrator this template has always used. */
  voice?: string;
  /**
   * Silence between one scene's line and the next, in milliseconds.
   *
   * The template's, not this module's: the film states the same pause in its
   * timeline before any audio exists, and the two have to be the same number.
   */
  sceneGapMs?: number;
  onProgress?: (message: string, level?: "info" | "success" | "warn") => void;
}

export function voiceAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) || process.env.TTS_MOCK === "1";
}

export async function generateVoice<Scene extends { text: string }>(
  scenes: readonly Scene[],
  options: VoiceOptions,
): Promise<{ wav: Buffer; track: VoiceTrackOf<Scene> }> {
  const progress = (message: string, level: "info" | "success" | "warn" = "info") =>
    options.onProgress?.(message, level);

  if (scenes.length === 0) {
    throw new Error("読み上げる本文がありません");
  }

  // Checked before a single request goes out.
  //
  // The provider refuses a section over its limit, and it refused it in the
  // middle of the loop — so a film whose third line was too long had already
  // paid for the first two, and the error that reached the screen was the
  // provider's own English sentence about a character count. One line being too
  // long is a fact about the script, knowable here, and worth saying in the
  // words the user wrote it in.
  const tooLong = scenes.findIndex(
    (scene) => speechText(scene.text).length > TTS_MAX_SECTION_CHARS,
  );
  if (tooLong >= 0) {
    throw new Error(
      `${tooLong + 1}番目の本文が長すぎて読み上げられません（${
        speechText(scenes[tooLong].text).length
      }字 / 上限${TTS_MAX_SECTION_CHARS}字）。短く分けてください`,
    );
  }

  const mock = process.env.TTS_MOCK === "1";
  if (mock) progress("開発用の音声を使用しています", "warn");

  const voice = options.voice ?? TTS_VOICE;
  const sections: { f32: Float32Array; sampleRate: number }[] = [];
  for (const [i, scene] of scenes.entries()) {
    progress(`シーン${i + 1}/${scenes.length}の読み上げを作成中…`);
    // Translated here rather than at the route, because this is the module that
    // already says why a recording could not be made (an empty script, a line
    // over the limit) in the language it was written in. The provider's own
    // sentence is English, names no fix, and reports a daily quota and a
    // per-minute one identically -- see ./errors.ts.
    let pcm: Int16Array;
    let sampleRate: number;
    try {
      ({ pcm, sampleRate } = await synthesizeSection({
        text: speechText(scene.text),
        voice,
        persona: options.persona,
        model: TTS_MODEL,
        provider: TTS_PROVIDER,
        apiKey: process.env.GEMINI_API_KEY,
      }));
    } catch (error) {
      throw new Error(explainTtsError(error), { cause: error });
    }
    const f32 = injectIntervals(
      int16ToF32(pcm),
      sampleRate,
      parseUtterances(scene.text),
    );
    sections.push({ f32, sampleRate });
  }

  const mix = mixEpisode(sections, null, {
    sampleRate: MIX_SAMPLE_RATE,
    introDelaySec: 0,
    // The pause between chapters. The caller owns it because the film's timeline
    // states the same number before any audio exists — two different values
    // would mean the estimate and the recording describe different rhythms.
    sectionGapSec: (options.sceneGapMs ?? 400) / 1000,
    outroDelaySec: 0.8,
    fadeOutSec: 0,
    bgmVolume: 0,
    bgmMaxRatio: 0,
    duckRatio: 0,
  });

  const wav = encodeWav16([mix.L], MIX_SAMPLE_RATE); // mono voice track

  const timing = buildTimingJson(
    scenes.map((scene) => scene.text),
    mix.sectionStartsMs,
    mix.sectionDurationsMs,
  ) as { id: string; start_ms: number; text: string }[];

  progress("読み上げが完成しました", "success");

  return {
    wav,
    track: {
      version: 1,
      generatedAt: new Date().toISOString(),
      totalMs: mix.totalMs,
      sampleRate: MIX_SAMPLE_RATE,
      mock,
      provider: TTS_PROVIDER,
      voice,
      scenes: scenes.map((scene, i) => ({
        ...scene,
        startMs: mix.sectionStartsMs[i],
        durationMs: mix.sectionDurationsMs[i],
      })),
      captions: timing.map((entry, i) => ({
        text: entry.text,
        startMs: entry.start_ms,
        endMs: timing[i + 1]?.start_ms ?? mix.totalMs,
      })),
    },
  };
}
