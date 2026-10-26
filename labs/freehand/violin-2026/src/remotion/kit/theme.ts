// A theme: how components are painted, and how things move.
//
// The theme is where a brand's accumulated assets finally land. Today the sake
// template hardcodes mincho and gold, so the palette and typography adopted
// into brand_knowledge_values have nowhere to go — a brand can be fully
// understood and its video still looks like somebody else's. A theme built
// from those values fixes exactly that.
//
// **Motion belongs to the theme, not to the scene.** If a scene owned its
// entrances, swapping the theme would mean rewriting every scene, and the
// combinations would stop being finite. With motion here, any scene plays
// under any theme — which is what "change the tone, the colour and the type
// and it works for anything" requires.

import type { Emphasis } from "./components";

export interface TypeStep {
  /** Cap height in composition pixels (1920×1080 stage). */
  size: number;
  lineHeight: number;
  /** Letter spacing in em. Japanese display type wants positive tracking. */
  tracking: number;
  /**
   * How many Japanese characters fit on one line at this size, across the
   * stage's text column. Full-width, so Latin fits roughly twice as many —
   * fit.ts measures in full-width units.
   */
  charsPerLine: number;
  /** Lines this step may occupy before the fitter steps down (fit.ts). */
  maxLines: number;
}

export interface ThemePalette {
  /** The canvas. */
  ground: string;
  /** Type on the ground. */
  ink: string;
  /** Type that recedes. */
  muted: string;
  /** Type that nearly disappears — labels, credits. */
  faint: string;
  /** The one colour that draws the eye. Rules, numerals, highlights. */
  accent: string;
  /** A brighter reading of the accent, for gradients and glints. */
  accentBright: string;
  /**
   * A CSS background laid over `ground` — the theme's own atmosphere.
   *
   * "素材ゼロでも完成した動画が出る" is a requirement of this template, and it
   * is the GROUND that has to satisfy it: with no photograph, a scene is its
   * type on whatever is behind it. 墨 does this with a drifting particle field
   * (EventBackground), which is why it can leave the upper frame empty and
   * still read as atmosphere. A flat light ground cannot — the same emptiness
   * reads as an unfinished slide.
   *
   * `null` means the ground is the flat colour, or a theme-specific layer is
   * doing the work instead.
   */
  groundWash: string | null;
}

/** How a component arrives and leaves. Named, not free-form, so a scene can
 *  ask for a feeling without specifying frames. */
export const MOTION_MOVES = [
  "fade",
  "rise",
  "settle",
  "wipe",
  "draw",
  "bloom",
] as const;
export type MotionMove = (typeof MOTION_MOVES)[number];

export interface ThemeMotion {
  /** Move used when a component enters, by emphasis. */
  enter: Record<Emphasis, MotionMove>;
  exit: MotionMove;
  /** Frames a component takes to arrive. */
  enterFrames: number;
  exitFrames: number;
  /** Something alive behind everything, all film long. */
  background: "still" | "particles" | "grain" | "drift";
  /** What happens between scenes. `card` is the interstitial title plate. */
  transition: "cut" | "fade" | "card" | "wipe";
}

export interface ThemeOrnament {
  /** Rules and marks drawn in the accent — structure in this art direction. */
  rules: boolean;
  /** Glyph used by the `mark` component. */
  markGlyph: string;
  /** Corner presence: a persistent avatar, a logo bug, nothing. */
  corner: "none" | "logo" | "avatar";
  /**
   * How the speakers are presented.
   *
   * `panels` fills the stage with full-height portraits split by a hairline
   * seam — the Freehand Lab's replacement for a medallion row it measured and
   * rejected ("small circles floating in empty space"). That verdict is about
   * a cinematic 和モダン film, where the speakers ARE the picture.
   *
   * `row` is the corporate convention and the owner's call for standard
   * (2026-08-30): a ring-bounded avatar with the name, the title and the
   * company set under it. A company announcing its own seminar is not making a
   * film about two faces; it is publishing a speaker list, and blowing two
   * portraits up to full frame reads as a different kind of event than the one
   * being announced.
   *
   * Here rather than in the scene for the same reason as `numerals`: the scene
   * knows WHO speaks, and how they are shown is painting.
   */
  people: "row" | "panels";
  /**
   * How an ordinal — "the second of three programmes" — is set.
   *
   * `kanji-seal` is 一二三 in a hairline box: the register a Japanese
   * invitation uses, measured in the Freehand Lab against bare kanji (bars)
   * and the formal 壱弐参 (overdressed). It is also a 和 device. In a gothic
   * face 「一」 is a thick blue bar and 「二」 is two of them, which is what the
   * first standard render showed. A corporate art direction sets `arabic` —
   * 01 02 03, large and light, no box — because that is how its own slides
   * number an agenda.
   *
   * Here rather than in the scene for the usual reason: the scene knows WHICH
   * of how many, and how a numeral looks is painting. The scene builder reads
   * this and emits the matching `stat` variant (scenes/event-cm.ts).
   */
  numerals: "kanji-seal" | "arabic";
}

/**
 * How subtitles are set.
 *
 * Part of the theme rather than the composition because subtitles are always
 * present — business video is watched muted — so the only question a template
 * ever asks is how they look, never whether to draw them.
 */
export interface ThemeCaption {
  size: number;
  /** Distance from the bottom of the frame, in composition pixels. */
  bottom: number;
  color: string;
  /**
   * What sits behind the text.
   *
   * - `plate`  a solid block fitted to the line. Reads as a separate layer,
   *            which is the point: a subtitle lands on photography and on the
   *            scene's own typography, and trying to blend produces the one
   *            outcome that cannot be accepted — a line nobody can read.
   * - `scrim`  a gradient darkening the lower frame. Gentler, and unreliable
   *            over a bright photo or a light scene.
   * - `shadow` glow only. For films that are always dark.
   * - `bar`    the bottom letterbox bar (chrome.letterbox). The subtitle sits
   *            centred inside it, on black that is already there — no plate,
   *            no collision with the picture, ever. Requires a letterbox.
   * - `none`   nothing.
   */
  backdrop: "none" | "scrim" | "shadow" | "plate" | "bar";
  /**
   * The plate's fill, used when `backdrop` is `plate`.
   *
   * Was hardcoded to `rgba(0,0,0,0.88)` in CaptionBand, which is the right
   * answer for exactly one theme: a dark one. A light art direction sets dark
   * type on a light plate, and a black block there reads as a mistake.
   */
  plate: string;
}

/**
 * The frame around the film.
 *
 * A letterbox is the single cheapest move that makes a sequence of stills read
 * as cinema — it declares an aspect ratio somebody chose (Freehand Lab,
 * 2026-08-18: it outranked every other change per line of code). It also gives
 * subtitles a home that can never collide with the picture (`backdrop: "bar"`).
 * `null` means no bars: the frame is the composition's own edge.
 */
export interface ThemeChrome {
  /** Bar height top and bottom, in composition pixels, or null for none. */
  letterbox: number | null;
  /**
   * What the bars are painted in.
   *
   * Was hardcoded to `#040302` in EventCmComposition, so any theme that asked
   * for a letterbox got 墨's bars whatever else it had chosen. Unused when
   * `letterbox` is null, but still declared: a theme that later wants bars
   * should not have to go and find where they are painted.
   */
  color: string;
}

/**
 * How a photograph laid under a scene is treated.
 *
 * Lifted straight out of 世界が恋する日本酒, where `SceneBackdrop` dimmed the
 * same photograph to 0.5 behind the promise and 0.22 behind the programme, put
 * a radial scrim over it, and pushed it slowly for the length of the scene.
 * Here rather than in the scene for the usual reason: motion and treatment
 * belong to the theme, or swapping the theme means rewriting every scene.
 */
export interface ThemeBackdrop {
  /** Photo opacity under the scrim, by what the picture is doing in the scene. */
  opacity: Record<"hero" | "support", number>;
  /** Drawn over the photograph so type stays legible on any photograph. Used
   *  when the layout centres its copy — a radial dim is all that works there. */
  scrim: string;
  /**
   * The directional alternative: darkness only where the copy is, so the
   * photograph stays a photograph on its own side of the frame.
   *
   * The measured lesson behind it (Freehand Lab): a full-frame dim at 0.22
   * turned every agenda scene into a near-black screen — "footage of nothing".
   * With darkness applied directionally, the same photograph carries type at
   * nearly full presence. The layout says WHICH side (LayoutSpec.copySide);
   * the theme says how dark and how far. `null` falls back to `scrim`.
   */
  directional: {
    strength: number;
    reach: number;
    /**
     * The colour the darkness is made of, as an RGB triple.
     *
     * A DARKENING scrim is only correct for a theme with light type. A light
     * theme sets dark type over the photograph, so its scrim has to LIGHTEN —
     * same gradient, opposite end of the range. Hardcoding `rgba(8,6,4,…)` in
     * Stage made this the one part of the art direction a theme could not
     * change.
     */
    tint: [number, number, number];
  } | null;
  /** Ken Burns: scale at the start of the scene and at the end. */
  push: [number, number];
}

/**
 * What the closing mark stands on.
 *
 * The film's last four seconds are a plate with one mark on it, and in the
 * approved 和モダン film that plate stands on FOOTAGE — Fuji above a sea of
 * clouds, darkened until the mark owns the frame (labs/freehand/sake-2026,
 * `sources.ts` logoOut). The carry-back brought the vocabulary over and left
 * this behind (Phase B5, 「video / collage / sequence の Ground はまだ」), so the
 * product's end card was a flat plate in both art directions and the owner
 * noticed the missing one first (2026-08-27).
 *
 * THE RECIPE IS THE APPROVED ONE, not a new invention: grade the footage, lay a
 * flat wash of the theme's own ground over it, then the theme's radial scrim.
 * Three layers, and the middle one is what makes the mark legible — the mark's
 * treatment is derived from `palette.ground` (remotion/kit/mark.ts), so the
 * ground has to still BE that colour once the footage is behind it. A clip is
 * therefore never drawn at full presence; the wash is not a matter of taste.
 *
 * Only the closing plate. The opening announces whose film this is before
 * anything has been said, and the approved film stands it on the client's own
 * wall — a brand's material, not a theme's, so nothing is declared here for it.
 */
export interface ThemeEndCard {
  /** Path under public/, or a `material:` uri. */
  video: string;
  /** CSS filter on the footage itself, before anything is laid over it. */
  grade?: string;
  /**
   * A flat wash of this theme's ground over the footage, as a CSS colour.
   *
   * Written out in full rather than as an alpha, the same way `caption.plate`
   * and `backdrop.scrim` are: the colour and how much of it are one decision,
   * and splitting them invites a theme to wash its light ground in ink.
   */
  wash: string;
}

/**
 * How the film's structure RINGS — which family of sound marks its moments.
 *
 * The cue sheet (lib/event-cm/sfx-cues.ts) decides WHICH moments ring and how
 * far forward each steps; that is the template's structure and does not change
 * with the painting. What changes is the instrument: 拍子木 and 和太鼓 open a
 * 和モダン film and would open a corporate webinar as a costume. So the theme
 * names the palette and the cue sheet picks its files from it.
 */
export interface ThemeSound {
  /** `wa`: acoustic Japanese instruments. `corporate`: neutral motion-graphics cues. */
  cues: "wa" | "corporate";
}

export interface Theme {
  id: string;
  /**
   * What a person choosing between art directions reads — the add dialog's
   * style picker and the badge on the video list. So this is the product's
   * name for the painting (「モダンジャパニーズ」), not the engineer's (墨).
   */
  name: string;
  palette: ThemePalette;
  /** Display family — headings, numerals, anything set large. */
  displayFont: string;
  /** Text family — everything else. */
  textFont: string;
  /**
   * BCP 47 language of the type, e.g. `ja`.
   *
   * Declared because `word-break: auto-phrase` — which stops Japanese lines
   * breaking mid-word — needs a language to segment. Without it the property is
   * silently inert, and that silence cost a session: the effect was reported as
   * "impossible in Remotion" and nearly replaced by a hand-written phrase
   * dictionary (labs/freehand/sake-2026/FINDINGS.md, v10).
   *
   * The THEME owns it rather than the brief, because every other typographic
   * decision here is the theme's — family, scale, tracking — and phrase
   * breaking is one of those. The cost of that choice is an English event
   * rendered in a Japanese art direction getting `lang="ja"`, which is
   * harmless: `auto-phrase` has no dictionary to apply and spaces still govern.
   * A non-Japanese art direction declares its own, the same way it declares its
   * own fonts.
   */
  lang: string;
  scale: Record<Emphasis, TypeStep>;
  motion: ThemeMotion;
  ornament: ThemeOrnament;
  sound: ThemeSound;
  /** The clip the closing mark stands on. Absent = the plate is the ground. */
  endCard?: ThemeEndCard;
  backdrop: ThemeBackdrop;
  caption: ThemeCaption;
  chrome: ThemeChrome;
}

/**
 * The sake template's art direction, lifted out of the composition it was
 * written into. This is the reference theme: if the vocabulary cannot
 * reproduce 世界が恋する日本酒 under `sumi`, the vocabulary is not finished.
 */
export const SUMI_THEME: Theme = {
  id: "sumi",
  lang: "ja",
  name: "モダンジャパニーズ",
  palette: {
    ground: "#0b0d13",
    ink: "#f4efe4",
    muted: "rgba(244,239,228,0.62)",
    faint: "rgba(244,239,228,0.34)",
    accent: "#c9a45c",
    accentBright: "#e6c98b",
    // 墨's atmosphere is EventBackground, not a wash.
    groundWash: null,
  },
  displayFont:
    '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Times New Roman", serif',
  textFont:
    '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Times New Roman", serif',
  scale: {
    hero: { size: 132, lineHeight: 1.24, tracking: 0.06, charsPerLine: 11, maxLines: 2 },
    primary: { size: 64, lineHeight: 1.5, tracking: 0.08, charsPerLine: 22, maxLines: 3 },
    secondary: { size: 38, lineHeight: 1.7, tracking: 0.06, charsPerLine: 36, maxLines: 4 },
    caption: { size: 24, lineHeight: 1.6, tracking: 0.22, charsPerLine: 52, maxLines: 2 },
  },
  motion: {
    enter: { hero: "rise", primary: "settle", secondary: "fade", caption: "fade" },
    exit: "fade",
    enterFrames: 18,
    exitFrames: 12,
    background: "drift",
    transition: "fade",
  },
  ornament: {
    rules: true,
    markGlyph: "—",
    corner: "none",
    numerals: "kanji-seal",
    // The approved film's. Unchanged by the 2026-08-30 corporate decision.
    people: "panels",
  },
  sound: { cues: "wa" },
  // Fuji above a sea of clouds. Every number here is the approved film's
  // (labs/freehand/sake-2026/src/freehand/scenes.tsx): grade, then 0.58 of ink,
  // then the radial scrim below.
  endCard: {
    video: "defaults/video/end-card-sumi.mp4",
    grade: "saturate(0.85) brightness(0.85)",
    wash: "rgba(8,6,4,0.58)",
  },
  // Photography at nearly full presence, darkened only on the copy's side.
  // The old values (hero 0.5, support 0.22 under a full radial scrim) are the
  // measured reason the agenda scenes read as black screens — the client's
  // "クリエイティビティがゼロ" verdict traced to exactly this pair of numbers.
  backdrop: {
    opacity: { hero: 1, support: 0.88 },
    scrim:
      "radial-gradient(85% 75% at 50% 50%, rgba(11,13,19,0.42) 0%, rgba(11,13,19,0.8) 100%)",
    directional: { strength: 0.74, reach: 76, tint: [8, 6, 4] },
    push: [1.04, 1.13],
  },
  // Inside the letterbox bar: black that is already there, so the line never
  // fights the picture and never needs a plate.
  caption: {
    size: 34,
    bottom: 0,
    color: "#f4efe4",
    backdrop: "bar",
    plate: "rgba(0,0,0,0.88)",
  },
  chrome: { letterbox: 132, color: "#040302" },
};

/**
 * The corporate art direction: a clean, neutral film for a webinar, a workshop
 * or a seminar that a company hands to its own audience.
 *
 * THIS IS THE ONE MEANT TO BE ORDINARY. `sumi` came first only because the
 * first real commission happened to be a 和モダン event, and a template named
 * after that art direction can hardly be the default — 墨黒×金×明朝 is a
 * specific enough decision that most events will never want it. So the film's
 * structure (scenes, narration, BGM, captions) stays exactly what `sumi`
 * proved, and only the painting changes. Same brief, same storyboard, same
 * words, same length.
 *
 * The differences are deliberate, not softened versions of 墨:
 *
 * - **A light ground.** Corporate video is watched next to the company's own
 *   site and deck, which are white. A dark film reads as a different brand.
 * - **Gothic, not mincho.** The same judgment as `themeForBrand` in reverse:
 *   the face IS the art direction, and a business webinar is set in the face
 *   its slides are set in.
 * - **No letterbox.** Bars are the cheapest way to make stills read as cinema,
 *   which is precisely the wrong claim here — a workshop announcement should
 *   not present itself as a film. Captions therefore need their own plate
 *   (`bar` is not available without a letterbox).
 * - **A lightening scrim.** Dark type over a photograph needs the photograph
 *   to give way upward, not downward. Same gradient as 墨, opposite end.
 * - **Still background, quieter motion.** Drifting particles are an atmosphere;
 *   this art direction does not have one, on purpose.
 */
export const STANDARD_THEME: Theme = {
  id: "standard",
  lang: "ja",
  name: "スタンダード",
  palette: {
    // Not #ffffff: a pure white ground makes the photographs look pasted on,
    // and leaves nothing for a card or a plate to be lighter than.
    ground: "#f7f9fc",
    // Near-black with the blue in it, so type and accent belong to one family.
    ink: "#0f172a",
    muted: "rgba(15,23,42,0.64)",
    faint: "rgba(15,23,42,0.36)",
    // A trust blue rather than a bright one: this colour ends up on dates,
    // rules and numerals, where saturation reads as a sales banner.
    accent: "#1d5bd6",
    accentBright: "#3f7ff0",
    // Quiet enough to sit under dark type anywhere in the frame, present
    // enough that an empty upper frame reads as light rather than as nothing.
    // Corporate atmosphere is a gradient, not particles.
    groundWash:
      "linear-gradient(158deg, #ffffff 0%, #f7f9fc 44%, #e7edf7 100%)",
  },
  displayFont:
    '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", YuGothic, "Noto Sans JP", system-ui, sans-serif',
  textFont:
    '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", YuGothic, "Noto Sans JP", system-ui, sans-serif',
  // Gothic carries more ink per character than mincho, so the same sizes read
  // heavier and the same tracking reads loose. Both come down a step.
  scale: {
    hero: { size: 118, lineHeight: 1.3, tracking: 0.02, charsPerLine: 12, maxLines: 2 },
    primary: { size: 58, lineHeight: 1.55, tracking: 0.03, charsPerLine: 24, maxLines: 3 },
    secondary: { size: 36, lineHeight: 1.75, tracking: 0.02, charsPerLine: 38, maxLines: 4 },
    caption: { size: 24, lineHeight: 1.6, tracking: 0.1, charsPerLine: 54, maxLines: 2 },
  },
  motion: {
    enter: { hero: "settle", primary: "fade", secondary: "fade", caption: "fade" },
    exit: "fade",
    enterFrames: 16,
    exitFrames: 10,
    background: "still",
    transition: "fade",
  },
  // Arabic ordinals: the seal is a 和 device, and in this face 「一」 is a bar.
  ornament: {
    rules: true,
    markGlyph: "—",
    corner: "none",
    numerals: "arabic",
    people: "row",
  },
  sound: { cues: "corporate" },
  // A city at dusk — the clip the owner handed over as this art direction's
  // stand-in for Fuji (2026-08-27). Same three layers as 墨 and the opposite
  // direction: the wash LIGHTENS, because the mark on this ground is dark.
  // 0.62 rather than 墨's 0.58 for the same reason the directional scrim is
  // stronger here — a light veil hides less at the same alpha.
  endCard: {
    video: "defaults/video/end-card-light.mp4",
    grade: "saturate(0.9) brightness(1.04)",
    wash: "rgba(247,249,252,0.62)",
  },
  backdrop: {
    opacity: { hero: 1, support: 0.92 },
    scrim:
      "radial-gradient(85% 75% at 50% 50%, rgba(247,249,252,0.5) 0%, rgba(247,249,252,0.86) 100%)",
    // Stronger than 墨's 0.74: a light veil hides less at the same alpha, and
    // the type over it is dark, so it needs more of the photograph gone.
    directional: { strength: 0.84, reach: 78, tint: [247, 249, 252] },
    // A shorter push. The slow drift is part of 墨's atmosphere; here it only
    // has to stop the picture from looking frozen.
    push: [1.02, 1.08],
  },
  // No letterbox, so the caption carries its own plate and sits inside the
  // frame rather than in chrome.
  caption: {
    size: 32,
    bottom: 64,
    color: "#0f172a",
    backdrop: "plate",
    plate: "rgba(255,255,255,0.92)",
  },
  chrome: { letterbox: null, color: "#0f172a" },
};

/**
 * The art directions a film can be painted in, by the id stored on the render.
 *
 * `take_renders.theme` has carried this value since migration 0027 (every
 * event render says `sumi`), so switching art direction is choosing a different
 * row here — not a different template, and not an edit to the brief.
 */
export const THEMES: Record<string, Theme> = {
  [SUMI_THEME.id]: SUMI_THEME,
  [STANDARD_THEME.id]: STANDARD_THEME,
};

/**
 * What a NEW film is painted in.
 *
 * `standard` rather than `sumi`, because 墨 is the derivative: it came first
 * only because the first commission was a 和モダン event.
 */
export const NEW_FILM_THEME_ID = STANDARD_THEME.id;

/**
 * What a film with NO art direction recorded is painted in.
 *
 * `sumi`, and it must stay `sumi`. Every take that exists today predates this
 * field, and one of them is a delivered commission the client has approved —
 * resolving "unset" to the new default would silently repaint an approved film.
 * Unset means "made before there was a choice", and there was only 墨 then.
 */
export const LEGACY_THEME_ID = SUMI_THEME.id;

/**
 * Resolve a stored theme id.
 *
 * An unknown id falls back rather than throwing: the id comes from a database
 * row that may have been written by a newer version of this code, and a film
 * that renders in the wrong art direction is recoverable while one that
 * refuses to render is not.
 */
export const themeById = (id: string | null | undefined): Theme =>
  (id ? THEMES[id] : undefined) ?? THEMES[LEGACY_THEME_ID];

/**
 * How much of the bottom of the frame belongs to the subtitle.
 *
 * Subtitles are mandatory in this template — the film is watched muted — so the
 * band is not something a scene may compose over. Before this, `full-bleed-overlay`
 * set its copy at the stage margin (96px) while the plate sat from 72px to about
 * 150px, and the promise scene's own words ran through the subtitle. Both are
 * legible alone and neither is legible together.
 *
 * Two lines' worth, because a subtitle that wraps must not start the collision
 * again. Bottom-anchored regions keep clear of it; centred ones are the fitter's
 * business (fit.ts), since a centred block only reaches down here when it is
 * already too tall.
 */
export const captionSafeBottom = (theme: Theme): number => {
  // Inside the letterbox bar the subtitle occupies chrome the picture never
  // had, so scenes only keep clear of the bar itself.
  if (theme.caption.backdrop === "bar") {
    return (theme.chrome.letterbox ?? 0) + 40;
  }
  // The plate's own geometry, as CaptionBand draws it: 1.5 line-height and
  // 0.42em of padding above and below. Guessing a multiple of the font size
  // instead left a nine-pixel overlap — close enough to look like a mistake
  // rather than a margin.
  const line = theme.caption.size * 1.5;
  const padding = theme.caption.size * 0.84;
  const plate = line * 2 + padding;
  return Math.round(theme.caption.bottom + plate + 24);
};

export interface BrandThemeInput {
  palette?: { primary?: string; accent?: string; background?: string; text?: string };
  headingFont?: string | null;
  bodyFont?: string | null;
}

/**
 * Dress a theme in a brand's own values.
 *
 * Only what the brand actually has is applied. A brand with no accent — which
 * is a real answer, not a gap (lib/brand/site-palette.ts) — keeps the base
 * theme's accent, and the caller records that as the tool's proposal rather
 * than as the brand's colour.
 *
 * COLOUR ONLY — the brand's typography is deliberately not adopted (2026-08-18,
 * from the Freehand Lab's first finding). The sake film rendered in the brand's
 * gothic, and the gothic was the first thing that broke the art direction: the
 * gold and the ink lost their meaning under a face that belongs to a business
 * site. This is the same judgment the LP templates already made — "1顧客ごとに
 * 変わるべきなのは色であって組版ではない" (README, LPテンプレート) — arriving
 * at video. The theme's mincho IS the template; the accent is the brand's.
 */
export function themeForBrand(base: Theme, brand: BrandThemeInput): Theme {
  return {
    ...base,
    id: `${base.id}+brand`,
    palette: {
      ...base.palette,
      ...(brand.palette?.accent ? { accent: brand.palette.accent } : {}),
    },
  };
}
