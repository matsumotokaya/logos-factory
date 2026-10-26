// Bundle once, write one still per scene.
//
// `npx remotion still` re-bundles the project on every invocation, which is
// about a minute of webpack per frame; nine scenes make that a coffee break.
// This does the bundle once and then renders each frame, and it takes the
// frame numbers from the same place the film does (scripts/scene-frames.ts).
//
// Usage: node scripts/stills.mjs [outDir]
//   Extra frames can be appended as name=frame pairs:
//   node scripts/stills.mjs out/check title-shot2=290

import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import props from "../props.json" with { type: "json" };

const root = process.cwd();
const outDir = path.resolve(root, process.argv[2] ?? "out/check");

const extra = Object.fromEntries(
  process.argv.slice(3).map((pair) => {
    const [name, frame] = pair.split("=");
    return [name, Number(frame)];
  }),
);

// One frame per SHOT, and two for every clip.
//
// Seven of the nine scenes are cut into two or three shots (sources.ts), so a
// scene mid-frame lands inside whichever shot happens to hold the middle. The
// clips get a second frame just before the NEXT shot starts dissolving over
// them — not before their own cut, which lands mid-dissolve and shows two
// pictures at once. That last clean frame is where the
// two things that go wrong with a clip show up: a subject that has drifted
// behind the letterbox, and a file that has run out and frozen.
//
// Scene starts and lengths come from `npx tsx scripts/scene-frames.ts`; the
// split inside a scene follows SequenceGround — slot_i = round(length *
// weight_i / sum), the last shot taking the remainder.
const FRAMES = {
  // 2026-09-15 cut (3893f). Scene starts: logoIn 0, title 120, value 285,
  // program#0 829, program#1 1947, program#2 2434, cta 3223, logoOut 3773.
  "logoin-title-card": 70,
  "title-a0-kv": 202,
  "value-1-a3-clip": 385,
  "value-2-e2": 500,
  "value-3-a5-salon": 705,
  "program0-1-b1-clip": 929,
  "program0-2-a2-clip": 1040,
  "program0-3-b3-clip": 1166,
  "program0-4-a4-clip": 1292,
  "program0-5-b5-plinth": 1650,
  "program1-1-b2-clip": 2017,
  "program1-1-b2-clip-end": 2024,
  "program1-2-e1": 2125,
  "program1-3-b6-scrolls": 2321,
  "program2-1-b4-bench": 2631,
  "program2-2-b7-desk": 3025,
  "cta-1-e5-wide": 3320,
  "cta-2-c1-reception": 3514,
  "cta-3-d1-clip": 3691,
  "logoout-credit": 3853,
  ...extra,
};

const serveUrl = await bundle({
  entryPoint: path.join(root, "src/index.ts"),
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: { ...config.resolve?.alias, "@": path.join(root, "src") },
    },
  }),
  onProgress: (p) => {
    if (p % 25 === 0) console.log(`bundling ${p}%`);
  },
});
console.log("bundled:", serveUrl);

const composition = await selectComposition({
  serveUrl,
  id: "event-cm",
  inputProps: props,
});
console.log(`composition ${composition.durationInFrames}f @ ${composition.fps}fps`);

for (const [name, frame] of Object.entries(FRAMES)) {
  const output = path.join(outDir, `${name}.png`);
  await renderStill({
    composition,
    serveUrl,
    output,
    frame,
    inputProps: props,
    imageFormat: "png",
    overwrite: true,
  });
  console.log(`still ${name} @ ${frame} -> ${output}`);
}
console.log("done");
