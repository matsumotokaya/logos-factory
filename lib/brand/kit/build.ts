import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_PREVIEW_COLUMNS, type LogoPreviewCandidate } from "@/lib/brand/logo-preview";
import { brandChain, ownReadings, resolveChain, type ChainBrand } from "./inherit";
import { KIT_LOGO_SVG_MAX_BYTES, type BrandKitBrief } from "./snapshot";

// The draft kit: the brand as it is right now, in the brief's shape.
//
// Built the same way whether the caller wants to show it (the workspace's
// preview), compare it (「更新あり」 is this hash against the live take's) or
// publish it (then it becomes a take's brief and stops changing). A
// sub-brand's brief is resolved through its parents, so what is frozen is
// what the reader saw.

export async function buildKitBrief(
  supabase: SupabaseClient,
  brandId: string,
): Promise<{ ok: true; brief: BrandKitBrief } | { ok: false; status: number; error: string }> {
  const entity = await supabase
    .from("brand_entities")
    .select("id, name, brand_kind, website, industry, location, description")
    .eq("id", brandId)
    .maybeSingle();
  if (entity.error) return { ok: false, status: 500, error: entity.error.message };
  if (!entity.data) return { ok: false, status: 404, error: "ブランドが見つかりません" };

  // The brand and what sits beneath it: a sub-brand's gaps are filled by its
  // parent's readings, logos and key visual (inherit.ts).
  const chainResult = await brandChain(supabase, brandId);
  if (!chainResult.ok) return { ok: false, status: 500, error: chainResult.error };
  const chain = chainResult.chain;
  const chainIds = chain.map((brand) => brand.id);

  const [readings, logos, keyVisuals] = await Promise.all([
    ownReadings(supabase, chainIds),
    supabase
      .from("logos")
      .select(`id, subject_entity_id, title, role, logo_candidates(${LOGO_PREVIEW_COLUMNS})`)
      .in("subject_entity_id", chainIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("brand_materials")
      .select("id, brand_id, r2_key, media_type, width, height")
      .in("brand_id", chainIds)
      .eq("scope", "brand")
      .eq("kind", "keyvisual")
      .not("r2_key", "is", null)
      .order("created_at", { ascending: false }),
  ]);
  if (!readings.ok) return { ok: false, status: 500, error: readings.error };
  if (logos.error) return { ok: false, status: 500, error: logos.error.message };
  if (keyVisuals.error) return { ok: false, status: 500, error: keyVisuals.error.message };

  const row = entity.data;
  const adopted: Record<string, unknown> = {};
  const inherited: Record<string, { id: string; name: string }> = {};
  for (const reading of resolveChain(chain, readings.byBrand)) {
    adopted[reading.fieldPath] = reading.value;
    if (reading.from) inherited[reading.fieldPath] = reading.from;
  }

  // Nearest brand in the chain (self first) that has any logo / key visual.
  const nearest = <T extends { brand: string }>(rows: T[]): { owner: ChainBrand; rows: T[] } | null => {
    for (const brand of [...chain].reverse()) {
      const own = rows.filter((item) => item.brand === brand.id);
      if (own.length > 0) return { owner: brand, rows: own };
    }
    return null;
  };
  const logoRows = (logos.data ?? []).map((logo) => ({ brand: logo.subject_entity_id as string, logo }));
  const logoPick = nearest(logoRows);
  const briefLogos = (logoPick?.rows ?? []).map(({ logo }) => {
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
  const kvRows = (keyVisuals.data ?? []).map((kv) => ({ brand: kv.brand_id as string, kv }));
  const kvPick = nearest(kvRows);
  const kv = kvPick?.rows[0]?.kv ?? null;
  const borrowed = (pick: { owner: ChainBrand } | null) =>
    pick && pick.owner.id !== brandId ? pick.owner : null;

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
      inherited,
      logos: briefLogos,
      logosFrom: borrowed(logoPick),
      keyVisual: kv
        ? {
            materialId: kv.id as string,
            r2Key: kv.r2_key as string,
            mediaType: (kv.media_type as string) ?? "image/jpeg",
            width: (kv.width as number | null) ?? null,
            height: (kv.height as number | null) ?? null,
          }
        : null,
      keyVisualFrom: borrowed(kvPick),
    },
  };
}
