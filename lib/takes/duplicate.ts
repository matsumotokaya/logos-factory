import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTake } from "@/lib/takes/create";
import { duplicateTitle } from "@/lib/takes/naming";
import {
  COPY_COLUMNS,
  copyMaterials,
  type CopiedMaterial,
  type CopySource,
} from "@/lib/materials/copy";
import { materialUri, replaceMaterialUris } from "@/lib/takes/material-uri";

// Duplicating a take — a second version of a video or an LP.
//
// A take is the editable thing, so "make a variant of this" means a new take
// carrying the same brief and its own copies of every material the source
// holds (docs/asset-normalization.md §12, 2026-09-08). Rows AND bytes are
// copied: the two versions share nothing, so deleting either one takes exactly
// its own files and nothing of the other's. Until 2026-09-08 the copy pinned
// the source's rows instead, which is why `delete_take` had to ask what to do
// with materials and why deleting a source could blank its duplicate.
//
// The copy is pinned to the template's *current* production version, not the
// source's. A take may not be created against a retired version, and a brief
// the current schema rejects is reported rather than silently reshaped.
//
// Renders are not copied. `createTake` makes the template's default render rows
// empty, so the copy starts as "not rendered yet" — carrying over the source's
// MP4 would claim these bytes came from this brief, and they did not.

export type DuplicateTakeOutcome =
  | { ok: true; takeId: string; title: string; inputsCopied: number }
  | { ok: false; status: number; error: string; issues?: string[] };

export async function duplicateTake(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    takeId: string;
    toolKind: "video" | "lp";
    createdBy: string;
    /** Overrides the generated 「…のコピー」 name. */
    title?: string | null;
  },
): Promise<DuplicateTakeOutcome> {
  const { data: source, error: sourceError } = await supabase
    .from("takes")
    .select(
      "id, brand_id, tool_kind, template_id, title, brief, baked_brief, baked_at, variant_id",
    )
    .eq("id", input.takeId)
    .eq("brand_id", input.brandId)
    .eq("tool_kind", input.toolKind)
    .maybeSingle();
  if (sourceError) {
    return { ok: false, status: 500, error: "複製元を取得できませんでした" };
  }
  if (!source) {
    return { ok: false, status: 404, error: "複製元が見つかりません" };
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("takes")
    .select("title")
    .eq("brand_id", input.brandId)
    .eq("tool_kind", input.toolKind);
  if (siblingsError) {
    return { ok: false, status: 500, error: "既存の名前を確認できませんでした" };
  }

  const title =
    input.title?.trim() ||
    duplicateTitle(
      (source.title as string | null) ?? "",
      (siblings ?? []).map((row) => (row.title as string | null) ?? ""),
    );

  const created = await createTake(supabase, {
    brandId: input.brandId,
    templateId: source.template_id as string,
    title,
    brief: source.brief,
    variantId: (source.variant_id as string | null) ?? null,
    createdBy: input.createdBy,
  });
  if (!created.ok) {
    return { ok: false, status: 500, error: created.error, issues: created.issues };
  }

  // The copy is the same film, not a fresh draft of it.
  //
  // Written after creation because `create_v2_take` fixes the take's columns and
  // knows nothing about a baked copy. Leaving it null would be a lie the screen
  // then tells: 「これは下書きのままの再生です。押すと読み上げが付いて尺が確定
  // します」 over a copy that already has its recording, followed by a TTS call
  // it did not need. What the copy genuinely lacks is an MP4, and that is
  // handled by not copying renders (above).
  if (source.baked_brief) {
    const { error: bakedError } = await supabase
      .from("takes")
      .update({ baked_brief: source.baked_brief, baked_at: source.baked_at })
      .eq("id", created.takeId);
    if (bakedError) {
      return {
        ok: false,
        status: 500,
        error: `複製は作成しましたが、動画の内容を引き継げませんでした: ${bakedError.message}`,
      };
    }
  }

  // What the source holds: every row scoped to it, plus anything it pinned
  // from elsewhere (a take made before 2026-09-08 pins the brand's mark row
  // directly). All of it becomes this take's own.
  const { data: pins, error: pinsError } = await supabase
    .from("take_inputs")
    .select("role, material_id, checksum")
    .eq("take_id", input.takeId);
  if (pinsError) {
    // The take exists and its brief is complete; only the materials are
    // missing. Saying so beats deleting the copy the user is now looking at.
    return {
      ok: false,
      status: 500,
      error: "複製は作成しましたが、素材の固定を引き継げませんでした",
    };
  }
  const pinnedIds = [...new Set((pins ?? []).map((pin) => pin.material_id as string))];
  const [own, pinned] = await Promise.all([
    supabase.from("brand_materials").select(COPY_COLUMNS).eq("take_id", input.takeId),
    pinnedIds.length > 0
      ? supabase.from("brand_materials").select(COPY_COLUMNS).in("id", pinnedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (own.error || pinned.error) {
    return { ok: false, status: 500, error: "複製は作成しましたが、素材を読めませんでした" };
  }
  const byId = new Map<string, CopySource>();
  for (const row of [...(own.data ?? []), ...(pinned.data ?? [])] as unknown as CopySource[]) {
    byId.set(row.id, row);
  }

  let copies: CopiedMaterial[];
  try {
    copies = await copyMaterials(
      supabase,
      [...byId.values()],
      { scope: "take", brandId: input.brandId, takeId: created.takeId },
      input.createdBy,
    );
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: `複製は作成しましたが、素材をコピーできませんでした: ${
        error instanceof Error ? error.message : ""
      }`,
    };
  }
  const newIdOf = new Map(copies.map((copy) => [copy.fromId, copy.id]));

  // The briefs point at material:<uuid>; every pointer moves onto the copy.
  // Both briefs, always together (docs/data-model.md §4.1): a pointer moved in
  // one and not the other would make the played film and the workbench
  // disagree about which bytes they mean.
  const repoint = (value: unknown) =>
    replaceMaterialUris(value, (id) => {
      const next = newIdOf.get(id);
      return next ? materialUri(next) : null;
    });
  const { error: repointError } = await supabase
    .from("takes")
    .update({
      brief: repoint(source.brief),
      ...(source.baked_brief ? { baked_brief: repoint(source.baked_brief) } : {}),
    })
    .eq("id", created.takeId);
  if (repointError) {
    return {
      ok: false,
      status: 500,
      error: `複製は作成しましたが、素材の参照を書き換えられませんでした: ${repointError.message}`,
    };
  }

  const rows = (pins ?? []).flatMap((pin) => {
    const materialId = newIdOf.get(pin.material_id as string);
    return materialId
      ? [
          {
            take_id: created.takeId,
            role: pin.role as string,
            material_id: materialId,
            checksum: pin.checksum as string | null,
          },
        ]
      : [];
  });
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("take_inputs").insert(rows);
    if (insertError) {
      return {
        ok: false,
        status: 500,
        error: `複製は作成しましたが、素材を固定できませんでした: ${insertError.message}`,
      };
    }
  }

  return { ok: true, takeId: created.takeId, title, inputsCopied: rows.length };
}
