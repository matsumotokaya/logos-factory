// Shared constants for the event promo template (和モダン・ラグジュアリー):
// ink black canvas, gold accents, unbleached-white serif type. Unlike the CM
// template the palette is fixed by the template's art direction, not derived
// from a brand kit — the template ships complete, assets enrich it.

export const EVENT_FPS = 30;
export const EVENT_WIDTH = 1920;
export const EVENT_HEIGHT = 1080;

export const EVENT_GOLD = "#c9a45c";
export const EVENT_GOLD_BRIGHT = "#e6c98b";
export const EVENT_TEXT = "#f4efe4";
export const EVENT_MUTED = "rgba(244,239,228,0.62)";
export const EVENT_FAINT = "rgba(244,239,228,0.34)";

/** Mincho-first stack; macOS system fonts carry the local render, Noto Serif
 *  JP covers other hosts if installed. */
export const EVENT_SERIF =
  '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Times New Roman", serif';

// ---- fixed 30s scene timeline (frames @30fps) ----
// One entry per scene; `from` inclusive. The tail keeps the last frame from
// clipping in players.
export const EVENT_SCENES = {
  series: { from: 0, length: 105 }, // 0.0–3.5s  presenter / series
  title: { from: 105, length: 180 }, // 3.5–9.5s  title reveal
  value: { from: 285, length: 150 }, // 9.5–14.5s value proposition
  programs: { from: 435, length: 165 }, // 14.5–20.0s 3 programs
  guests: { from: 600, length: 165 }, // 20.0–25.5s guests
  closing: { from: 765, length: 150 }, // 25.5–30.5s date / cta / logos
} as const;

export const EVENT_TAIL_FRAMES = 15;

export const EVENT_DURATION_FRAMES =
  EVENT_SCENES.closing.from + EVENT_SCENES.closing.length + EVENT_TAIL_FRAMES;
