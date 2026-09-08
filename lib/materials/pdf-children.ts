import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteR2Object, putR2Object } from "@/lib/r2";
import { measureMaterial, measurementColumns } from "@/lib/materials/measure";
import { extractPdfImages, type PdfImage } from "@/lib/materials/pdf";

// The images inside a PDF, registered as materials of their own.
//
// docs/asset-normalization.md §9.4. Each raster becomes a row with
// `source_kind='derived'` and `derived_from_material_id` pointing at the PDF,
// the same shape the normalised copy of a mark has (normalize/route.ts). The
// PDF itself is untouched (§15): it stays the thing the model reads, whole.
//
// Shared by every intake that accepts a PDF — the video's material route, the
// brand's, and the on-demand expansion of a PDF that arrived before this
// existed — so the three cannot drift apart on what a child is.

/**
 * Pin role for a PDF's images on the take that holds the PDF.
 *
 * Never `brief_source`: the extraction stage reads that role and hands the
 * PDF over whole, keeping the photograph-next-to-caption adjacency the
 * structuring model takes names from. The children are for people to see and
 * take out, and for scenes to be pointed at later — not extra reading.
 */
export const PDF_IMAGE_ROLE = "pdf_image";

/** What a child row records about where it came from. */
export interface PdfChildProvenance {
  source: "pdf_extraction";
  from: "pdf";
  page: number;
  pages: number[];
  index: number;
  inline: boolean;
  channels: number;
  extracted_by: string;
}

export interface PdfParent {
  id: string;
  brand_id: string;
  scope: string;
  take_id: string | null;
  label: string;
}

export interface PdfExpansion {
  pages: number;
  /** Distinct images found in the file. */
  found: number;
  /** Rows written this time. */
  created: number;
  /** Already registered from an earlier expansion of the same file. */
  reused: number;
  /** Draws pdf.js could not decode. Reported, because a count that is short
   *  without saying so is the black box coming back. */
  unreadable: number;
  ms: number;
}

/** Where a child lives: beside its parent, content-addressed like everything. */
const childKey = (parent: PdfParent, checksum: string): string =>
  parent.scope === "take" && parent.take_id
    ? `brands/${parent.brand_id}/takes/${parent.take_id}/materials/${checksum}`
    : `brands/${parent.brand_id}/materials/${checksum}`;

/** The name a child arrives with: the PDF's, plus where in it. */
const childLabel = (parent: PdfParent, image: PdfImage): string => {
  const stem = parent.label.replace(/\.pdf$/i, "");
  const ext = image.mediaType === "image/png" ? "png" : "jpg";
  return `${stem}_p${image.page}_${String(image.index).padStart(2, "0")}.${ext}`.slice(0, 200);
};

/** Upload with a small amount of parallelism: a hundred sequential PUTs is
 *  slow, a hundred concurrent ones is a burst nobody asked for. */
async function forEachLimited<T>(
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

/**
 * Take a PDF apart and register what is inside as children of its row.
 *
 * Idempotent on content: a child whose bytes are already registered under this
 * parent is reused, so expanding the same PDF twice writes nothing new. Rows
 * are inserted in one statement; if that fails the uploaded objects are removed
 * so R2 does not keep bytes nothing points at.
 *
 * Throws when the bytes cannot be opened as a PDF. Callers that are in the
 * middle of an upload catch and report — the PDF is still material even when
 * its contents cannot be listed.
 */
export async function registerPdfChildren(
  supabase: SupabaseClient,
  parent: PdfParent,
  bytes: Buffer,
  userId: string,
): Promise<PdfExpansion> {
  const contents = await extractPdfImages(bytes);

  const existing = await supabase
    .from("brand_materials")
    .select("id, checksum")
    .eq("derived_from_material_id", parent.id);
  if (existing.error) throw new Error("既存の中身を確認できませんでした");
  const known = new Set((existing.data ?? []).map((row) => row.checksum as string));

  const fresh = contents.images.filter((image) => !known.has(image.checksum));
  const rows: Array<Record<string, unknown>> = [];
  const keys: string[] = [];

  await forEachLimited(fresh, 4, async (image) => {
    const key = childKey(parent, image.checksum);
    await putR2Object(key, image.body, image.mediaType, "private, max-age=0");
    keys.push(key);
    // Measured from the child's own bytes, as any upload is: a sliver of a
    // photograph and a cut-out violin have their own width, alpha and
    // brightness, and everything that reads those columns must see the file.
    const measurement = await measureMaterial(image.body, image.mediaType);
    const provenance: PdfChildProvenance = {
      source: "pdf_extraction",
      from: "pdf",
      page: image.page,
      pages: image.pages,
      index: image.index,
      inline: image.inline,
      channels: image.channels,
      extracted_by: userId,
    };
    rows.push({
      id: randomUUID(),
      // The same reach as the PDF: what was inside a take's flyer belongs to
      // that take, and what was inside a brand's deck to the brand.
      scope: parent.scope,
      brand_id: parent.brand_id,
      take_id: parent.take_id,
      kind: "photo",
      label: childLabel(parent, image),
      media_type: image.mediaType,
      r2_key: key,
      bytes: image.body.length,
      checksum: image.checksum,
      ...measurementColumns(measurement),
      source_kind: "derived",
      derived_from_material_id: parent.id,
      provenance,
      created_by: userId,
    });
  });

  if (rows.length > 0) {
    // Draw order, so the list a person sees matches the page.
    rows.sort((a, b) => {
      const pa = a.provenance as PdfChildProvenance;
      const pb = b.provenance as PdfChildProvenance;
      return pa.page - pb.page || pa.index - pb.index;
    });
    const inserted = await supabase.from("brand_materials").insert(rows);
    if (inserted.error) {
      await Promise.all(keys.map((key) => deleteR2Object(key).catch(() => undefined)));
      throw new Error("PDFの中身を登録できませんでした");
    }
  }

  // Pinned to the take that holds the PDF, so the render stage will hand a
  // child over once a scene points at it. Brand-scope rows are not pinned:
  // takes pin what they use when they use it.
  if (parent.scope === "take" && parent.take_id) {
    const all = await supabase
      .from("brand_materials")
      .select("id, checksum")
      .eq("derived_from_material_id", parent.id);
    const children = (all.data ?? []) as Array<{ id: string; checksum: string }>;
    if (children.length > 0) {
      const pinned = await supabase.from("take_inputs").upsert(
        children.map((child) => ({
          take_id: parent.take_id,
          material_id: child.id,
          role: PDF_IMAGE_ROLE,
          checksum: child.checksum,
        })),
        { onConflict: "take_id,material_id,role" },
      );
      if (pinned.error) throw new Error("PDFの中身を入力として固定できませんでした");
    }
  }

  return {
    pages: contents.pages,
    found: contents.images.length,
    created: rows.length,
    reused: contents.images.length - rows.length,
    unreadable: contents.unreadable,
    ms: contents.ms,
  };
}

/**
 * Unpin a PDF's children from a take, when the PDF itself is taken out.
 *
 * The rows and bytes stay, as the PDF's do: content-addressed objects are
 * cheap to keep and impossible to recreate. Returns the children's ids so the
 * caller can leave them out of what the take still holds.
 */
export async function unpinPdfChildren(
  supabase: SupabaseClient,
  takeId: string,
  parentId: string,
): Promise<string[]> {
  const children = await supabase
    .from("brand_materials")
    .select("id")
    .eq("derived_from_material_id", parentId)
    .eq("take_id", takeId);
  if (children.error) throw new Error("PDFの中身を確認できませんでした");
  const ids = (children.data ?? []).map((row) => row.id as string);
  if (ids.length === 0) return ids;
  const removed = await supabase
    .from("take_inputs")
    .delete()
    .eq("take_id", takeId)
    .eq("role", PDF_IMAGE_ROLE)
    .in("material_id", ids);
  if (removed.error) throw new Error("PDFの中身を外せませんでした");
  return ids;
}
