// Record a freehand project's narration with the product's own TTS pipeline.
//
// The app records through POST …/voice, which needs a browser session and
// writes to R2. A lab project has neither: its brief is props.json and its
// audio lives under public/assets/audio/. So this calls the same
// `generateVoice()` the route calls, with the same scene gap, and writes the
// WAV and the measured track where the exported Root.tsx expects them.
//
// The persona is the lab's, not the template's: EVENT_CM_PERSONA asks for a
// brisk announcer, and a luxury art direction wants the opposite register.
// Passing it here rather than editing lib/ keeps the template untouched.
//
// Usage (from the repo root; needs GEMINI_API_KEY in .env.local):
//   npx tsx --conditions=react-server --env-file=.env.local \
//     labs/freehand/scripts/record-narration.mts labs/freehand/<slug> [--voice=female-2] [--persona=luxe|event]
//
// `--conditions=react-server` resolves `server-only` to its empty build, which
// is the official way to import server modules outside Next.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { generateVoice } from "@/lib/voice/synthesize";
import { voicePresetById } from "@/lib/voice/voices";
import { EVENT_CM_PERSONA } from "@/lib/templates/event-cm/delivery";
import { EVENT_CM_SCENE_GAP_MS } from "@/remotion/event-cm/timeline";
import { eventCmSpoken, type EventCmBrief } from "@/remotion/event-cm/types";

const PERSONAS: Record<string, string> = {
  event: EVENT_CM_PERSONA,
  // Measured, not guessed: the first cut of this persona read 499 characters in
  // 120.8 s (4.1 c/s) — 30% slower than the approved sake film (5.2-6.5 c/s),
  // and a 2-minute event promo is not luxurious, it is slow. 「ゆったり」 and
  // 「一語一語を置くように」 were the two lines doing it, so the register is now
  // carried by pitch and evenness instead of by pace.
  luxe: [
    "格式のあるイベントの招待ナレーター。",
    "低めの落ち着いた声で、一定のテンポで淀みなく読み上げます。",
    "普通の速さで読む。ゆっくりにしない、間延びさせない、一語ずつ区切らない。",
    "語尾を伸ばさない、語尾を上げない、ささやかない、作った甘さや過剰な抑揚をつけない。",
    "数字と固有名詞ははっきりと。読点では止まらずに続ける（間はこちらで設計済み）。",
  ].join(""),
};

const [labArg, ...flags] = process.argv.slice(2);
if (!labArg) {
  console.error("usage: record-narration.mts <labDir> [--voice=<preset id>] [--persona=luxe|event]");
  process.exit(2);
}
const flag = (name: string) =>
  flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);

const lab = resolve(labArg);
const propsPath = resolve(lab, "props.json");
const brief = JSON.parse(readFileSync(propsPath, "utf8")) as EventCmBrief;

const presetId = flag("voice") ?? brief.narrator ?? "standard";
const preset = voicePresetById(presetId);
if (!preset) throw new Error(`unknown voice preset: ${presetId}`);
const personaId = flag("persona") ?? "luxe";
const persona = PERSONAS[personaId];
if (!persona) throw new Error(`unknown persona: ${personaId}`);

const scenes = brief.narration.scenes.map((scene) => ({
  role: scene.role,
  ...(scene.index === undefined ? {} : { index: scene.index }),
  // The reading where there is one — the recording says てらしたまりこ while
  // the subtitle keeps 寺下真理子 (types.ts `eventCmSpoken`).
  text: eventCmSpoken(scene),
}));

console.log(`voice=${preset.id} (${preset.voice})  persona=${personaId}  scenes=${scenes.length}`);
const { wav, track } = await generateVoice(scenes, {
  persona,
  voice: preset.voice,
  sceneGapMs: EVENT_CM_SCENE_GAP_MS,
  onProgress: (message) => console.log("  " + message),
});

const audioDir = resolve(lab, "public/assets/audio");
const out = resolve(audioDir, "narration.wav");
if (existsSync(out)) {
  // Keep what was there: a previous take may hold approved readings.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(out, resolve(audioDir, `narration.before-${stamp}.wav`));
}
writeFileSync(out, wav);

const next = { ...brief, narrator: preset.id, voice: { track, audio: "assets/audio/narration.wav" } };
writeFileSync(propsPath, JSON.stringify(next, null, 2) + "\n");

console.log(`wrote ${out} (${wav.length} bytes), totalMs=${track.totalMs}`);
for (const scene of track.scenes as Array<{ role: string; index?: number; durationMs: number }>) {
  console.log(`  ${scene.role}${scene.index === undefined ? "" : "#" + scene.index}: ${scene.durationMs}ms`);
}
