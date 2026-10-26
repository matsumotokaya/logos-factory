// The Japanese faces the themes name, actually loaded.
//
// `theme.ts` declares stacks like `"Hiragino Mincho ProN", …, "Noto Serif JP",
// serif`. A stack is a list of names, not a delivery mechanism: on this Mac the
// first entry resolves from the system and the film looks right, so nothing
// ever revealed that no @font-face for the later entries existed. On a machine
// without the Hiragino/Yu families — every Linux renderer, Remotion Lambda
// included — the stack walks to the end and every Japanese glyph comes out as
// tofu.
//
// So load the fonts the stacks already name. This is deliberately additive:
// the stacks are untouched, Hiragino still wins wherever it is installed, and
// the approved geometry stays measured against the same face it was approved
// on. What changes is only what happens after Hiragino is absent.
//
// Imported for its side effect by the compositions (EventCmComposition), which
// is the one module both the in-app <Player> and the Remotion CLI go through.
// It is NOT imported by `theme.ts`, because that file is read by server code
// too and `loadFont` belongs to a render context.

import { loadFont as loadNotoSerifJP } from "@remotion/google-fonts/NotoSerifJP";
import { loadFont as loadNotoSansJP } from "@remotion/google-fonts/NotoSansJP";

// 300 / 600 / 700 are what the kit asks for (grep `fontWeight` in remotion/),
// plus 400 for anything that does not say. Narrower than the full family on
// purpose: each weight of a CJK face is megabytes.
//
// Remotion warns that this makes ~484 requests per font per render, and it is
// right: Google slices a CJK family into ~121 unicode ranges, so four weights
// is four times that. The alternative — committing the files and serving them
// with `staticFile()` — was measured before choosing this: 11.5 MB for Noto
// Serif JP and 8.7 MB for Noto Sans JP at three weights, 20 MB into a git
// repository, for the same bytes the renderer would otherwise fetch. Neither
// side is free. This choice is worth revisiting when the renderer moves to
// Lambda, where a cold browser refetches all of it per render.
const WEIGHTS = ["300", "400", "600", "700"] as const;
const SUBSETS = ["japanese", "latin"] as const;

const mincho = loadNotoSerifJP("normal", {
  weights: [...WEIGHTS],
  subsets: [...SUBSETS],
});

const gothic = loadNotoSansJP("normal", {
  weights: [...WEIGHTS],
  subsets: [...SUBSETS],
});

/**
 * The loaded family names, for anyone who needs to assert that the face a
 * theme falls back to is one this module actually delivers.
 */
export const LOADED_FONT_FAMILIES = [mincho.fontFamily, gothic.fontFamily];
