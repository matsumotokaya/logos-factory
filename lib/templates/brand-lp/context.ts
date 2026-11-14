import type { BrandKitBrief } from "@/lib/brand/kit/snapshot";
import { parseFeatures, parseVoices, type BrandFeature, type BrandVoice } from "@/lib/brand/content";

// What the LP is written from: the kit, and what the kit does not carry yet.
//
// The kit publishes adopted and measured values only (docs/product.md §2.1).
// A brand that was read a minute ago has its tagline, its features and its
// customers' words as 推定 — in the workspace, not in the kit. The LP is made
// with one button on exactly that brand, so it reads both, and remembers
// which was which: a fact that came from outside the kit is a line on the
// LP's page saying what to adopt.
//
// Pure, so the rule that decides an origin can be tested without a database.

/** `path` is the field the value was read from (`brand.description` for the brand row's own). */
export type LpFact<T> = { value: T; origin: "kit" | "workspace"; path: string };

export type LpScreen = { materialId: string; width: number | null; height: number | null };

export type LpContext = {
  kit: BrandKitBrief;
  lang: string;
  tagline: LpFact<string> | null;
  /** The site's own first headline, as printed (`voice.tagline`). */
  siteHeadline: LpFact<string> | null;
  description: LpFact<string> | null;
  audience: LpFact<string> | null;
  summary: LpFact<string> | null;
  tone: LpFact<string> | null;
  operator: LpFact<string> | null;
  ctaLabel: LpFact<string> | null;
  features: LpFact<BrandFeature[]> | null;
  voices: LpFact<BrandVoice[]> | null;
  screen: LpScreen | null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * @param guesses field_path → the workspace's latest reading that the kit
 *   does not carry (a claim nobody adopted). The kit wins wherever it speaks.
 */
export function lpContext(
  kit: BrandKitBrief,
  guesses: Record<string, unknown>,
  screen: LpScreen | null,
): LpContext {
  function read<T>(paths: string[], parse: (value: unknown) => T | null): LpFact<T> | null {
    for (const path of paths) {
      const value = parse(kit.values[path]);
      if (value !== null) return { value, origin: "kit", path };
    }
    for (const path of paths) {
      const value = parse(guesses[path]);
      if (value !== null) return { value, origin: "workspace", path };
    }
    return null;
  }

  // The brand row's own description is part of the kit as it stands.
  const description: LpFact<string> | null = text(kit.brand.description)
    ? { value: kit.brand.description.trim(), origin: "kit", path: "brand.description" }
    : read(["offering.description"], text);

  return {
    kit,
    lang: text(kit.values["site.lang"]) ?? "ja",
    tagline: read(["offering.tagline", "voice.tagline"], text),
    siteHeadline: read(["voice.tagline"], text),
    description,
    audience: read(["offering.audience"], text),
    summary: read(["offering.summary"], text),
    tone: read(["voice.tone"], text),
    operator: read(["identity.legal_name"], text),
    ctaLabel: read(["layout.cta_label"], text),
    features: read(["offering.features"], parseFeatures),
    voices: read(["proof.voices"], parseVoices),
    screen,
  };
}
