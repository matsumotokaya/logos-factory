// What a brand is read FROM — its inputs — as opposed to what reading it
// produced.
//
// Both live in brand_materials. The site's screenshots and photographs are
// fetched BY a read (source_kind `url_fetch`): they are its output, and
// counting them as input made every read look stale the moment it finished.
// What a person fed in — a file, a page, a note — is uploaded
// (source_kind `upload`), and a PDF's images are taken out of it (derived)
// rather than fed in.
//
// Each input records when it was last read into the brand
// (provenance.read_at), so the input list can say 読み取り済み / 未読み取り
// and the pipeline knows what a read has not yet covered.
//
// No server-only imports: the materials route and the pipeline both use it.

export type InputKind = "file" | "url" | "note";

export type InputRow = {
  source_kind: string;
  derived_from_material_id: string | null;
  provenance: Record<string, unknown> | null;
};

/** The input a material is, or null when it is not one (a read's output, a PDF's image). */
export function inputOf(row: InputRow): { kind: InputKind; readAt: string | null } | null {
  if (row.source_kind !== "upload" || row.derived_from_material_id) return null;
  const provenance = row.provenance ?? {};
  const stated = provenance.input;
  const kind: InputKind = stated === "url" || stated === "note" || stated === "file" ? stated : "file";
  const readAt = typeof provenance.read_at === "string" ? provenance.read_at : null;
  return { kind, readAt };
}
