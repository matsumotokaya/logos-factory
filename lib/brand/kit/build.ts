import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_PREVIEW_COLUMNS, type LogoPreviewCandidate } from "@/lib/brand/logo-preview";
import { KIT_LOGO_SVG_MAX_BYTES, type BrandKitBrief } from "./snapshot";

// The draft kit: the brand as it is right now, in the brief's shape.
//
// Built the same way whether the caller wants to show it (the workspace's
// preview), compare it (「更新あり」 is this hash against the live take's) or
// publish it (then it becomes a take's brief and stops changing).

export async function buildKitBrief(
  supabase: SupabaseClient,
  brandId: string,
): Promise<{ ok: true; brief: BrandKitBrief } | { ok: false; status: number; error: string }> {
  const [entity, values, measured, logos, keyVisual] = await Promise.all([
    supabase
      .from("brand_entities")
      .select("id, name, brand_kind, website, industry, location, description")
      .eq("id", brandId)
      .maybeSingle(),
    supabase
      .from("brand_knowledge_values")
      .select("field_path, value")
      .eq("brand_id", brandId)
      .is("variant_id", null)
      .order("field_path"),
    // Facts a rule read off the page — social links, contact, the site's
    // language — are never adopted by the import (site-knowledge.ts) but are
    // measured, not guessed, so the kit carries them. Newest first; the
    // first of each path wins.
    supabase
      .from("brand_knowledge_claims")
      .select("field_path, value, observed_at")
      .eq("brand_id", brandId)
      .is("variant_id", null)
      .eq("confidence", "evidenced")
      .order("observed_at", { ascending: false })
      .limit(400),
    supabase
      .from("logos")
      .select(`id, title, role, logo_candidates(${LOGO_PREVIEW_COLUMNS})`)
      .eq("subject_entity_id", brandId)
      .order("created_at", { ascending: true }),
    supabase
      .from("brand_materials")
      .select("id, r2_key, media_type, width, height")
      .eq("brand_id", brandId)
      .eq("scope", "brand")
      .eq("kind", "keyvisual")
      .not("r2_key", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (entity.error) return { ok: false, status: 500, error: entity.error.message };
  if (!entity.data) return { ok: false, status: 404, error: "ブランドが見つかりません" };
  if (values.error) return { ok: false, status: 500, error: values.error.message };
  if (measured.error) return { ok: false, status: 500, error: measured.error.message };
  if (logos.error) return { ok: false, status: 500, error: logos.error.message };
  if (keyVisual.error) return { ok: false, status: 500, error: keyVisual.error.message };

  const row = entity.data;
  const adopted: Record<string, unknown> = {};
  for (const claim of [...(measured.data ?? [])].reverse()) {
    const value = claim.value;
    if (value === null || value === undefined || value === "") continue;
    adopted[claim.field_path as string] = value;
  }
  for (const value of values.data ?? []) {
    adopted[value.field_path as string] = value.value;
  }

  const briefLogos = (logos.data ?? []).map((logo) => {
    const candidates = (logo.logo_candidates ?? []) as LogoPreviewCandidate[];
    const primary = candidates.find((candidate) => candidate.is_primary) ?? candidates[0];
    const svg =
      primary?.svg && Buffer.byteLength(primary.svg, "utf8") <= KIT_LOGO_SVG_MAX_BYTES
        ? primary.svg
        : null;
    return {
      id: logo.id as string,
      title: (logo.title as string) ?? "",
      role: (logo.role as string) ?? "",
      svg,
      mediaType: svg ? "image/svg+xml" : ((primary?.media_type as string | null) ?? null),
      r2Key: svg ? null : ((primary?.file_path as string | null) ?? null),
    };
  });

  const kv = keyVisual.data;
  return {
    ok: true,
    brief: {
      version: 1,
      snapshotAt: new Date().toISOString(),
      brand: {
        id: row.id as string,
        name: (row.name as string) ?? "",
        kind: (row.brand_kind as string) ?? "",
        description: (row.description as string) ?? "",
        industry: (row.industry as string) ?? "",
        location: (row.location as string) ?? "",
        website: (row.website as string) ?? "",
      },
      values: adopted,
      logos: briefLogos,
      keyVisual: kv
        ? {
            materialId: kv.id as string,
            r2Key: kv.r2_key as string,
            mediaType: (kv.media_type as string) ?? "image/jpeg",
            width: (kv.width as number | null) ?? null,
            height: (kv.height as number | null) ?? null,
          }
        : null,
    },
  };
}
