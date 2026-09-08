import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteR2Object } from "@/lib/r2";

// Deleting a material a video holds, and everything that came out of it.
//
// docs/asset-normalization.md §9.4. Until now a video could only UNPIN a
// document: it left the reading list while the row stayed in the inventory
// forever, so a file uploaded by mistake could never be taken back and the bin
// icon was a promise the code did not keep. A material has one lifetime and one
// bin, and this is it.
//
// Three properties the schema already guarantees, which this code has to work
// with rather than around:
//
//   * `take_inputs.material_id` is ON DELETE RESTRICT (0028). Pins have to go
//     first, which is also what makes a dangling pin impossible.
//   * `derived_from_material_id` is ON DELETE SET NULL. Deleting a PDF would
//     leave its images as 79 parentless rows, so the family goes together.
//   * R2 keys are content-addressed, so an object may be shared by more than
//     one row. It goes only when the last row pointing at it is gone.

/** One row of the family, with what the delete needs off it. */
export interface FamilyMaterial {
  id: string;
  label: string;
  r2_key: string | null;
  derived_from_material_id: string | null;
}

export interface FamilyRefusal {
  error: string;
  status: number;
}

const COLUMNS = "id, label, r2_key, scope, take_id, derived_from_material_id";

interface Row extends FamilyMaterial {
  scope: string;
  take_id: string | null;
}

/**
 * The material and everything derived from it, transitively.
 *
 * Resolved from this take's own rows in one query rather than by walking the
 * pointer one level at a time: a PDF's images are children, and a normalised
 * copy of one of those images would be a grandchild.
 *
 * Refuses a material that is not this take's. A brand's own file is deleted
 * from the brand library, where the permission for it is checked — a video
 * must not be able to delete the mark every other deliverable draws.
 */
export async function resolveMaterialFamily(
  supabase: SupabaseClient,
  input: { brandId: string; takeId: string; materialId: string },
): Promise<{ family: FamilyMaterial[] } | FamilyRefusal> {
  const rows = await supabase
    .from("brand_materials")
    .select(COLUMNS)
    .eq("brand_id", input.brandId)
    .eq("take_id", input.takeId);
  if (rows.error) return { error: "素材を確認できませんでした", status: 500 };

  const all = (rows.data ?? []) as unknown as Row[];
  const target = all.find((row) => row.id === input.materialId);
  if (!target) {
    // Either it does not exist, or it belongs to the brand rather than to this
    // video. Both are 「not this video's to delete」, and saying which one it is
    // would report on rows the caller may not be allowed to see.
    return {
      error: "この素材はこの動画のものではないため、ここからは削除できません",
      status: 404,
    };
  }
  if (target.scope !== "take") {
    return {
      error: "ブランドの基盤に上げた素材は、ブランドの素材一覧から削除してください",
      status: 409,
    };
  }

  return { family: collectFamily(all, target.id) };
}

/**
 * The target and its descendants, in the order they were found.
 *
 * Pure so the shape can be asserted: a PDF's images are children, a normalised
 * copy of one of those images is a grandchild, and a pointer cycle — which the
 * schema forbids but a bad migration could still write — must not hang the
 * request.
 */
export function collectFamily<T extends FamilyMaterial>(
  rows: readonly T[],
  targetId: string,
): FamilyMaterial[] {
  const childrenOf = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.derived_from_material_id) continue;
    const list = childrenOf.get(row.derived_from_material_id) ?? [];
    list.push(row);
    childrenOf.set(row.derived_from_material_id, list);
  }
  const family: FamilyMaterial[] = [];
  const seen = new Set<string>();
  const walk = (row: T) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    family.push({
      id: row.id,
      label: row.label,
      r2_key: row.r2_key,
      derived_from_material_id: row.derived_from_material_id,
    });
    for (const child of childrenOf.get(row.id) ?? []) walk(child);
  };
  const target = rows.find((row) => row.id === targetId);
  if (target) walk(target);
  return family;
}

/**
 * Whether another take is holding any of these files.
 *
 * A duplicated video pins the original's materials (lib/takes/duplicate.ts), so
 * deleting one here would take a file out from under a deliverable nobody was
 * looking at. Refusing is the same stance the brand library takes, and for the
 * same reason: a take has to stay reproducible from its recorded inputs.
 */
export async function heldByOtherTakes(
  supabase: SupabaseClient,
  takeId: string,
  family: readonly FamilyMaterial[],
): Promise<{ others: number } | FamilyRefusal> {
  const pins = await supabase
    .from("take_inputs")
    .select("take_id, material_id")
    .in(
      "material_id",
      family.map((row) => row.id),
    )
    .neq("take_id", takeId);
  if (pins.error) return { error: "素材の利用状況を確認できませんでした", status: 500 };
  return { others: (pins.data ?? []).length };
}

/** Release this take's pins on the family, in every role they were pinned in. */
export async function unpinFamily(
  supabase: SupabaseClient,
  takeId: string,
  family: readonly FamilyMaterial[],
): Promise<FamilyRefusal | null> {
  const removed = await supabase
    .from("take_inputs")
    .delete()
    .eq("take_id", takeId)
    .in(
      "material_id",
      family.map((row) => row.id),
    );
  return removed.error ? { error: "素材を外せませんでした", status: 500 } : null;
}

export interface Destroyed {
  /** Rows actually deleted. */
  deleted: FamilyMaterial[];
  /** R2 objects removed, which is fewer when rows shared bytes. */
  objects: number;
}

/**
 * Delete the family's rows, then the bytes nothing points at any more.
 *
 * A short count back from the delete means RLS refused: 0028 grants DELETE on
 * `brand_materials` to the core rung only, so an editor's own upload is not
 * theirs to remove until that policy is widened (migration 0057). The caller
 * turns that into one sentence rather than a silent no-op.
 */
export async function destroyFamily(
  supabase: SupabaseClient,
  family: readonly FamilyMaterial[],
): Promise<{ destroyed: Destroyed } | FamilyRefusal> {
  const ids = family.map((row) => row.id);
  const removed = await supabase
    .from("brand_materials")
    .delete()
    .in("id", ids)
    .select("id");
  if (removed.error) {
    return { error: "素材を削除できませんでした", status: 500 };
  }
  const gone = new Set((removed.data ?? []).map((row) => row.id as string));
  if (gone.size === 0) {
    return {
      error: "素材を削除する権限がありません。このブランドの管理者に依頼してください",
      status: 403,
    };
  }

  // Content-addressed keys can be shared — a promoted row keeps the key it was
  // uploaded under — so each one is checked before its bytes go.
  let objects = 0;
  const keys = [...new Set(family.filter((row) => gone.has(row.id)).map((row) => row.r2_key))];
  for (const key of keys) {
    if (!key) continue;
    const others = await supabase
      .from("brand_materials")
      .select("id")
      .eq("r2_key", key)
      .limit(1);
    if (others.error || (others.data ?? []).length > 0) continue;
    await deleteR2Object(key).catch(() => undefined);
    objects += 1;
  }

  return {
    destroyed: { deleted: family.filter((row) => gone.has(row.id)), objects },
  };
}
