// Renders the same seeded film in each art direction, one still per scene.
//
// The point is to LOOK at a new theme rather than trust its numbers: the values
// that had to be lifted out of the composition (letterbox colour, caption
// plate, directional scrim) are exactly the ones a light theme gets wrong
// silently. Writes var/theme-compare/<themeId>-<scene>.png.
//
//   npx tsx scripts/compare-art-directions.ts

import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { seedEventCmBrief } from "@/lib/templates/event-cm/seed";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { THEMES } from "@/remotion/kit/theme";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const OUT = path.resolve("var/theme-compare");

async function main() {
  // WITH A LOGO, deliberately.
  //
  // This tool's blind spot shipped a bug. A brand with no `logoSrc` draws every
  // mark as a typographic credit, so both art directions came out looking fine
  // and the review passed — while the actual failure only exists on the image
  // path, where a knocked-out mark lands invisible on the standard ground. A
  // comparison that cannot reach the code being compared is not a comparison.
  //
  // Measured as a dark mark on transparency: the exact combination that has to
  // come out white on ink and dark on the light ground.
  // The measurement goes in WITH the artwork now. This used to patch it onto
  // the seeded brief afterwards, which worked here and hid the actual defect:
  // nothing in the product was carrying a measurement into a brief at all.
  const brand = {
    name: "みらい経営研究所",
    industry: "コンサルティング",
    logo: { src: "defaults/marks/gate.svg", opaque: false, luminance: 0.05 },
  };

  // The same alias override remotion.config.ts declares for the CLI. A direct
  // bundle() call does not read that file, and without it the kit's `@/`
  // imports cannot resolve at all.
  const serveUrl = await bundle({
    entryPoint: path.resolve("remotion/index.ts"),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: { ...config.resolve?.alias, "@": path.join(process.cwd()) },
      },
    }),
  });

  for (const themeId of Object.keys(THEMES)) {
    // Seeded PER PAINTING, not seeded once and re-stamped. The dressing —
    // music, stock pictures — follows the art direction (catalog.ts
    // `artDirections`), so a brief seeded as 墨 and then relabelled standard
    // would show standard wearing 墨's tea room, which is exactly the frame
    // this tool exists to catch and not the one anybody would ship.
    const brief: EventCmBrief = seedEventCmBrief(brand, {
      now: new Date("2026-08-21T00:00:00Z"),
      seed: "compare",
      artDirection: themeId,
    });
    const film = eventCmFilm(brief);
    const composition = await selectComposition({
      serveUrl,
      id: "event-cm",
      inputProps: { brief },
    });
    console.log(`\n[${themeId}] ${film.scenes.length} シーン / ${(film.totalMs / 1000).toFixed(1)}秒`);
    for (const scene of film.scenes) {
      // Late in the scene, not the middle.
      //
      // The middle was chosen so entrance animations would be over, and for
      // the title it is not: its per-character cascade is still running at the
      // halfway mark, so the still showed 「…話をし」 with the tail blurred and
      // 「ます」 absent. That reads as clipped type, and a check that invents a
      // defect is worse than no check — this one cost a full investigation
      // before the frame turned out to be the only thing wrong.
      //
      // Not the very end either: the closing mark fades out there.
      const frame = Math.round(((scene.fromMs + scene.durationMs * 0.75) / 1000) * composition.fps);
      const out = path.join(OUT, `${themeId}-${scene.key}.png`);
      await renderStill({
        composition: {
          ...composition,
          durationInFrames: Math.ceil((film.totalMs / 1000) * composition.fps),
        },
        serveUrl,
        output: out,
        frame,
        inputProps: { brief },
        overwrite: true,
      });
      console.log(`  ${scene.key.padEnd(12)} frame ${String(frame).padStart(5)} -> ${path.basename(out)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
