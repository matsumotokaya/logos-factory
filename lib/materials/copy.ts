import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteR2Object, getR2Object, putR2Object } from "@/lib/r2";

// Materials are copied, never shared (2026-09-08 決定).
//
// docs/asset-normalization.md §12. A material belongs to exactly one owner —
// one take, or the brand — and lives and dies with it. When a take is created
// from a brand it receives COPIES of what the brand hands down; when a take is
// duplicated the copy receives copies; when a take promotes a file to the brand
// the brand receives a copy and the take keeps its own. Nothing flows back, and
// nothing a brand does afterwards reaches a take already made.
//
// Before this, all three cases shared rows by reference: every event video's
// brief pointed at the same brand-scope mark row, a duplicate pinned the
// original's rows, and promotion rewrote `scope` on the row in place. That gave
// a material three possible owners, made the brand unable to delete a file any
// video used, and made every delete ask who else was holding on. One owner per
// row is what makes 「この動画のものは、この動画を消せば全部消える」 true without
// exceptions.
//
// Bytes are copied too, under the new owner's prefix. R2 storage is cheap and
// a take whose objects all live under its own prefix is deletable by prefix
// alone — the property `delete_take` (migration 0031) already relies on.

/** Everything a copy has to carry. Read with COPY_COLUMNS. */
export interface CopySource {
  id: string;
  kind: string;
  label: string;
  media_type: string | null;
  r2_key: string | null;
  bytes: number | null;
  checksum: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  opaque: boolean | null;
  luminance: number | string | null;
  ink_ratio: number | string | null;
  trim_width: number | null;
  trim_height: number | null;
  category: string | null;
  category_source: string | null;
  source_kind: string;
  source_url: string | null;
  logo_id: string | null;
  logo_candidate_id: string | null;
  derived_from_material_id: string | null;
  provenance: Record<string, unknown> | null;
  scope: string;
  take_id: string | null;
}

export const COPY_COLUMNS =
  "id, kind, label, media_type, r2_key, bytes, checksum, width, height, duration_ms, " +
  "opaque, luminance, ink_ratio, trim_width, trim_height, category, category_source, " +
  "source_kind, source_url, logo_id, logo_candidate_id, derived_from_material_id, " +
  "provenance, scope, take_id";

/** Who the copies will belong to. */
export type CopyDestination =
  | { scope: "take"; brandId: string; takeId: string }
  | { scope: "brand"; brandId: string };

export interface CopiedMaterial {
  id: string;
  /** The row it was copied from. */
  fromId: string;
  checksum: string | null;
  r2_key: string | null;
}

/** Run `fn` over `items` with at most `limit` in flight. Shared with the PDF
 *  expansion: a hundred sequential PUTs is slow, a hundred at once is a burst. */
export async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

const keyFor = (destination: CopyDestination, checksum: string): string =>
  destination.scope === "take"
    ? `brands/${destination.brandId}/takes/${destination.takeId}/materials/${checksum}`
    : `brands/${destination.brandId}/materials/${checksum}`;

/**
 * Copy a set of materials to a new owner, keeping the family shape.
 *
 * Parents are copied before children so `derived_from_material_id` can be
 * remapped onto the new ids: a PDF's images point at the copied PDF, not at
 * the original in another take. A parent outside the set leaves the pointer
 * null — the copy is then a plain file, which is the truth of it.
 *
 * Throws on a failure it cannot report row by row. Rows are inserted in one
 * statement, and if that fails every object uploaded for them is removed.
 */
export async function copyMaterials(
  supabase: SupabaseClient,
  sources: readonly CopySource[],
  destination: CopyDestination,
  userId: string,
): Promise<CopiedMaterial[]> {
  if (sources.length === 0) return [];

  // Parents first, so a child's pointer has something to be remapped to.
  const ids = new Set(sources.map((row) => row.id));
  const ordered: CopySource[] = [];
  const placed = new Set<string>();
  const place = (row: CopySource) => {
    if (placed.has(row.id)) return;
    const parent = row.derived_from_material_id;
    if (parent && ids.has(parent) && !placed.has(parent)) {
      const parentRow = sources.find((candidate) => candidate.id === parent);
      if (parentRow) place(parentRow);
    }
    placed.add(row.id);
    ordered.push(row);
  };
  for (const row of sources) place(row);

  const newIdOf = new Map<string, string>();
  for (const row of ordered) newIdOf.set(row.id, randomUUID());

  const rows: Array<Record<string, unknown>> = [];
  const uploaded: string[] = [];

  await forEachLimited(ordered, 4, async (source) => {
    let r2Key: string | null = null;
    let checksum = source.checksum;
    if (source.r2_key) {
      const body = await getR2Object(source.r2_key);
      if (!body) throw new Error(`素材の本体を取得できませんでした: ${source.label}`);
      checksum = checksum ?? createHash("sha256").update(body).digest("hex");
      r2Key = keyFor(destination, checksum);
      // The same bytes may already sit under this prefix — a duplicate of a
      // take that itself held two identical uploads. Overwriting with equal
      // bytes is harmless and cheaper than a HEAD first.
      await putR2Object(
        r2Key,
        body,
        source.media_type ?? "application/octet-stream",
        "private, max-age=0",
      );
      uploaded.push(r2Key);
    }
    const parent = source.derived_from_material_id;
    rows.push({
      id: newIdOf.get(source.id),
      scope: destination.scope,
      brand_id: destination.brandId,
      take_id: destination.scope === "take" ? destination.takeId : null,
      kind: source.kind,
      label: source.label,
      media_type: source.media_type,
      r2_key: r2Key,
      bytes: source.bytes,
      checksum,
      width: source.width,
      height: source.height,
      duration_ms: source.duration_ms,
      opaque: source.opaque,
      luminance: source.luminance,
      ink_ratio: source.ink_ratio,
      trim_width: source.trim_width,
      trim_height: source.trim_height,
      // A classification a person corrected stays corrected on the copy. The
      // two rows are independent from here on: fixing one later fixes one.
      category: source.category,
      category_source: source.category_source,
      source_kind: source.source_kind,
      source_url: source.source_url,
      logo_id: source.logo_id,
      logo_candidate_id: source.logo_candidate_id,
      derived_from_material_id: parent && newIdOf.has(parent) ? newIdOf.get(parent) : null,
      // The origin story travels with the file (a PDF's page, an upload's
      // fingerprint), and the copy says which row it was taken from.
      provenance: {
        ...(source.provenance ?? {}),
        copied_from: {
          material_id: source.id,
          scope: source.scope,
          take_id: source.take_id,
        },
        copied_by: userId,
        copied_at: new Date().toISOString(),
      },
      ...(destination.scope === "brand"
        ? { promoted_at: new Date().toISOString(), promoted_by: userId }
        : {}),
      created_by: userId,
    });
  });

  // Insert order matters for nothing here — the FK is deferred to row identity,
  // not to statement order — but keeping parents first makes the rows readable.
  rows.sort(
    (a, b) =>
      ordered.findIndex((row) => newIdOf.get(row.id) === a.id) -
      ordered.findIndex((row) => newIdOf.get(row.id) === b.id),
  );
  const inserted = await supabase.from("brand_materials").insert(rows);
  if (inserted.error) {
    await Promise.all(uploaded.map((key) => deleteR2Object(key).catch(() => undefined)));
    throw new Error(`素材をコピーできませんでした: ${inserted.error.message}`);
  }

  return ordered.map((source) => ({
    id: newIdOf.get(source.id) as string,
    fromId: source.id,
    checksum: source.checksum,
    r2_key: rows.find((row) => row.id === newIdOf.get(source.id))?.r2_key as string | null,
  }));
}
