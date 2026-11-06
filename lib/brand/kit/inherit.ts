import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Inheritance, resolved at read time.
//
// A sub-brand is complete on its own: everything it has is its own rows. Its
// parent is an attachment underneath — for every field the sub has not set,
// the parent's reading shows through (and the parent's parent beneath that).
// Nothing is copied when a parent is attached and nothing is deleted when it
// is detached: the parent's layer simply stops showing. A published kit
// froze whatever was resolved at the time, so changing the parent later
// turns into 「更新あり」 on the sub, never into a changed public page.
//
// The sub overrides the parent wherever it has a value of its own, with no
// per-field exceptions (owner's decision, 2026-11-06: start simple, tune
// which fields are fixed later if it proves necessary).

export type ChainBrand = { id: string; name: string };

/** The brand and every brand above it, root first. Cycle-safe. */
export async function brandChain(
  supabase: SupabaseClient,
  brandId: string,
): Promise<{ ok: true; chain: ChainBrand[] } | { ok: false; error: string }> {
  const chain: ChainBrand[] = [];
  const seen = new Set<string>();
  let cursor: string | null = brandId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const step: {
      data: { id: string; name: string | null; parent_brand_id: string | null } | null;
      error: { message: string } | null;
    } = await supabase
      .from("brand_entities")
      .select("id, name, parent_brand_id")
      .eq("id", cursor)
      .maybeSingle();
    if (step.error) return { ok: false, error: step.error.message };
    if (!step.data) break;
    chain.unshift({ id: step.data.id, name: step.data.name ?? "" });
    cursor = step.data.parent_brand_id;
  }
  return { ok: true, chain };
}

export type OwnReading = {
  fieldPath: string;
  value: unknown;
  /** `adopted` for a value; the claim's confidence (`evidenced`) for a measured fact. */
  confidence: string;
  decidedAt: string;
};

/**
 * What a brand itself states: its adopted values, plus the facts a rule
 * measured off its page (evidenced claims — social links, contact, language).
 * A model's guess is not included; it is the sub's workspace that shows
 * guesses, and only its own.
 */
export async function ownReadings(
  supabase: SupabaseClient,
  brandIds: string[],
): Promise<{ ok: true; byBrand: Map<string, OwnReading[]> } | { ok: false; error: string }> {
  const byBrand = new Map<string, OwnReading[]>();
  if (brandIds.length === 0) return { ok: true, byBrand };
  const [values, measured] = await Promise.all([
    supabase
      .from("brand_knowledge_values")
      .select("brand_id, field_path, value, confidence, decided_at")
      .in("brand_id", brandIds)
      .is("variant_id", null),
    supabase
      .from("brand_knowledge_claims")
      .select("brand_id, field_path, value, observed_at")
      .in("brand_id", brandIds)
      .is("variant_id", null)
      .eq("confidence", "evidenced")
      .order("observed_at", { ascending: false })
      .limit(800),
  ]);
  if (values.error) return { ok: false, error: values.error.message };
  if (measured.error) return { ok: false, error: measured.error.message };

  // Measured facts first (newest wins per path), then values on top.
  const perBrand = new Map<string, Map<string, OwnReading>>();
  const slot = (brandId: string) => {
    const current = perBrand.get(brandId) ?? new Map<string, OwnReading>();
    perBrand.set(brandId, current);
    return current;
  };
  for (const row of measured.data ?? []) {
    const value = row.value;
    if (value === null || value === undefined || value === "") continue;
    const readings = slot(row.brand_id as string);
    const path = row.field_path as string;
    if (readings.has(path)) continue;
    readings.set(path, { fieldPath: path, value, confidence: "evidenced", decidedAt: row.observed_at as string });
  }
  for (const row of values.data ?? []) {
    slot(row.brand_id as string).set(row.field_path as string, {
      fieldPath: row.field_path as string,
      value: row.value,
      confidence: (row.confidence as string) ?? "adopted",
      decidedAt: row.decided_at as string,
    });
  }
  for (const [brandId, readings] of perBrand) {
    byBrand.set(brandId, [...readings.values()].sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)));
  }
  return { ok: true, byBrand };
}

export type ResolvedReading = OwnReading & {
  /** The brand this reading came from when it is not the brand's own. */
  from: ChainBrand | null;
};

/** Root first, each brand overriding the one beneath; the last is the brand itself. */
export function resolveChain(
  chain: ChainBrand[],
  byBrand: Map<string, OwnReading[]>,
): ResolvedReading[] {
  const self = chain.at(-1);
  const resolved = new Map<string, ResolvedReading>();
  for (const brand of chain) {
    for (const reading of byBrand.get(brand.id) ?? []) {
      resolved.set(reading.fieldPath, {
        ...reading,
        from: self && brand.id === self.id ? null : brand,
      });
    }
  }
  return [...resolved.values()].sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
}
