// One reading per field, for the brand top.
//
// The overview returns values (adopted) and claims (observed) as two flat
// lists. The page used to walk both to render a uniform grid of every field,
// which made a captured brand look like a spreadsheet: the primary colour had
// the same weight as the border width. The cards on the brand top need the
// opposite — ask for `palette.primary`, get one answer with its standing — so
// this folds the two lists into a map, value first, claim second.

import type { KnowledgeClaim, KnowledgeValue } from "@/app/api/brands/[id]/overview/route";

export type Reading = {
  value: unknown;
  /** 採用 (a value) or 推定 (a claim nobody has confirmed). */
  state: "adopted" | "claimed";
  confidence: string;
  /** Null for a value: adoption is the standing, not the source. */
  sourceKind: string | null;
  /** The parent brand this shows through from, when not the brand's own. */
  from: { id: string; name: string } | null;
};

export type BrandProfile = {
  get(path: string): Reading | null;
  /** The value as a string, or null when absent or not a string. */
  text(path: string): string | null;
  /** The value as a list of strings, or [] when absent. */
  list(path: string): string[];
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A claim the product only GUESSED — a model's reading — as opposed to one a
 * rule measured off the page (`evidenced`) or a person confirmed. The guess is
 * what the workspace marks 推定 and the published kit leaves out; a measured
 * fact (a social URL printed in the footer) travels with the adopted values.
 */
export function isGuess(reading: Reading | null): boolean {
  return (
    reading !== null &&
    reading.state === "claimed" &&
    reading.confidence !== "evidenced" &&
    reading.confidence !== "confirmed"
  );
}

export const isMeasuredClaim = (claim: { confidence: string }): boolean =>
  claim.confidence === "evidenced" || claim.confidence === "confirmed";

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function buildProfile(values: KnowledgeValue[], claims: KnowledgeClaim[]): BrandProfile {
  const readings = new Map<string, Reading>();
  // A claim whose confidence is `unknown` is a recorded gap, not a reading.
  for (const claim of claims) {
    if (claim.confidence === "unknown") continue;
    const seen = readings.get(claim.fieldPath);
    if (seen && seen.state === "adopted") continue;
    readings.set(claim.fieldPath, {
      value: claim.value,
      state: "claimed",
      confidence: claim.confidence,
      sourceKind: claim.sourceKind,
      from: null,
    });
  }
  for (const value of values) {
    readings.set(value.fieldPath, {
      value: value.value,
      state: "adopted",
      confidence: value.confidence,
      sourceKind: null,
      from: value.from ?? null,
    });
  }
  return {
    get: (path) => readings.get(path) ?? null,
    text: (path) => {
      const value = readings.get(path)?.value;
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    list: (path) => {
      const value = readings.get(path)?.value;
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item !== "")
        : [];
    },
  };
}

/**
 * The font families a CSS `font-family` value names, in order, without the
 * generic ones. `"Ubuntu, Noto Sans JP"` → `["Ubuntu", "Noto Sans JP"]`.
 */
const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "cursive",
  "fantasy",
  "inherit",
  "-apple-system",
  "blinkmacsystemfont",
]);

export function fontFamilies(stack: string | null): string[] {
  if (!stack) return [];
  return stack
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter((part) => part !== "" && !GENERIC_FAMILIES.has(part.toLowerCase()));
}

/** The social fields on the frame, in display order, with the host that identifies each. */
export const SOCIAL_NETWORKS = [
  { path: "social.x", label: "X", host: "x.com" },
  { path: "social.instagram", label: "Instagram", host: "instagram.com" },
  { path: "social.facebook", label: "Facebook", host: "facebook.com" },
  { path: "social.youtube", label: "YouTube", host: "youtube.com" },
  { path: "social.linkedin", label: "LinkedIn", host: "linkedin.com" },
  { path: "social.github", label: "GitHub", host: "github.com" },
] as const;

/** `https://www.instagram.com/funds_jp` → `@funds_jp`; a URL we cannot shorten stays a host. */
export function socialHandle(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (!last) return parsed.hostname.replace(/^www\./, "");
    // LinkedIn and YouTube put a type segment first (company/…, channel/…, @…).
    return last.startsWith("@") ? last : `@${last}`;
  } catch {
    return url;
  }
}
