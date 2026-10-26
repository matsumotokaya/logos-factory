// Persistent background for the event promo template: a slowly drifting
// ink-black/indigo field with rising gold particles and a vignette. Fully
// deterministic (seeded pseudo-random from particle index) so preview and
// MP4 render identically. This is the "rich even with zero photos" layer —
// when a hero photo exists it sits *between* this and the text, dimmed.

import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EVENT_GOLD } from "./palette";

/** Deterministic [0,1) from an integer seed — no Math.random in Remotion. */
const rand = (seed: number): number => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface Particle {
  x: number; // 0..1 of width
  size: number; // px
  speed: number; // px per frame upward
  sway: number; // horizontal sway amplitude px
  phase: number; // sway phase offset
  baseOpacity: number;
  twinkle: number; // twinkle frequency
}

const PARTICLE_COUNT = 70;

export const EventBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        x: rand(i * 7 + 1),
        size: 2 + rand(i * 13 + 2) * 5,
        speed: 0.25 + rand(i * 17 + 3) * 0.55,
        sway: 12 + rand(i * 19 + 4) * 30,
        phase: rand(i * 23 + 5) * Math.PI * 2,
        baseOpacity: 0.16 + rand(i * 29 + 6) * 0.5,
        twinkle: 0.02 + rand(i * 31 + 7) * 0.04,
      })),
    []
  );

  // The indigo glow drifts slowly from lower-left toward upper-right across
  // the whole video — barely perceptible, but the frame never sits still.
  const gx = interpolate(frame, [0, durationInFrames], [32, 66]);
  const gy = interpolate(frame, [0, durationInFrames], [78, 40]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d13" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at ${gx}% ${gy}%, #182238 0%, #10141f 45%, #0b0d13 100%)`,
        }}
      />
      {/* faint gold bloom, bottom center — the "warmth of sake" light */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 42% at 50% 108%, rgba(201,164,92,0.16) 0%, rgba(201,164,92,0) 70%)`,
        }}
      />
      {particles.map((p, i) => {
        const travel = height + 80;
        // Each particle loops its own rise; phase-shifted so loops never sync.
        const progress = ((frame * p.speed + rand(i * 37 + 8) * travel) % travel) / travel;
        const y = height + 40 - progress * travel;
        const x = p.x * width + Math.sin(frame * 0.02 + p.phase) * p.sway;
        const twinkle = 0.65 + 0.35 * Math.sin(frame * p.twinkle * Math.PI * 2 + p.phase);
        // Fade at both ends of the rise so particles never pop in/out.
        const edgeFade = interpolate(progress, [0, 0.08, 0.85, 1], [0, 1, 1, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: EVENT_GOLD,
              opacity: p.baseOpacity * twinkle * edgeFade,
              boxShadow: `0 0 ${p.size * 3}px rgba(230,201,139,0.5)`,
            }}
          />
        );
      })}
      {/* vignette keeps the eye centered and the type readable */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(85% 70% at 50% 46%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.42) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
