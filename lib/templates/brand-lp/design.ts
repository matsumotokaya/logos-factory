import { hexToRgb, isGrayscale, luminance } from "@/lib/color";
import { fontFamilies, isHex } from "@/lib/brand/profile";
import type { BrandKitBrief } from "@/lib/brand/kit/snapshot";

// The kit, turned into the decisions a page needs.
//
// A kit states what the brand's site measured to: five colours, two font
// stacks, a few radii. A page needs more than that and needs it safe — a
// button that can be seen, text that can be read, a body line-height a
// paragraph survives. This is the one place those decisions are made, by
// rule, so the same kit always gives the same page.
//
// Every fallback here is a gap in the kit: the value was missing, or was
// measured to something a page cannot use as it stands (a primary colour the
// same as the background, a line-height of 1.00). `notes` says which, and the
// LP's page lists them.
//
// Pure, and free of server-only imports.

export type LpDesign = {
  dark: boolean;
  color: {
    bg: string;
    surface: string;
    text: string;
    line: string;
    /** The button. */
    action: string;
    onAction: string;
    /** Small coloured type: eyebrows, numerals, links. Readable on `bg`. */
    inkAccent: string;
    /** Decorative colour for glows; may be too light to read. */
    glow: string | null;
    /** The closing band. */
    band: string;
    onBand: string;
  };
  hero: {
    kind: "gradient" | "tint" | "plain";
    stops: string[];
    /** Text colour on the hero's ground. */
    ink: string;
  };
  font: {
    heading: string;
    body: string;
    /** Google Fonts stylesheet for the families it can serve, or null. */
    href: string | null;
    headingWeight: number;
    bodyWeight: number;
    bodySize: number;
    lineHeight: number;
    /** Heading letter-spacing, in em. */
    tracking: number;
  };
  shape: {
    buttonRadius: string;
    buttonShadow: string;
    buttonWeight: number;
    cardRadius: string;
    cardShadow: string;
    borderWidth: string;
    container: number;
    /** Radius of the large inset panels (hero ground, closing band). */
    panelRadius: string;
    /** A circle, unless the brand's shapes are square. */
    avatarRadius: string;
  };
  /** What the kit did not give, or gave in a form the page had to correct. */
  notes: { path: string; note: string }[];
};

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_INK = "#ffffff";
const DARK_INK = "#111418";

/** White or near-black, whichever reads better on `ground`. */
function inkOn(ground: string): string {
  return contrast(LIGHT_INK, ground) >= contrast(DARK_INK, ground) ? LIGHT_INK : DARK_INK;
}

/**
 * The label on a filled shape (a button, the closing band). White wherever it
 * clears the large-text threshold: a mid-tone brand colour takes white type
 * the way the brand's own buttons do, even where near-black measures higher.
 */
function labelOn(ground: string): string {
  return contrast(LIGHT_INK, ground) >= 3 ? LIGHT_INK : DARK_INK;
}

function mix(a: string, b: string, weight: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const channel = (p: number, q: number) => Math.round(p * weight + q * (1 - weight));
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(channel(x.r, y.r))}${hex(channel(x.g, y.g))}${hex(channel(x.b, y.b))}`;
}

const px = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : null;
};

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** A CSS length the kit measured, or null when it is not one a page can paste. */
function length(value: unknown, maxPx: number): string | null {
  const parsed = px(value);
  if (parsed === null || parsed < 0) return null;
  return `${Math.min(parsed, maxPx)}px`;
}

/** A box-shadow the kit measured. Only the literal shapes a capture produces. */
function shadow(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "none") return "none";
  return /^[\w\s.,()%#-]+$/.test(trimmed) && trimmed.length <= 200 ? trimmed : null;
}

// Families Google Fonts serves under the same name. Typography is half of
// "looks like the same brand", so this is the one external request the page
// makes; a family not listed here falls through to the visitor's system.
const GOOGLE_FONTS = new Set([
  "Noto Sans JP", "Noto Serif JP", "Noto Sans", "Noto Serif", "M PLUS 1p", "M PLUS 2",
  "M PLUS Rounded 1c", "Zen Kaku Gothic New", "Zen Maru Gothic", "Zen Old Mincho",
  "BIZ UDPGothic", "BIZ UDGothic", "BIZ UDPMincho", "Shippori Mincho", "Sawarabi Gothic",
  "Sawarabi Mincho", "Kosugi Maru", "IBM Plex Sans JP", "Murecho", "Kiwi Maru", "LINE Seed JP",
  "Inter", "Ubuntu", "Roboto", "Poppins", "Montserrat", "Lato", "Open Sans", "DM Sans",
  "Outfit", "Manrope", "Raleway", "Nunito", "Work Sans", "Figtree", "Sora",
  "Plus Jakarta Sans", "Libre Baskerville", "Playfair Display", "Lora", "Merriweather",
  "EB Garamond", "Cormorant Garamond", "Source Sans 3", "Source Serif 4", "Space Grotesk",
  "Oswald", "Rubik", "Urbanist", "Lexend",
]);

const SERIF = /serif|mincho|明朝|baskerville|garamond|times|georgia|playfair|lora|merriweather|cormorant/i;
const JAPANESE = /JP|Gothic|Mincho|Hiragino|Yu |游|Meiryo|メイリオ|Zen |BIZ |M PLUS|Kosugi|Sawarabi|Murecho|Kiwi|LINE Seed/i;

const SANS_FALLBACK = ['"Hiragino Sans"', '"Noto Sans JP"', "system-ui", "sans-serif"];
const SERIF_FALLBACK = ['"Hiragino Mincho ProN"', '"Noto Serif JP"', "Georgia", "serif"];

const quote = (family: string) => (/[^a-zA-Z0-9-]/.test(family) ? `"${family}"` : family);

function stack(families: string[], serif: boolean): string {
  const named = families.map(quote);
  const fallback = (serif ? SERIF_FALLBACK : SANS_FALLBACK).filter((item) => !named.includes(item));
  return [...named, ...fallback].join(", ");
}

function googleHref(families: string[], weights: number[]): string | null {
  const served = [...new Set(families)].filter((family) => GOOGLE_FONTS.has(family));
  if (served.length === 0) return null;
  const axis = [...new Set(weights)].sort((a, b) => a - b).join(";");
  const query = served
    .map((family) => `family=${family.replace(/ /g, "+")}:wght@${axis}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export function lpDesign(kit: BrandKitBrief): LpDesign {
  const v = kit.values;
  const notes: LpDesign["notes"] = [];
  const hex = (path: string): string | null => {
    const value = v[path];
    return isHex(value) ? value.toLowerCase() : null;
  };

  // ---- ground and text
  const bg = hex("palette.background") ?? "#ffffff";
  if (!hex("palette.background")) notes.push({ path: "palette.background", note: "背景色が無いため白にしました" });
  const dark = luminance(bg) < 0.2;
  const statedText = hex("palette.text");
  const text = statedText && contrast(statedText, bg) >= 4.5 ? statedText : inkOn(bg);
  if (!statedText) notes.push({ path: "palette.text", note: "文字色が無いため、背景に対して読める色にしました" });
  else if (text !== statedText) {
    notes.push({ path: "palette.text", note: `文字色 ${statedText} は背景に対してコントラストが足りないため、読める色に替えました` });
  }
  const statedSurface = hex("palette.surface");
  const surface =
    statedSurface && statedSurface !== bg ? statedSurface : mix(text, bg, dark ? 0.08 : 0.035);
  const line = hex("palette.border") ?? mix(text, bg, 0.14);

  // ---- the button
  const primary = hex("palette.primary");
  const accent = hex("palette.accent");
  const visible = (colour: string | null): colour is string => colour !== null && contrast(colour, bg) >= 3;
  let action: string;
  if (visible(primary)) {
    action = primary;
  } else if (visible(accent)) {
    action = accent;
    notes.push({
      path: "palette.primary",
      note: primary
        ? `プライマリ ${primary} は背景との差が小さくボタンに使えないため、アクセント ${accent} をボタンにしました`
        : `プライマリが無いため、アクセント ${accent} をボタンにしました`,
    });
  } else {
    action = text;
    notes.push({
      path: "palette.primary",
      note: primary
        ? `プライマリ ${primary} は背景との差が小さくボタンに使えないため、文字色をボタンにしました`
        : "プライマリが無いため、文字色をボタンにしました",
    });
  }
  const onAction = labelOn(action);
  const inkAccent =
    accent && contrast(accent, bg) >= 3 && !isGrayscale(accent)
      ? accent
      : !isGrayscale(action)
        ? action
        : text;
  const chromatic = [accent, primary].filter((c): c is string => c !== null && !isGrayscale(c));

  // ---- hero ground
  const gradient = Array.isArray(v["palette.gradient"])
    ? (v["palette.gradient"] as unknown[]).filter(isHex).map((c) => c.toLowerCase())
    : [];
  const heroKindStated = typeof v["layout.hero_kind"] === "string" ? (v["layout.hero_kind"] as string) : null;
  let hero: LpDesign["hero"];
  if (heroKindStated === "gradient" && gradient.length >= 2) {
    const middle = gradient[Math.floor(gradient.length / 2)];
    hero = { kind: "gradient", stops: gradient, ink: contrast(text, middle) >= 4.5 ? text : inkOn(middle) };
  } else if (heroKindStated === "plain" || chromatic.length === 0) {
    hero = { kind: "plain", stops: [], ink: text };
  } else {
    hero = { kind: "tint", stops: chromatic.slice(0, 2), ink: text };
  }
  if (heroKindStated === "image") {
    notes.push({
      path: "layout.hero_kind",
      note: "サイトのヒーローは写真ですが、キットにヒーロー用の写真が無いため、色の地にしました",
    });
  }
  const glow = gradient[0] ?? chromatic[0] ?? null;

  // ---- closing band: the button colour when white type reads on it, else the darkest ink
  const band = contrast(LIGHT_INK, action) >= 3 ? action : luminance(text) < 0.2 ? text : DARK_INK;
  const onBand = labelOn(band);

  // ---- type
  const headingFamilies = fontFamilies(typeof v["typography.heading_font"] === "string" ? (v["typography.heading_font"] as string) : null);
  const bodyFamilies = fontFamilies(typeof v["typography.body_font"] === "string" ? (v["typography.body_font"] as string) : null);
  if (headingFamilies.length === 0) notes.push({ path: "typography.heading_font", note: "見出し書体が無いため、システムのゴシックにしました" });
  if (bodyFamilies.length === 0) notes.push({ path: "typography.body_font", note: "本文書体が無いため、システムのゴシックにしました" });
  const headingSerif = headingFamilies.some((family) => SERIF.test(family));
  const bodySerif = bodyFamilies.length > 0 ? bodyFamilies.some((family) => SERIF.test(family)) : headingSerif;
  const headingWeight = clamp(num(v["typography.heading_weight"]) ?? 700, 300, 900);
  const bodyWeight = clamp(num(v["typography.body_weight"]) ?? 400, 300, 600);
  const statedLineHeight = num(v["typography.line_height"]);
  const lineHeight = clamp(statedLineHeight ?? 1.8, 1.6, 2);
  if (statedLineHeight !== null && statedLineHeight < 1.4) {
    notes.push({
      path: "typography.line_height",
      note: `行送り ${statedLineHeight.toFixed(2)} は本文には詰まりすぎるため、${lineHeight.toFixed(2)} にしました`,
    });
  }
  const spacingPx = px(v["typography.letter_spacing"]);
  const headingPx = px(v["typography.heading_size"]) ?? 24;
  const tracking = spacingPx === null ? 0 : clamp(spacingPx / headingPx, -0.02, 0.08);
  // A Latin-only stack leaves Japanese to the visitor's default; ask for the
  // matching Noto so the page reads the same on a machine without Hiragino.
  const fallbackFamily = (serif: boolean) => (serif ? "Noto Serif JP" : "Noto Sans JP");
  const loaded = [...headingFamilies, ...bodyFamilies];
  if (!headingFamilies.some((family) => JAPANESE.test(family) && GOOGLE_FONTS.has(family))) loaded.push(fallbackFamily(headingSerif));
  if (!bodyFamilies.some((family) => JAPANESE.test(family) && GOOGLE_FONTS.has(family))) loaded.push(fallbackFamily(bodySerif));
  const weights = [400, 500, 700, headingWeight, bodyWeight].map((w) => Math.round(w / 100) * 100);

  // ---- shape
  const cardRadiusStated = length(v["tokens.card_radius"], 32);
  const buttonRadiusStated = length(v["tokens.button_radius"], 999);
  const cardRadius = cardRadiusStated ?? (buttonRadiusStated && px(buttonRadiusStated)! < 20 ? buttonRadiusStated : "14px");
  const buttonRadius = buttonRadiusStated ?? cardRadiusStated ?? "10px";
  const borderWidth = length(v["tokens.border_width"], 4) ?? "1px";
  const cardShadow = shadow(v["tokens.card_shadow"]) ?? "none";
  const container = clamp(px(v["tokens.container_width"]) ?? 1120, 1000, 1200);
  const cardPx = px(cardRadius) ?? 14;

  return {
    dark,
    color: { bg, surface, text, line, action, onAction, inkAccent, glow, band, onBand },
    hero,
    font: {
      heading: stack(headingFamilies, headingSerif),
      body: stack(bodyFamilies.length > 0 ? bodyFamilies : headingFamilies, bodySerif),
      href: googleHref(loaded, weights),
      headingWeight,
      bodyWeight,
      bodySize: clamp(px(v["typography.body_size"]) ?? 16, 15, 17),
      lineHeight,
      tracking,
    },
    shape: {
      buttonRadius,
      buttonShadow: shadow(v["tokens.button_shadow"]) ?? "none",
      buttonWeight: clamp(num(v["tokens.button_weight"]) ?? 700, 400, 800),
      cardRadius,
      cardShadow,
      borderWidth,
      container,
      panelRadius: `${Math.min(cardPx * 2, 32)}px`,
      avatarRadius: cardPx === 0 ? "0" : "50%",
    },
    notes,
  };
}
