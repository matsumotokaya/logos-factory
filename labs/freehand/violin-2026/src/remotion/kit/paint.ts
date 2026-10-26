// How a mark and a photograph are painted, wherever they are painted.
//
// One definition for the renderer (KitComponent, Stage) and for the storyboard
// (components/video/Storyboard.tsx). The storyboard's claim to honesty is that
// a mark and a photograph look the way the film will draw them — that holds
// only while both read the same conversion, so the conversion lives here and
// nowhere else.

import { staticFile } from "remotion";

/**
 * A src the browser can actually fetch.
 *
 * Absolute URLs pass through — that is what the in-app player hands over, since
 * its materials are signed same-origin URLs. A *relative* src is a file in the
 * project's public directory, and only `staticFile()` knows where the CLI is
 * serving that from.
 *
 * This was an identity function inside KitComponent, which is a bug you cannot
 * see from the app: every src there is already absolute. It only surfaces in a
 * CLI render, where materials are staged as relative paths — the audio resolved
 * (it went through the event template's own copy of this rule) and every logo
 * and photograph 404'd. One rule, one place, so the two cannot diverge again.
 */
export const resolveSrc = (src: string): string =>
  /^(https?:)?\//.test(src) ? src : staticFile(src);

// The treatment vocabulary lives in ./mark, which stays free of Remotion so the
// test runner can reach it. Re-exported here because this file is the one door
// the renderer and the storyboard both already knock on.
export {
  TREATMENT_FILTER,
  groundIsDark,
  markPainting,
  treatmentOn,
  type MarkPaint,
  type MarkPainting,
} from "./mark";

/** Focus point of a photo as CSS object-position. Absent focus is the centre. */
export const focusPosition = (photo: {
  focus?: { x: number; y: number };
}): string => `${(photo.focus?.x ?? 0.5) * 100}% ${(photo.focus?.y ?? 0.5) * 100}%`;