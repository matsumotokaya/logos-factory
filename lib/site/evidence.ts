// What rendering a site measured: colour evidence by role and the design
// tokens read off computed CSS. Produced by capture.ts, read by the palette
// roles (lib/brand/site-palette.ts) and the brand knowledge it becomes.

export interface WeightedColor {
  hex: string;
  weight: number;
}

export interface InteractiveColor {
  hex: string;
  role: "background" | "text";
  count: number;
}

export interface CaptureEvidence {
  /** background-color / svg fill, weighted by on-screen area (px^2) */
  backgrounds: WeightedColor[];
  /** text color, weighted by amount of text (chars * fontSize^2) */
  texts: WeightedColor[];
  /** border colors, weighted by border length * width */
  borders: WeightedColor[];
  /** CSS-gradient background stops, weighted by painted area (px^2) —
   *  hero key visuals are usually here, not in backgrounds */
  gradients?: WeightedColor[];
  /** rendered-viewport pixel share 0..1 (photography, imagery, everything) */
  pixels?: WeightedColor[];
  /** dominant colors of the og:image key visual, share 0..1 */
  keyVisual?: WeightedColor[];
  /** colors used on interactive elements (a / button / inputs) */
  interactive: InteractiveColor[];
  /** :root CSS custom properties that resolve to a color */
  cssVars: { name: string; hex: string }[];
  /** dominant colors of the header logo / favicon, share 0..1 */
  logoColors: { hex: string; share: number }[];
}

/** Best-effort design guideline hints read from computed CSS. */
export interface DesignTokens {
  body_font: string | null;
  heading_font: string | null;
  button_radius: string | null;
  button_padding: string | null;
  /** typical vertical padding of top-level sections (余白のルールの近似) */
  section_spacing: string | null;
  container_width: string | null;
}
