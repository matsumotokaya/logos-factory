// How a mark is painted, and on what ground.
//
// Split out of paint.ts, which reaches Remotion's `staticFile` and therefore
// cannot be loaded under `--conditions=react-server` — the condition the test
// runner uses. A rule the tests cannot import is a rule nothing holds in place,
// and this one had already shipped wrong once. paint.ts re-exports everything
// here, so callers still have one door.

import type { LogoTreatment } from "@/remotion/event/types";

export const TREATMENT_FILTER: Record<LogoTreatment, string | undefined> = {
  light: undefined,
  invert: "invert(1)",
  knockout: "brightness(0) invert(1)",
  blackout: "brightness(0)",
};

/**
 * Whether a ground is dark enough that a mark has to be made light on it.
 *
 * Read off the theme's own canvas colour rather than declared a second time,
 * so a palette and its polarity cannot disagree. Anything unparseable is
 * treated as dark: that is what every theme was until `standard` arrived, and
 * an approved film must not change because a colour was written differently.
 */
export const groundIsDark = (ground: string): boolean => {
  const hex = /^#([0-9a-f]{6})$/i.exec(ground.trim());
  if (!hex) return true;
  const n = parseInt(hex[1], 16);
  // Rec. 601 luma. Precision beyond "which side of the middle" is not needed
  // here, and the alternative — sRGB linearisation — moves no ground we have.
  const luma =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luma < 0.5;
};

/** What was measured about a mark, plus whatever the brief already recorded. */
export interface MarkPaint {
  /** No alpha channel to cut. A filter cannot remove a white plate. */
  opaque?: boolean | null;
  /** 0–1. `null`/absent means NOT MEASURED — which is not the same as dark. */
  luminance?: number | null;
  /** A treatment the pipeline or a person already committed to. */
  treatment?: LogoTreatment;
}

/**
 * How a mark is painted on THIS ground, from what was measured about the mark.
 *
 * **The treatment is a painting decision, so it belongs to the theme.** It is
 * the same category as the letterbox colour, the caption plate and the
 * directional scrim — three values that were frozen into the composition for
 * 墨 and had to be lifted out the moment a second art direction existed. This
 * is the fourth of that family, and it was missed because it hides behind a
 * default parameter rather than a literal: `treatment = "knockout"` is the
 * right answer on ink and paints an invisible white mark on the standard
 * ground.
 *
 * So a brief carries the MEASUREMENT and the theme derives the treatment. A
 * treatment frozen into a brief is a mark painted for exactly one ground, which
 * means the art direction is not swappable — the whole point of having two.
 *
 * Order of precedence, and why:
 *
 *   1. **A recorded treatment wins.** Existing briefs carry one and no
 *      measurement, and one of them is a delivered commission. Deriving over
 *      the top of it would repaint an approved film.
 *   2. **Unmeasured artwork falls to the treatment that cannot fail** — every
 *      pixel forced to the far side of the ground. It loses the brand's colour,
 *      which is the accepted cost of a mark that is legible at all. This is
 *      asked BEFORE opacity, because "not measured" used to be answered as
 *      "opaque" and that is what made marks vanish.
 *   3. **Measured opaque artwork is drawn as supplied, on any ground.**
 *      `knockout` on an opaque raster paints the plate white along with the
 *      mark; on a light ground `blackout` would paint it black. Cutting a plate
 *      away is an image operation at ingest, never a filter at draw time.
 *   4. **On measured transparency, the mark ends up opposite the ground.**
 *
 * This answers "how would it be painted", which is not the same question as
 * "will it be visible" — that one belongs to `markPainting` below, and it is
 * the one to call from a renderer.
 */
export const treatmentOn = (ground: string, mark: MarkPaint): LogoTreatment => {
  if (mark.treatment) return mark.treatment;
  const dark = groundIsDark(ground);
  // MEASURED-ness is asked FIRST, because `opaque ?? true` answered it wrong.
  //
  // That default read an absent measurement as "opaque", which routed every
  // unmeasured mark to `light` — drawn as supplied — and rule 4 below could
  // never be reached. A near-black SVG then landed unchanged on the ink ground
  // and disappeared, which is exactly what shipped: the newest take's brief
  // carries no measurement at all while `brand_materials` holds
  // `opaque: false, luminance: 0.003` for the very same file.
  //
  // `null` means NOT MEASURED, never `false` — and never `true` either. This
  // codebase has now been bitten from both sides of that (docs/asset-
  // normalization.md records three from the `false` side), so the unmeasured
  // case gets its own branch rather than a default parameter.
  const measured = mark.opaque !== null && mark.opaque !== undefined;
  if (!measured) return dark ? "knockout" : "blackout";
  if (mark.opaque) return "light";
  if (mark.luminance === null || mark.luminance === undefined) {
    return dark ? "knockout" : "blackout";
  }
  // Already opposite the ground: draw it as supplied and keep its colour.
  const markIsLight = mark.luminance >= 0.45;
  if (markIsLight === dark) return "light";
  // On the wrong side. Forced to the far side rather than inverted: `invert`
  // turns a two-tone mark into two wrong tones, while a flat silhouette is how
  // a mark is normally credited on a ground it cannot sit on. `invert` stays in
  // the vocabulary for a brief that asks for it by name.
  return dark ? "knockout" : "blackout";
};

/**
 * Where a treatment leaves the mark's own lightness, or `null` when unknowable.
 *
 * `knockout` and `blackout` force a side, so they answer without a
 * measurement. `light` and `invert` keep the artwork's own tones, so they can
 * only be judged against one.
 */
const paintedSide = (
  treatment: LogoTreatment,
  mark: MarkPaint,
): "light" | "dark" | null => {
  if (treatment === "knockout") return "light";
  if (treatment === "blackout") return "dark";
  if (mark.luminance === null || mark.luminance === undefined) return null;
  const lightness = treatment === "invert" ? 1 - mark.luminance : mark.luminance;
  return lightness >= 0.45 ? "light" : "dark";
};

/** Artwork with a filter to paint it, or the credit line instead. */
export type MarkPainting =
  | { draw: "artwork"; treatment: LogoTreatment; filter: string | undefined }
  | { draw: "credit"; why: string };

/**
 * Whether this mark can be drawn on this ground at all — and how.
 *
 * **The one authority on "will this be visible".** The recurring defect in this
 * area is not a wrong filter, it is drawing something the same colour as what
 * is behind it, and that had no single place to be prevented: `treatmentOn`
 * chose a filter and nobody afterwards asked whether the result could be seen.
 * So the last step is a check, not a guess, and it runs no matter where the
 * treatment came from — derived, recorded, or handed in by a person.
 *
 *   - **A collision that a filter can fix is fixed.** Transparent artwork is
 *     forced to the far side of the ground.
 *   - **A collision no filter can fix means the artwork is not drawn.** An
 *     opaque mark whose plate matches the ground has no good answer:
 *     `knockout` paints the plate white and `blackout` paints it black, so
 *     either way it is a rectangle. A rectangle is not more legible than
 *     nothing — it is a different defect, and this repository has shipped it.
 *     The credit line is legible on every ground and is what this art
 *     direction already draws when there is no artwork.
 *   - **What cannot be proven is left alone.** An unmeasured mark carrying a
 *     recorded treatment is how the delivered commission is stored; overriding
 *     on suspicion would repaint an approved film. Only a provable collision
 *     moves anything.
 */
export const markPainting = (ground: string, mark: MarkPaint): MarkPainting => {
  const groundSide = groundIsDark(ground) ? "dark" : "light";
  const chosen = treatmentOn(ground, mark);
  if (paintedSide(chosen, mark) !== groundSide) {
    return { draw: "artwork", treatment: chosen, filter: TREATMENT_FILTER[chosen] };
  }
  // Provably the same side as the ground. Opaque artwork cannot be filtered out
  // of the collision, so it is not drawn.
  if (mark.opaque) {
    return { draw: "credit", why: "地と同じ明度の不透明なロゴなので、名前で表示します" };
  }
  const rescue: LogoTreatment = groundSide === "dark" ? "knockout" : "blackout";
  return { draw: "artwork", treatment: rescue, filter: TREATMENT_FILTER[rescue] };
};
