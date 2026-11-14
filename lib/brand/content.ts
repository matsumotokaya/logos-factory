// What a brand says for itself, as the shapes brand knowledge stores them in:
// the features it lists (`offering.features`) and the customers it quotes
// (`proof.voices`). Read off the site by site-content.ts; shown on the kit
// page, written into brand.md, and placed on the LP.
//
// A stored value is JSON a claim carried, so every reader parses it the same
// way, here. No server-only imports.

export type BrandFeature = { title: string; description: string };
export type BrandVoice = { quote: string; name: string; role: string };

export const CONTENT_PATHS = ["offering.features", "proof.voices"] as const;

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** The features in a stored value, or null when it holds none. */
export function parseFeatures(value: unknown): BrandFeature[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const title = text(row.title);
    return title ? [{ title, description: text(row.description) }] : [];
  });
  return items.length > 0 ? items : null;
}

/** The voices in a stored value, or null when it holds none. */
export function parseVoices(value: unknown): BrandVoice[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const quote = text(row.quote);
    return quote ? [{ quote, name: text(row.name), role: text(row.role) }] : [];
  });
  return items.length > 0 ? items : null;
}
