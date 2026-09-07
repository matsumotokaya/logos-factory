// Video and collage grounds, beside Photo.tsx's stills.
//
// A clip plays LOCKED-OFF on purpose: the generated material was prompted to
// hold its camera still because this layer moves one, so if both move the
// frame drifts. For clips, the inherent motion IS the camera move, and this
// layer only grades and darkens.

import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { resolveSrc } from "@/remotion/kit/paint";
import { CameraMove, Photo } from "./Photo";

export const VideoGround: React.FC<{
  src: string;
  opacity?: number;
  grade?: string;
}> = ({ src, opacity = 1, grade }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    {/* No loop, by policy: a clip that has to repeat is a clip in the wrong
        slot — sequences (SequenceGround) cut to the next shot instead. */}
    <Video
      src={resolveSrc(src)}
      muted
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity,
        ...(grade ? { filter: grade } : {}),
      }}
    />
  </AbsoluteFill>
);

/** One shot of a sequence: a clip played once, or a still with a camera move. */
export interface GroundShot {
  kind: "video" | "image";
  src: string;
  /**
   * Share of the scene this shot holds (normalised against the sum). Clips
   * set theirs so the slot ends BEFORE the file does — a clip that runs out
   * freezes, and a freeze inside a cut reads as a glitch.
   */
  weight?: number;
  focus?: { x: number; y: number };
  move?: CameraMove;
  grade?: string;
}

/**
 * Shots cut end-to-end across a scene — the answer to "a looping clip looks
 * unnatural". Nothing loops: each clip plays once, each still gets the Ken
 * Burns the clips must not have, and the scene changes shot the way the film
 * changes scene. Cuts are hard, like the film's own.
 */
export const SequenceGround: React.FC<{
  shots: GroundShot[];
  length: number;
}> = ({ shots, length }) => {
  const total = shots.reduce((sum, shot) => sum + (shot.weight ?? 1), 0);

  // Cuts worked out before the JSX, rather than by advancing a cursor inside
  // the map: the last shot takes whatever is left, so rounding never opens a
  // gap at the end of the scene. Same arithmetic, no variable reassigned while
  // rendering (react-hooks/purity).
  const cuts: Array<{ start: number; slot: number }> = [];
  for (const [i, shot] of shots.entries()) {
    const previous = cuts[cuts.length - 1];
    const start = previous ? previous.start + previous.slot : 0;
    cuts.push({
      start,
      slot:
        i === shots.length - 1
          ? length - start
          : Math.round((length * (shot.weight ?? 1)) / total),
    });
  }

  return (
    <AbsoluteFill>
      {shots.map((shot, i) => {
        const { start, slot } = cuts[i];
        return (
          <Sequence key={i} from={start} durationInFrames={slot}>
            {shot.kind === "video" ? (
              <VideoGround src={shot.src} grade={shot.grade} />
            ) : (
              <Photo
                src={shot.src}
                length={slot}
                move={shot.move ?? { scaleFrom: 1.04, scaleTo: 1.12 }}
                focus={shot.focus ?? { x: 0.5, y: 0.5 }}
                grade={shot.grade}
              />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * A tiled wall of photographs, drifting slowly sideways.
 *
 * Two rows offset like brickwork, oversized beyond the frame so the drift
 * never shows an edge. The tiles are graded down as one — a collage of
 * eight bright photographs is a checkerboard, and the scene's text still has
 * to win.
 */
export const CollageGround: React.FC<{
  srcs: string[];
  length: number;
  opacity?: number;
}> = ({ srcs, length, opacity = 0.72 }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, Math.max(1, length)], [0, -70], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const GAP = 10;
  const TILE_W = 560;
  const TILE_H = (1080 - GAP) / 2;
  const perRow = Math.ceil(srcs.length / 2);
  const rows = [srcs.slice(0, perRow), srcs.slice(perRow)];
  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity }}>
      <div style={{ transform: `translateX(${drift}px)` }}>
        {rows.map((row, r) => (
          <div
            key={r}
            style={{
              display: "flex",
              gap: GAP,
              marginBottom: GAP,
              // The second row starts half a tile back — brickwork, so the
              // vertical seams do not line up into a grid crosshair.
              marginLeft: r === 1 ? -TILE_W / 2 : 0,
            }}
          >
            {row.map((src, i) => (
              <Img
                key={i}
                src={resolveSrc(src)}
                style={{
                  width: TILE_W,
                  height: TILE_H,
                  objectFit: "cover",
                  // The press photos are already dark interiors; graded UP
                  // slightly, because the collage sits under its own opacity
                  // and the scene's scrim — three darkenings stacked read as
                  // "footage of nothing" (v6 measured exactly that).
                  filter: "saturate(0.88) brightness(1.18)",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
