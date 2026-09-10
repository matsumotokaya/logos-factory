import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2Configured, putR2Object } from "@/lib/r2";
import { measureMaterial, measurementColumns } from "@/lib/materials/measure";
import { materialUri } from "@/lib/takes/materials";
import { seedEventCmBrief } from "./seed";
import type { EventCmBrief } from "@/remotion/event-cm/types";

// Seed an event video from what a brand already has.
//
// The pure seeder (seed.ts) knows nothing about the database; this reads the
// brand, its adopted palette and its mark, and hands the seeder real values.
// The one piece of real work here is the logo: a brand's mark lives in
// logo_candidates as SVG, and the renderer reads materials. So the mark is
// promoted into a brand-scoped material the first time a video needs it, and
// every later take reuses that same row.
//
// Promotion is content-addressed and idempotent: the same mark never becomes
// two materials, and a take pinning it gets the exact bytes that were pinned.

export interface SeededEventCm {
  brief: EventCmBrief;
  /** The material the brief points at, to be pinned into take_inputs. */
  logoMaterial: { id: string; checksum: string } | null;
  /** Why the mark could not be used, when it could not. */
  logoNote: string | null;
}

/**
 * A promoted mark, and what was measured about it.
 *
 * The measurement is part of the return value because it was already part of
 * the work: this function measures the SVG, writes the result to
 * `brand_materials`, and used to hand back only `{id, checksum}`. The seeder
 * then had nothing to put in the brief, the renderer had nothing to read, and
 * the mark was drawn as supplied — a 0.003-luminance SVG on the ink ground.
 * Measuring something and not returning it is how that happened.
 */
interface PromotedLogo {
  id: string;
  checksum: string;
  opaque: boolean | null;
  luminance: number | null;
}

/**
 * One row, read the same way on both paths.
 *
 * `luminance` is `numeric` in Postgres and arrives as a STRING through
 * postgres-js. Handed straight to the renderer it compares as a string against
 * 0.45 and the treatment comes out wrong for every mark — so the coercion
 * happens here, once, where the column type is in view.
 */
const measuredLogo = (row: Record<string, unknown>): PromotedLogo => ({
  id: row.id as string,
  checksum: row.checksum as string,
  opaque: typeof row.opaque === "boolean" ? row.opaque : null,
  luminance: row.luminance === null || row.luminance === undefined
    ? null
    : Number(row.luminance),
});

async function promoteLogoToMaterial(
  supabase: SupabaseClient,
  brandId: string,
  userId: string,
): Promise<{ material: PromotedLogo | null; note: string | null }> {
  const { data: logos, error } = await supabase
    .from("logos")
    .select("id, title, logo_candidates(id, is_primary, svg, media_type)")
    .eq("subject_entity_id", brandId)
    .order("created_at", { ascending: true });
  if (error) return { material: null, note: "ロゴを読み込めませんでした" };

  type Candidate = { id: string; is_primary: boolean; svg: string | null; media_type: string | null };
  const rows = (logos ?? []) as Array<{ id: string; title: string; logo_candidates: Candidate[] | null }>;
  // The brand's own first logo, and its primary candidate — the master the
  // presentation already treats as canonical.
  const owner = rows.find((row) =>
    (row.logo_candidates ?? []).some((candidate) => candidate.is_primary && candidate.svg),
  );
  const candidate = owner?.logo_candidates?.find((item) => item.is_primary && item.svg);
  if (!owner || !candidate?.svg) {
    return { material: null, note: "このブランドにはSVGマスターを持つロゴがありません" };
  }

  const existing = await supabase
    .from("brand_materials")
    .select("id, checksum, opaque, luminance")
    .eq("brand_id", brandId)
    .eq("scope", "brand")
    .eq("logo_candidate_id", candidate.id)
    .limit(1)
    .maybeSingle();
  if (existing.data?.checksum) {
    return { material: measuredLogo(existing.data), note: null };
  }

  if (!isR2Configured()) {
    return { material: null, note: "素材の保存先(R2)が未設定です" };
  }
  const bytes = Buffer.from(candidate.svg, "utf8");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  // Same key format as the material upload route: content hash, so the same
  // mark uploaded twice cannot become two objects.
  const r2Key = `brands/${brandId}/materials/${checksum}/logo.svg`;
  await putR2Object(r2Key, bytes, "image/svg+xml", "private, max-age=0");

  // An SVG master measures too: it is the one mark that is definitely artwork,
  // so recording that it carries alpha is what lets a later reader distinguish
  // it from a logo delivered on a JPEG plate (docs/asset-normalization.md §6).
  const measurement = await measureMaterial(bytes, "image/svg+xml");

  const inserted = await supabase
    .from("brand_materials")
    .insert({
      scope: "brand",
      brand_id: brandId,
      kind: "logo",
      label: `${owner.title}.svg`,
      media_type: "image/svg+xml",
      r2_key: r2Key,
      logo_id: owner.id,
      logo_candidate_id: candidate.id,
      bytes: bytes.length,
      checksum,
      ...measurementColumns(measurement),
      source_kind: "derived",
      provenance: { source: "logo_master", logo_id: owner.id, promoted_by: userId },
      created_by: userId,
    })
    .select("id, checksum, opaque, luminance")
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    return { material: null, note: "ロゴを素材として登録できませんでした" };
  }
  return {
    material: measuredLogo(inserted.data),
    note: null,
  };
}

export async function seedEventCmFromBrand(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    userId: string;
    now?: Date;
    /** The painting chosen in the add dialog. Absent = the template's first. */
    artDirection?: string;
  },
): Promise<{ ok: true; seeded: SeededEventCm } | { ok: false; error: string }> {
  const [brandResult, knowledgeResult] = await Promise.all([
    supabase
      .from("brand_entities")
      .select("id, name, industry, description")
      .eq("id", input.brandId)
      .maybeSingle(),
    supabase
      .from("brand_knowledge_values")
      .select("field_path, value")
      .eq("brand_id", input.brandId)
      .is("variant_id", null),
  ]);
  if (brandResult.error || !brandResult.data) {
    return { ok: false, error: "ブランドを確認できませんでした" };
  }

  const palette: Record<string, string> = {};
  const typography: Record<string, string> = {};
  for (const row of knowledgeResult.data ?? []) {
    const path = row.field_path as string;
    if (typeof row.value !== "string") continue;
    if (path.startsWith("palette.")) palette[path.slice("palette.".length)] = row.value;
    if (path.startsWith("typography.")) typography[path.slice("typography.".length)] = row.value;
  }

  // A logo that cannot be promoted is not an error: the composition falls back
  // to a mincho credit line, and the seeder records the mark as inferred.
  const { material, note } = await promoteLogoToMaterial(
    supabase,
    input.brandId,
    input.userId,
  );

  const brief = seedEventCmBrief(
    {
      name: brandResult.data.name as string,
      industry: brandResult.data.industry as string | null,
      description: brandResult.data.description as string | null,
      palette,
      headingFont: typography.heading_font ?? null,
      bodyFont: typography.body_font ?? null,
      logo: material
        ? {
            src: materialUri(material.id),
            opaque: material.opaque,
            luminance: material.luminance,
          }
        : null,
    },
    {
      now: input.now ?? new Date(),
      seed: input.brandId,
      ...(input.artDirection ? { artDirection: input.artDirection } : {}),
    },
  );

  return { ok: true, seeded: { brief, logoMaterial: material, logoNote: note } };
}
