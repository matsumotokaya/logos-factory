// ラグジュアリー's atmosphere (theme.ts `motion.background: "bokeh"`): a
// velvet curtain lit from above, and a slow drift of large, soft gold discs —
// a chandelier out of focus.
//
// Carried back from the Freehand Lab (labs/freehand/violin-2026,
// `ChandelierBokeh` and `VELVET_GRADIENT`). It is the "素材ゼロでも完成品"
// layer of this painting, the way EventBackground is 墨's: a scene with no
// photograph stands on this and still reads as a hall rather than a slide.
//
// Deliberately NOT a parameterised EventBackground. That file is 墨's field
// (indigo, small rising particles); this is a different object — a dozen or so
// big discs that only breathe within one scene — and sharing one component
// would make each painting a setting of the other.

import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";

/** The curtain, top-lit, falling into the ground (#0b080a). */
const VELVET =
  "radial-gradient(ellipse 120% 92% at 50% 6%, #3a1219 0%, #200a10 38%, #0b080a 78%)";

/** How many discs. The lab settled on 12–18; more reads as snow. */
const DISCS = 15;

export const BokehBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const discs = Array.from({ length: DISCS }, (_, i) => {
    const seed = (k: string) => random(`luxury-bokeh-${i}-${k}`);
    const size = 40 + seed("d") * 100;
    const blur = 6 + seed("b") * 8;
    const alpha = 0.06 + seed("a") * 0.16;
    // Slow: a disc crosses the frame in roughly a minute, so within one
    // scene it only breathes.
    const rise = 0.16 + seed("v") * 0.3;
    const spanY = height + size * 2;
    const spanX = width + size * 2;
    const y = ((((seed("y") * spanY - frame * rise) % spanY) + spanY) % spanY) - size;
    const x = ((((seed("x") * spanX + frame * rise * 0.42) % spanX) + spanX) % spanX) - size;
    return { size, blur, alpha, x, y, key: i };
  });
  return (
    <AbsoluteFill style={{ background: VELVET, overflow: "hidden" }}>
      {discs.map((d) => (
        <div
          key={d.key}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            borderRadius: "50%",
            // A real bokeh disc is brighter at its rim than at its centre.
            background: `radial-gradient(circle at 50% 50%, rgba(240,223,174,${d.alpha * 0.55}) 0%, rgba(240,223,174,${d.alpha}) 72%, rgba(240,223,174,0) 100%)`,
            filter: `blur(${d.blur}px)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
