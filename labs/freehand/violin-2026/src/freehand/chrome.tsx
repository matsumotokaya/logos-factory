// The frame around the film: letterbox, vignette, grain, chandelier bokeh,
// spotlight sweep, captions.
//
// Same job as sake-2026's chrome, different instruments. The letterbox is the
// cheapest move that makes a slideshow read as a film, so it stays — but here
// the bars carry a hairline of gold on their inner edge, which is what a
// programme booklet does with a rule and what sumi never did. The drifting
// particles are the other deliberate difference: sake's GoldDust was small,
// numerous and sharp (dust in ink). This is a dozen large, heavily blurred
// discs — a chandelier out of focus at the back of a hall.

import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@/remotion/event-cm/captions";
import { FH, LETTERBOX } from "./palette";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Cinemascope bars, with the programme's hairline on the inner edge.
 *  The rule sits at 0.35 alpha: stronger and the bar reads as a UI element
 *  rather than as the edge of a printed page. */
const BAR_RULE = "rgba(214,188,122,0.35)";

export const Letterbox: React.FC = () => (
  <>
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: LETTERBOX,
        background: FH.groundDeep,
        borderBottom: `1px solid ${BAR_RULE}`,
        boxSizing: "border-box",
        zIndex: 40,
      }}
    />
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: LETTERBOX,
        background: FH.groundDeep,
        borderTop: `1px solid ${BAR_RULE}`,
        boxSizing: "border-box",
        zIndex: 40,
      }}
    />
  </>
);

/** Soft darkening toward the frame edges. Sits over every scene. */
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse 126% 104% at 50% 44%, transparent 52%, rgba(5,3,5,0.58) 100%)",
      zIndex: 20,
      pointerEvents: "none",
    }}
  />
);

/** Film grain with a gentle flicker. Texture, not effect. */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = 0.035 + random(`grain-${Math.floor(frame / 2)}`) * 0.018;
  return (
    <AbsoluteFill style={{ zIndex: 21, pointerEvents: "none", opacity, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id="fh-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#fh-grain)" />
      </svg>
    </AbsoluteFill>
  );
};

/**
 * A chandelier at the back of the hall, out of focus.
 *
 * 12–18 large gold discs, blurred 6–14px, drifting slowly up and to the
 * right. Deterministic (`random()` with a per-disc key), so the same frame
 * always paints the same field — a bokeh that reshuffles between renders is
 * a bokeh nobody can review.
 */
export const ChandelierBokeh: React.FC<{
  count?: number;
  /** Multiplies every disc's alpha — lower it when type sits on top. */
  opacity?: number;
}> = ({ count = 15, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const discs = Array.from({ length: count }, (_, i) => {
    const seed = (k: string) => random(`bokeh-${i}-${k}`);
    const size = 40 + seed("d") * 100;
    const blur = 6 + seed("b") * 8;
    const alpha = (0.06 + seed("a") * 0.16) * opacity;
    // Slow: a disc crosses the frame in roughly a minute, so within one
    // 12-second scene it only breathes.
    const rise = 0.16 + seed("v") * 0.3;
    const spanY = height + size * 2;
    const spanX = width + size * 2;
    const y =
      (((seed("y") * spanY - frame * rise) % spanY) + spanY) % spanY - size;
    const x =
      (((seed("x") * spanX + frame * rise * 0.42) % spanX) + spanX) % spanX - size;
    return { size, blur, alpha, x, y, key: i };
  });
  return (
    <AbsoluteFill style={{ zIndex: 5, pointerEvents: "none", overflow: "hidden" }}>
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

/**
 * A soft beam crossing the frame once.
 *
 * The same vocabulary as the band of light in the supplied violinist
 * portrait — a house light travelling across a curtain. Once per scene,
 * never looping: a sweep that repeats is a screensaver.
 */
export const SpotlightSweep: React.FC<{
  start?: number;
  duration?: number;
  strength?: number;
}> = ({ start = 8, duration = 108, strength = 0.17 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + duration], [0, 1], clamp);
  if (p <= 0 || p >= 1) return null;
  const x = -35 + p * 175;
  // Fades in and out with the crossing, so it never pops at either edge.
  const fade = Math.sin(Math.PI * p);
  return (
    <AbsoluteFill
      style={{
        zIndex: 6,
        pointerEvents: "none",
        opacity: fade,
        background: `radial-gradient(ellipse 30% 130% at ${x}% 38%, rgba(240,223,174,${strength}) 0%, rgba(240,223,174,${strength * 0.34}) 42%, rgba(240,223,174,0) 72%)`,
        mixBlendMode: "screen",
      }}
    />
  );
};

/** Subtitles set in Zen Old Mincho inside the bottom letterbox bar. */
export const FreehandCaptions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const current = captions.find((c) => ms >= c.fromMs && ms < c.toMs);
  if (!current) return null;
  const inMs = ms - current.fromMs;
  const outMs = current.toMs - ms;
  const opacity =
    interpolate(inMs, [0, 180], [0, 1], clamp) * interpolate(outMs, [0, 140], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: LETTERBOX,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: FH.jp,
          fontWeight: 500,
          fontSize: 32,
          letterSpacing: "0.08em",
          color: FH.ivory,
        }}
      >
        {current.text}
      </span>
    </div>
  );
};
