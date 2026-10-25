// Making the normalised version of a supplied mark, when a person says yes.
//
// docs/asset-normalization.md §11. Intake measured the file and the inventory
// offered: 「白い地に載っています / 余白が大きい — 正規化バージョンも作成します
// か?」. This is the yes.
//
// THE ORIGINAL IS NEVER TOUCHED (§15). The result is a new material carrying
// `derived_from_material_id`, which is what makes automatic trimming safe to
// offer at all: cutting too much is recoverable because the file that arrived is
// still there, still pinned, still the thing the inventory lists first.
//
// Approving also REPOINTS the briefs that were using the original, because
// otherwise the answer to 「作成しますか」 would be a file in a list and no
// change on screen. The repoint is a brief edit, not a render: the video says
// 「未反映」 until it is run, which is the state model working as designed
// (docs/video-state-model.md).
//
// The reading path keeps the original. A model asked what an image depicts should
// see what the user handed over, and the trimmed copy is the same picture with
// less air — sending both would spend tokens to get one answer twice.

import { createHash, randomUUID } from "node:crypto";

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { deleteR2Object, getR2Object, putR2Object } from "@/lib/r2";
import { measureMaterial, measurementColumns } from "@/lib/materials/measure";
import { normalizeMark } from "@/lib/materials/normalize";
import { normalizationProposal } from "@/lib/materials/optical";
import { materialUri, replaceMaterialUris } from "@/lib/takes/material-uri";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** The pin role a normalised derivative gets. Never `brief_source`: the
 *  extraction stage reads by that role, and the trimmed copy is not new
 *  material to read. */
export const NORMALIZED_ROLE = "normalized";

/** What a normalisation needs to read off the original's row. */
const COLUMNS =
  "id, brand_id, scope, take_id, kind, label, media_type, r2_key, width, height, " +
  "opaque, ink_ratio, trim_width, trim_height, category, category_source";

interface MaterialRow {
  id: string;
  brand_id: string;
  scope: string;
  take_id: string | null;
  kind: string;
  label: string;
  media_type: string | null;
  r2_key: string | null;
  width: number | null;
  height: number | null;
  opaque: boolean | null;
  ink_ratio: number | string | null;
  trim_width: number | null;
  trim_height: number | null;
  category: string | null;
  category_source: string | null;
}

/**
 * Where the derived object lives.
 *
 * Content-addressed like every other material, and under the same prefix as its
 * original so a take's objects stay together — the delete path walks by prefix,
 * and a derivative filed elsewhere would outlive the take that owns it.
 */
const derivedKey = (row: MaterialRow, checksum: string): string =>
  row.scope === "take" && row.take_id
    ? `brands/${row.brand_id}/takes/${row.take_id}/materials/${checksum}`
    : `brands/${row.brand_id}/materials/${checksum}`;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; materialId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, materialId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const current = await supabase
    .from("brand_materials")
    .select(COLUMNS)
    .eq("id", materialId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (current.error) {
    return Response.json({ error: "素材を確認できませんでした" }, { status: 500 });
  }
  if (!current.data) {
    return Response.json({ error: "素材が見つかりません" }, { status: 404 });
  }
  const row = current.data as unknown as MaterialRow;
  if (!row.r2_key) {
    return Response.json(
      { error: "この素材はファイルを持っていないので正規化できません" },
      { status: 400 },
    );
  }

  // The screen decided this was worth offering; the server decides again with
  // the same function, so a stale page cannot trim a photograph.
  const proposal = normalizationProposal({
    kind: row.kind,
    category: row.category,
    media_type: row.media_type,
    width: row.width,
    height: row.height,
    opaque: row.opaque,
    inkRatio: row.ink_ratio === null ? null : Number(row.ink_ratio),
    trimWidth: row.trim_width,
    trimHeight: row.trim_height,
  });
  if (!proposal.propose) {
    return Response.json(
      { error: "この素材には正規化するところがありません" },
      { status: 409 },
    );
  }

  // Already done. Returning the existing row rather than an error means a double
  // click costs nothing and does not write a second identical file.
  const existing = await supabase
    .from("brand_materials")
    .select("id, label, kind, media_type, width, height, bytes")
    .eq("derived_from_material_id", materialId)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return Response.json({ error: "既存の正規化を確認できませんでした" }, { status: 500 });
  }
  if (existing.data) {
    return Response.json({ material: existing.data, duplicate: true }, { status: 200 });
  }

  const bytes = await getR2Object(row.r2_key);
  if (!bytes) {
    return Response.json({ error: "素材の本体を取得できませんでした" }, { status: 502 });
  }

  const normalized = await normalizeMark(bytes, row.media_type);
  if (!normalized) {
    // Measured as worth trimming, but the operation found nothing to remove.
    // Saying so beats writing a byte-identical twin.
    return Response.json(
      { error: "この素材から切り取れる余白は見つかりませんでした" },
      { status: 409 },
    );
  }

  const checksum = createHash("sha256").update(normalized.body).digest("hex");
  const r2Key = derivedKey(row, checksum);
  await putR2Object(r2Key, normalized.body, normalized.mediaType, "private, max-age=0");

  // Measured from the derived bytes, not copied from the original: the trimmed
  // file has its own width, its own transparency (the plate is gone) and its own
  // brightness, and every reader of those columns has to see the file it has.
  const measurement = await measureMaterial(normalized.body, normalized.mediaType);

  const derivedId = randomUUID();
  const inserted = await supabase
    .from("brand_materials")
    .insert({
      id: derivedId,
      // The same reach as its original. A derivative is the same asset in a
      // better form, so narrowing it would hide it from takes that may use it
      // and widening it would promote something nobody promoted.
      scope: row.scope,
      brand_id: row.brand_id,
      take_id: row.take_id,
      kind: row.kind,
      // The name the file arrived with, unchanged (§8.1): the displayed name is
      // derived, and `source_kind='derived'` is what puts 「trimmed」 in it.
      label: row.label,
      media_type: normalized.mediaType,
      r2_key: r2Key,
      bytes: normalized.body.length,
      checksum,
      ...measurementColumns(measurement),
      // What it depicts did not change, so a classification already corrected by
      // a person carries over rather than being asked again.
      category: row.category,
      category_source: row.category_source,
      source_kind: "derived",
      derived_from_material_id: materialId,
      provenance: {
        source: "mark_normalization",
        operations: normalized.operations,
        normalized_by: user.id,
        from_fill: proposal.fill,
      },
      created_by: user.id,
    })
    .select("id, label, kind, media_type, width, height, bytes")
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    await deleteR2Object(r2Key).catch(() => undefined);
    return Response.json(
      { error: "正規化した素材を登録できませんでした" },
      { status: 403 },
    );
  }

  // Pin it wherever the original is pinned, so every take that could resolve the
  // original can resolve this one. Without a pin the brief points at bytes the
  // render stage will not download (lib/takes/materials.ts).
  const pins = await supabase
    .from("take_inputs")
    .select("take_id")
    .eq("material_id", materialId);
  const takeIds = [...new Set((pins.data ?? []).map((pin) => pin.take_id as string))];
  if (takeIds.length > 0) {
    await supabase.from("take_inputs").upsert(
      takeIds.map((takeId) => ({
        take_id: takeId,
        material_id: derivedId,
        role: NORMALIZED_ROLE,
        checksum,
      })),
      { onConflict: "take_id,material_id,role" },
    );
  }

  // Repoint the briefs that were using the original. `baked_brief` is left
  // alone on purpose: it is what the current video was made from, and the
  // difference between the two is exactly what 「未反映」 reports.
  let repointed = 0;
  if (takeIds.length > 0) {
    const takes = await supabase
      .from("takes")
      .select("id, brief")
      .in("id", takeIds);
    for (const take of takes.data ?? []) {
      const brief = take.brief as unknown;
      const next = replaceMaterialUris(brief, (id) =>
        id === materialId ? materialUri(derivedId) : null,
      );
      if (JSON.stringify(next) === JSON.stringify(brief)) continue;
      const saved = await supabase
        .from("takes")
        .update({ brief: next })
        .eq("id", take.id as string);
      if (!saved.error) repointed += 1;
    }
  }

  return Response.json(
    {
      material: inserted.data,
      operations: normalized.operations,
      repointed,
      // What the person is told: the two numbers that make the change legible.
      from: row.width && row.height ? { width: row.width, height: row.height } : null,
      to: { width: normalized.width, height: normalized.height },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
