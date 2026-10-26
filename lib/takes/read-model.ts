import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandAssetKind, BrandAssetSummary } from "@/lib/brand-hierarchy";

interface PublicationRow {
  surface: string;
  url_path: string | null;
  status: string;
}

interface RenderRow {
  id: string;
  status: string;
  latest_artifact_id: string | null;
  publications: PublicationRow[] | null;
}

interface TakeRow {
  id: string;
  brand_id: string;
  tool_kind: string;
  template_id: string;
  title: string;
  status: string;
  brief: unknown;
  created_at: string;
  take_renders: RenderRow[] | null;
}

const assetKind = (toolKind: string): BrandAssetKind => {
  if (toolKind === "lp" || toolKind === "video" || toolKind === "banner") {
    return toolKind;
  }
  if (toolKind === "logo_presentation" || toolKind === "guideline") {
    return "guideline";
  }
  if (toolKind === "document") return "document";
  if (toolKind === "merch") return "mockup";
  return "other";
};

const assetStatus = (
  take: TakeRow,
): BrandAssetSummary["status"] => {
  if (take.status === "failed") return "failed";
  if (take.status === "archived") return "archived";
  const renders = take.take_renders ?? [];
  return renders.length > 0 &&
    renders.every(
      (render) => render.status === "ready" && render.latest_artifact_id,
    )
    ? "ready"
    : "pending";
};

export function takeAssetSummary(take: TakeRow): BrandAssetSummary {
  const publicPath = (take.take_renders ?? [])
    .flatMap((render) => render.publications ?? [])
    .find(
      (publication) =>
        publication.surface === "canonical_url" &&
        publication.status === "live" &&
        publication.url_path,
    )?.url_path;

  return {
    id: take.id,
    kind: assetKind(take.tool_kind),
    title: take.title,
    status: assetStatus(take),
    publicPath: publicPath ?? null,
    createdAt: take.created_at,
  };
}

export async function listTakeAssetsByBrand(
  supabase: SupabaseClient,
  brandIds: string[],
): Promise<{ data: Map<string, BrandAssetSummary[]>; error: string | null }> {
  const byBrand = new Map<string, BrandAssetSummary[]>();
  if (brandIds.length === 0) return { data: byBrand, error: null };

  const { data, error } = await supabase
    .from("takes")
    .select(
      "id, brand_id, tool_kind, template_id, title, status, brief, created_at, take_renders(id, status, latest_artifact_id, publications(surface, url_path, status))",
    )
    .in("brand_id", brandIds)
    .order("created_at", { ascending: false });
  if (error) return { data: byBrand, error: error.message };

  for (const take of (data ?? []) as unknown as TakeRow[]) {
    const current = byBrand.get(take.brand_id) ?? [];
    current.push(takeAssetSummary(take));
    byBrand.set(take.brand_id, current);
  }
  return { data: byBrand, error: null };
}
