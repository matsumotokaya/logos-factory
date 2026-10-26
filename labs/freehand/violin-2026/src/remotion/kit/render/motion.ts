import { interpolate } from "remotion";
import type { MotionMove, Theme } from "../theme";
import type { Emphasis } from "../components";

// Turning a theme's named moves into style.
//
// Scenes never name a move; they name an emphasis, and the theme says how
// something of that loudness arrives. That indirection is what lets a theme be
// swapped without touching a scene, and it is why the combination of themes
// and scenes stays finite (theme.ts).
//
// Remotion rule: animate through useCurrentFrame/interpolate only — CSS
// transitions do not render.

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export interface MoveStyle {
  opacity: number;
  transform?: string;
  filter?: string;
  /** Set by `wipe` and `draw`, which reveal rather than move. */
  clipPath?: string;
  scaleX?: number;
}

/** Progress 0→1 of an entrance beginning at `delay`. */
export const enterProgress = (frame: number, delay: number, frames: number): number =>
  easeOut(
    interpolate(frame, [delay, delay + frames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

export function moveStyle(move: MotionMove, t: number): MoveStyle {
  switch (move) {
    case "fade":
      return { opacity: t };
    case "rise":
      // The title move: up, in, and out of blur. Blur is what makes a serif
      // reveal read as deliberate rather than as a slide transition.
      return {
        opacity: t,
        transform: `translateY(${(1 - t) * 30}px)`,
        filter: `blur(${(1 - t) * 6}px)`,
      };
    case "settle":
      return { opacity: t, transform: `translateY(${(1 - t) * 14}px)` };
    case "wipe":
      return { opacity: 1, clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` };
    case "draw":
      // For rules: opens from the centre outwards.
      return { opacity: t, scaleX: t };
    case "bloom":
      return { opacity: t, transform: `scale(${0.94 + t * 0.06})` };
  }
}

/** The entrance for one component, as inline style. */
export function enterStyle(
  theme: Theme,
  emphasis: Emphasis,
  frame: number,
  delay: number,
): React.CSSProperties {
  const move = theme.motion.enter[emphasis];
  const style = moveStyle(move, enterProgress(frame, delay, theme.motion.enterFrames));
  return {
    opacity: style.opacity,
    transform: style.scaleX !== undefined ? `scaleX(${style.scaleX})` : style.transform,
    filter: style.filter,
    clipPath: style.clipPath,
  };
}

/**
 * Scene-level fade. Every scene fades in over its entrance and out over its
 * last frames, so a cut never lands on a hard edge unless the theme asks for
 * one.
 */
export function sceneFade(theme: Theme, frame: number, length: number): number {
  if (theme.motion.transition === "cut") return 1;
  return (
    interpolate(frame, [0, theme.motion.enterFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(frame, [length - theme.motion.exitFrames, length - 2], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
}

/**
 * Components arrive one after another, not together.
 *
 * The stagger is what makes a stack read as composed. Fixed per index rather
 * than per component so the rhythm is the theme's, not the content's.
 */
export const enterDelay = (index: number): number => 6 + index * 8;
