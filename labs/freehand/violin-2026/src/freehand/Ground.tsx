// The grounds: clips, stills in sequence, and the curtain that stands in for
// material that has not arrived yet.
//
// Two rules carried over from sake-2026, unchanged:
//  - CLIPS NEVER LOOP. A clip's weight is set so its slot ends before the
//    file does; a loop's seam reads as a mistake.
//  - Clips are locked off. Their inherent motion IS the camera move, so this
//    layer only grades them; the Ken Burns belongs to the stills.
//
// One rule that is new here: shots DISSOLVE into each other over 18 frames
// rather than cutting. sake cut everything hard, which suited 墨; a curtain
// does not cut, and the luxury direction asks for the join to be felt rather
// than seen. Hard cuts are kept for the chapter heads, which are scene
// boundaries and therefore not this file's business.

import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { resolveSrc } from "@/remotion/kit/paint";
import { ChandelierBokeh, SpotlightSweep } from "./chrome";
import { CameraMove, Photo } from "./Photo";
import { VELVET_GRADIENT } from "./palette";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** How long one shot takes to become the next. */
export const DISSOLVE_FRAMES = 18;

export const VideoGround: React.FC<{
  src: string;
  opacity?: number;
  grade?: string;
}> = ({ src, opacity = 1, grade }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    {/* No loop, by policy — see the header. */}
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

/**
 * The curtain: the ground for every scene whose material has not landed.
 *
 * Deliberately NOT a grey box with a filename in it. The film has to be
 * watchable at every point in the production, so the stand-in is a finished
 * picture — velvet lit from above, folds, and the chandelier out of focus
 * behind it — that the generated footage will replace rather than rescue.
 */
export const VelvetGround: React.FC<{
  /** A house light crossing once. Used where the scene is about arriving. */
  sweep?: boolean;
  /** Fewer, dimmer discs where type has to win. */
  bokeh?: number;
  bokehOpacity?: number;
}> = ({ sweep = false, bokeh = 15, bokehOpacity = 1 }) => (
  <AbsoluteFill style={{ overflow: "hidden", background: VELVET_GRADIENT }}>
    {/* Folds. An 84px period with soft stops reads as heavy fabric; a
        shorter period with harder stops reads as scan lines, which is the
        failure mode this is tuned away from. */}
    <AbsoluteFill
      style={{
        background:
          "repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0) 42px, rgba(0,0,0,0.3) 84px)",
        opacity: 0.42,
      }}
    />
    {/* The floor the curtain stands on. */}
    <AbsoluteFill
      style={{
        background: "linear-gradient(to top, rgba(3,2,3,0.92) 0%, rgba(3,2,3,0) 34%)",
      }}
    />
    <ChandelierBokeh count={bokeh} opacity={bokehOpacity} />
    {sweep ? <SpotlightSweep /> : null}
  </AbsoluteFill>
);

/** One shot of a sequence: a clip played once, or a still with a camera move. */
export interface GroundShot {
  kind: "video" | "image" | "velvet";
  src?: string;
  /**
   * Share of the scene this shot holds (normalised against the sum). Clips
   * set theirs so the slot ends BEFORE the file does — a clip that runs out
   * freezes, and a freeze inside a cut reads as a glitch.
   */
  weight?: number;
  focus?: { x: number; y: number };
  move?: CameraMove;
  grade?: string;
  /** velvet only. */
  sweep?: boolean;
  /** How this shot arrives. Dissolve unless the join wants to be seen. */
  transition?: "dissolve" | "cut";
}

/** One shot inside its slot, fading up if it dissolves in. */
const Shot: React.FC<{
  shot: GroundShot;
  length: number;
  fadeIn: number;
}> = ({ shot, length, fadeIn }) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1;
  return (
    <AbsoluteFill style={{ opacity }}>
      {shot.kind === "video" ? (
        <VideoGround src={shot.src!} grade={shot.grade} />
      ) : shot.kind === "velvet" ? (
        <VelvetGround sweep={shot.sweep} />
      ) : (
        <Photo
          src={shot.src!}
          length={length}
          move={shot.move ?? { scaleFrom: 1.04, scaleTo: 1.12 }}
          focus={shot.focus ?? { x: 0.5, y: 0.5 }}
          grade={shot.grade}
        />
      )}
    </AbsoluteFill>
  );
};

/**
 * Shots laid end to end across a scene, dissolving into one another.
 *
 * A dissolving shot starts DISSOLVE_FRAMES early and fades up over the one
 * below it, so the outgoing picture is still moving underneath — which is
 * the whole point of dissolving rather than cutting. The slot arithmetic is
 * worked out before the JSX so the last shot absorbs any rounding and no gap
 * can open at the end of the scene.
 */
export const SequenceGround: React.FC<{
  shots: GroundShot[];
  length: number;
}> = ({ shots, length }) => {
  const total = shots.reduce((sum, shot) => sum + (shot.weight ?? 1), 0);

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
        const dissolving = i > 0 && (shot.transition ?? "dissolve") === "dissolve";
        const overlap = dissolving ? Math.min(DISSOLVE_FRAMES, start) : 0;
        return (
          <Sequence key={i} from={start - overlap} durationInFrames={slot + overlap}>
            <Shot shot={shot} length={slot + overlap} fadeIn={overlap} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
