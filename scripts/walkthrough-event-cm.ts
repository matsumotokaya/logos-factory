// The whole film, end to end, on this machine: seed → narration → voice → MP4.
//
//   npm run event-cm:walkthrough
//
// TWO PROCESSES, and it has to be. `narration.ts` imports `server-only`, which
// throws unless Node runs with `--conditions=react-server`; Remotion's CJS
// entry cannot be loaded under that same condition. So this file stops at a
// props file and the npm script hands it to the Remotion CLI — the same CLI
// path `event:render` already uses, rather than a second renderer.
//
// A VERIFICATION TOOL, the same category as compare-art-directions.ts — not a
// second pipeline. Every decision is made by the product's own functions
// (`seedEventCmBrief`, `draftEventCmNarration`, `generateVoice`,
// `eventCmFilm`); the only thing this file does differently is put the bytes on
// disk instead of in R2. If it drifts from what the app produces, the wiring
// here is what is wrong.
//
// It exists because until now the template had only ever been looked at as
// stills. Stills cannot show whether the narration lands inside its scene,
// whether the voice and the timeline agree, or whether the music ducks — and
// those are the three things a viewer notices first.
//
// Costs money: one LLM call for the narration and one TTS pass per scene.

import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { seedEventCmBrief } from "@/lib/templates/event-cm/seed";
import { draftEventCmNarration } from "@/lib/templates/event-cm/narration";
import { EVENT_CM_PERSONA } from "@/lib/templates/event-cm/delivery";
import { generateVoice } from "@/lib/voice/synthesize";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { EVENT_CM_SCENE_GAP_MS } from "@/remotion/event-cm/timeline";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const OUT = path.resolve("var/event-cm");
// Under public/ because the composition resolves a bare path with
// `staticFile()` — the same way it reaches the default BGM.
const VOICE_DIR = path.resolve("public/walkthrough");
const VOICE_NAME = "walkthrough-narration.wav";

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}秒`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(VOICE_DIR, { recursive: true });

  // 1. Seed. No LLM, no network — the state a user sees one click after
  //    "add a video".
  const seeded = seedEventCmBrief(
    {
      name: "WealthPark Lab",
      industry: "金融教育メディア",
      logo: { src: "defaults/marks/gate.svg", opaque: false, luminance: 0.05 },
    },
    { now: new Date("2026-08-25T00:00:00Z"), seed: "walkthrough" },
  );
  const seededFilm = eventCmFilm(seeded);
  console.log(
    `1. シード      ${seededFilm.scenes.length}シーン / ${seconds(seededFilm.totalMs)}（下書きのナレーション）`,
  );

  // 2. Narration. The draft the seeder leaves says only what each scene is FOR;
  //    this is where the film starts saying something about the event.
  const drafted = await draftEventCmNarration(seeded, { now: new Date().toISOString() });
  const written: EventCmBrief = { ...seeded, narration: drafted.narration };
  const writtenFilm = eventCmFilm(written);
  console.log(
    `2. ナレーション ${drafted.narration.scenes.length}行 / ${seconds(writtenFilm.totalMs)}` +
      (drafted.usage
        ? `（in ${drafted.usage.inputTokens} / out ${drafted.usage.outputTokens} tokens）`
        : ""),
  );
  for (const scene of drafted.narration.scenes) {
    console.log(`     ${scene.role}${scene.index ?? ""}: ${scene.text}`);
  }

  // 3. Voice. The gap comes from the template, not from this file: the timeline
  //    already states the same pause before any audio exists, and the estimate
  //    and the recording have to be built on the same number.
  const { wav, track } = await generateVoice(drafted.narration.scenes, {
    persona: EVENT_CM_PERSONA,
    sceneGapMs: EVENT_CM_SCENE_GAP_MS,
    onProgress: (message) => console.log(`     ${message}`),
  });
  writeFileSync(path.join(VOICE_DIR, VOICE_NAME), wav);
  const brief: EventCmBrief = {
    ...written,
    voice: { track, audio: `walkthrough/${VOICE_NAME}` },
  };
  const film = eventCmFilm(brief);
  console.log(
    `3. 読み上げ    ${track.scenes.length}シーン / 録音 ${seconds(track.totalMs)} / 映像 ${seconds(film.totalMs)}`,
  );
  const props = path.join(OUT, "walkthrough.props.json");
  writeFileSync(props, JSON.stringify({ brief }, null, 2));
  console.log(`4. 書き出し待ち ${props}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
