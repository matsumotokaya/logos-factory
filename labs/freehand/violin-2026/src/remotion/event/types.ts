// Event promo video contract — the first non-product template axis
// (events / seminars). An EventBrief is the structured data a video is
// rendered from; today it is authored by hand from raw client material
// (Slack paste + flyer + a drop folder of assets), and the extraction/
// structuring pipeline will produce it later.
//
// Every asset field is a slot: a staticFile() name (or URL) when the file
// exists, null to fall back to a *designed* treatment — never an empty dummy
// box. Facts (dates, names, venue) are never invented by the renderer: a null
// fact is elegantly omitted.

/** A photo plus how to frame it. Client photos are rarely composed for the
 *  slot they land in, so framing is data, not a hand-crop. */
export interface EventPhoto {
  /** staticFile name or URL. */
  src: string;
  /** Point of interest as 0..1 fractions of the source (a face, the glass).
   *  Defaults to the centre. In a medallion this point is placed exactly at
   *  the centre; in a full-bleed scene it drives object-position. */
  focus?: { x: number; y: number };
  /** Extra magnification beyond "cover". Needed for portrait medallions cut
   *  from landscape frames, where cover alone leaves the face small and high. */
  zoom?: number;
  /**
   * A stock picture standing in for one nobody has supplied — drawn with a
   * 「見本」 tag.
   *
   * ON THE PHOTOGRAPH, not on the person. The caveat started life inside the
   * guest's name (「ゲストスピーカー（見本）」) and the narration read it out:
   * the film literally said 「ゲストスピーカー見本と、モデレーター見本が」,
   * because a name is a spoken fact and the label was never meant for the ear.
   * A photograph is not spoken (`isSpokenFact`), so a flag here reaches the eye
   * and nothing else.
   */
  sample?: boolean;
}

/**
 * How a logo file must be treated to sit on the ink canvas.
 * - `light`: already light-on-transparent — used as-is (the ideal delivery).
 * - `invert`: a single dark colour on transparent (e.g. a black-only SVG),
 *   inverted at render time so it reads as light.
 * Opaque logos on a white plate are knocked out ahead of time by
 * labs/event/scripts/prepare-assets.mjs and arrive here as `light`.
 */
export type LogoTreatment =
  /** Already light: draw as supplied. */
  | "light"
  /** Dark artwork on transparency: invert it. Keeps a two-tone mark two-tone. */
  | "invert"
  /**
   * Draw as a white silhouette whatever colour it is (`brightness(0) invert(1)`).
   *
   * The default on a dark stage, and the only treatment that cannot fail: a
   * brand SVG may be black, coloured, or two-tone, and `invert` turns a light
   * mark dark just as readily as it fixes a dark one. Losing the brand colour is
   * the accepted cost — a knocked-out mark is the standard way to credit a
   * presenter on black, and an unreadable one credits nobody.
   */
  | "knockout"
  /**
   * The mirror of `knockout`: every pixel forced to black (`brightness(0)`).
   *
   * What "cannot fail" means on a LIGHT ground. Without it a light art
   * direction has no safe answer for an unmeasured transparent mark — `light`
   * loses a pale one and `invert` ruins a dark one — so the default fell back
   * to knockout and painted a white mark on white.
   */
  | "blackout";

export interface EventLogo {
  name: string;
  /** staticFile name or URL; null = typographic fallback. */
  src: string | null;
  /**
   * A painting decision already committed to, which overrides the measurement.
   *
   * Prefer leaving this absent and recording the measurement below: a stored
   * treatment is a mark painted for exactly one ground, so a brief full of them
   * cannot change art direction. Kept because existing briefs carry one — one
   * of them a delivered commission — and those must not be repainted.
   */
  treatment?: LogoTreatment;
  /**
   * Measured: the artwork has no alpha channel to cut.
   *
   * Absent means NOT MEASURED, which is not the same as `false`. The theme
   * decides how to paint from this (paint.ts `treatmentOn`), so the same mark
   * comes out legible on ink and on white without the brief being rewritten.
   */
  opaque?: boolean | null;
  /** Measured: 0–1 brightness of the artwork. Absent means not measured. */
  luminance?: number | null;
  /** Per-logo optical size correction — logotypes and square seals never
   *  balance at one shared height. Multiplies the row's base height. */
  scale?: number;
}

export interface EventGuest {
  name: string;
  role: string;
  /** null = monogram medallion fallback. */
  photo: EventPhoto | null;
}

export interface EventProgram {
  /** Displayed next to a large serif numeral (01/02/03). */
  title: string;
  /**
   * One or two sentences on what this programme actually covers.
   *
   * **The narration speaks this, so it has to live in the brief.** With only a
   * title to work from, an agenda scene could say no more than 「主催者が解説
   * します」 — three thin lines where the sample most needs substance. The
   * obvious shortcut is to let the narration prompt elaborate on the title, and
   * that breaks the rule the whole 捏造の方針 rests on: a fact invented while
   * WRITING the narration is not in the item list, so nobody can correct it
   * (docs README, 「ナレーション執筆 / しない」). Proposed at seed time it is
   * an editable field like every other guess.
   */
  detail?: string;
}

export interface EventSchedule {
  /** e.g. "2026.10.2" — display string, already formatted. */
  date: string;
  /** e.g. "FRI" */
  weekday: string;
  /** e.g. "17:00 START" */
  time: string;
  /** null = omitted (not "TBD" on screen). */
  venue: string | null;
  fee: string | null;
}

/**
 * Scene-level visual slots. These are placements, not one hero image: the
 * same idea as the presentation asset catalog's placements, so a future
 * editor can swap what fills each one without touching the composition.
 */
export interface EventVisuals {
  /** Ink calligraphy laid behind the title as a drifting watermark
   *  (light-on-transparent PNG). */
  inkArt: string | null;
  /** Full-bleed photo behind the value scene. */
  value: EventPhoto | null;
  /** Full-bleed photo behind the programs list, heavily dimmed. */
  programs: EventPhoto | null;
  /** Full-bleed photo behind the closing card. */
  closing: EventPhoto | null;
  /** Barely-visible texture over the opening, for grain rather than imagery. */
  texture: string | null;
}

export interface EventBrief {
  /** Scene 1 — who presents this. e.g. "レオパレス21 × WealthPark Lab" */
  presenter: string;
  /** e.g. "「文化資本と投資」シリーズ 第3弾" */
  seriesLabel: string;
  title: string;
  subtitle: string;
  /** Vertical side copy on the title scene (和組み). */
  sideCopy: string | null;
  /** Scene 3 — the single strongest value, one line per array entry. */
  valueLines: string[];
  /** Small gold chip under the value lines. */
  valueChip: string | null;
  programsHeading: string;
  programs: EventProgram[];
  guestsHeading: string;
  guests: EventGuest[];
  schedule: EventSchedule;
  cta: string;
  /** Small print on the closing scene, e.g. age restriction. */
  footnote: string | null;
  logos: EventLogo[];
  visuals: EventVisuals;
  /** staticFile name or URL of the BGM track; null = silent. */
  bgm: string | null;
}
