// Freehand art direction #3: ラグジュアリー — 夜のホールの黒 × シャンパンゴールド.
//
// The kit theme is deliberately ignored, as in sake-2026: the lab's question
// is what the film looks like when a person art-directs it. What must NOT be
// inherited from sake is the look itself — 墨黒×真鍮×和のSFX was that film.
// Here the ground carries bordeaux, the gold is champagne rather than brass,
// and the type pairs a classical mincho with a Garamond so the Japanese and
// the Latin sit on the same skeleton.
//
// Both faces were checked against node_modules/@remotion/google-fonts/dist:
// ZenOldMincho.mjs (400/500/600/700/900, normal, japanese+latin) and
// CormorantGaramond.mjs (300–700, normal + italic, latin). No fallback needed.

import { loadFont as loadZenOldMincho } from "@remotion/google-fonts/ZenOldMincho";
import { loadFont as loadCormorantGaramond } from "@remotion/google-fonts/CormorantGaramond";

const zen = loadZenOldMincho("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["japanese", "latin"],
});

const cormorant = loadCormorantGaramond("normal", {
  weights: ["300", "400", "500"],
  subsets: ["latin"],
});

// Loaded for its own sake: the weekday and the series kicker are set in it.
// The family name is the same string, so only the style has to be asked for.
loadCormorantGaramond("italic", { weights: ["300", "400"], subsets: ["latin"] });

export const FH = {
  /** Japanese, display and text alike. */
  jp: zen.fontFamily,
  /** Latin: dates, times, roman numerals, role names. Never new copy. */
  en: cormorant.fontFamily,

  /** The ground everything sits on: black with bordeaux in it. */
  ground: "#0b080a",
  /** The letterbox bars — a step below the ground, so the frame reads. */
  groundDeep: "#050305",
  /** The curtain, for every scene whose material has not arrived. */
  velvetFrom: "#3a1219",
  velvetTo: "#0b080a",

  /** Champagne. Rules, numerals, kickers, rings — 数と線だけ. */
  gold: "#d6bc7a",
  /** Bokeh and glints only. */
  goldBright: "#f0dfae",
  /** Where a rule dies out. */
  goldDim: "rgba(214,188,122,0.5)",

  /** Body and headings. Pure white glares against a dark hall. */
  ivory: "#f3ecdd",
  /** Roles, credits, secondary lines. */
  ivoryMuted: "rgba(243,236,221,0.7)",
  /** Footnotes: present, and plainly not the point. */
  ivoryFaint: "rgba(243,236,221,0.44)",

  /** Only ever inside a gradient — never on type. */
  varnish: "#7a2e1c",
} as const;

/** The velvet curtain as a paintable value (top-lit, falling into the ground). */
export const VELVET_GRADIENT = `radial-gradient(ellipse 120% 92% at 50% 6%, ${FH.velvetFrom} 0%, #200a10 38%, ${FH.velvetTo} 78%)`;

/** Cinemascope letterbox: bar height in composition pixels (1920×1080). */
export const LETTERBOX = 120;

/** The programme trio. Roman, because the evening is a programme, not a 章.
 *  `I` is a bare stroke at display size — chrome.tsx's ring gives it mass. */
export const ROMAN_NUMERALS = ["I", "II", "III"] as const;

/** The one shadow used on type over photography, said once. */
export const TYPE_SHADOW = "0 2px 26px rgba(5,3,2,0.8)";
