// Brand overview — the data behind /brands/[id] (the brand top). Reads the
// brand_entity itself plus the adopted brand-knowledge facts, so the page can
// show "this brand's profile" (palette, fonts, voice rules) before it lists
// the assets (logos / videos / LPs).

import path from "node:path";
import { guardBrandRequest } from "@/lib/brand-access";
import { signedLabsUrl } from "@/lib/labs-output-sign";
import { brandMaterialSignatureToken } from "@/lib/takes/material-uri";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";

export type KnowledgeValue = {
  fieldPath: string;
  value: unknown;
  confidence: string;
  decidedAt: string;
};

/**
 * What was observed but not adopted.
 *
 * The page used to read values alone, so a brand the pipeline had just
 * finished measuring rendered as 「まだ採用されたデザインルールはありません」 —
 * it knew two dozen things and showed none of them. A claim is a real answer
 * carrying a real confidence, and the page's job is to show it as such rather
 * than pretend the field is blank.
 */
export type KnowledgeClaim = {
  fieldPath: string;
  value: unknown;
  layer: string;
  confidence: string;
  sourceKind: string;
  observedAt: string;
};

/** A file this brand holds, with a URL the browser can actually load. */
export type BrandFile = {
  id: string;
  kind: string;
  category: string | null;
  label: string;
  mediaType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  sourceKind: string;
  sourceUrl: string | null;
  role: string | null;
  createdAt: string;
  /** signed, same-origin, short-lived; null when the row has no body in R2 */
  url: string | null;
};

export type BrandOverview = {
  id: string;
  name: string;
  brandKind: string;
  /** The Organization this brand sits under. Re-importing the brand's look
   *  goes through the business PATCH, which requires it. */
  brandOrganizationId: string;
  /** The brand this one inherits from, if any (parent_brand_id). */
  parent: { id: string; name: string } | null;
  /** The workspace's main brand (organizations.main_brand_id). */
  isMain: boolean;
  website: string;
  industry: string;
  location: string;
  description: string;
  updatedAt: string;
  knowledge: KnowledgeValue[];
  claims: KnowledgeClaim[];
  files: BrandFile[];
};

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const [entityResult, knowledgeResult, claimsResult, filesResult] =
    await Promise.all([
      supabase
        .from("brand_entities")
        .select(
          "id, name, brand_kind, organization_id, parent_brand_id, website, industry, location, description, updated_at",
        )
        .eq("id", brandId)
        .maybeSingle(),
      supabase
        .from("brand_knowledge_values")
        .select("field_path, value, confidence, decided_at")
        .eq("brand_id", brandId)
        .is("variant_id", null)
        .order("field_path"),
      // Newest first so the reducer below can keep the first of each path:
      // claims are append-only and contradictions are kept, so "what do we
      // currently believe" is the most recent observation, not a merge.
      supabase
        .from("brand_knowledge_claims")
        .select("field_path, value, layer, confidence, source_kind, observed_at")
        .eq("brand_id", brandId)
        .is("variant_id", null)
        .order("observed_at", { ascending: false })
        .limit(400),
      supabase
        .from("brand_materials")
        .select(
          "id, kind, category, label, media_type, bytes, width, height, source_kind, source_url, provenance, r2_key, created_at",
        )
        .eq("brand_id", brandId)
        .eq("scope", "brand")
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

  if (entityResult.error) {
    return Response.json(
      { error: "ブランドを取得できませんでした" },
      { status: 500 },
    );
  }
  if (!entityResult.data) {
    return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
  }
  if (knowledgeResult.error || claimsResult.error || filesResult.error) {
    return Response.json(
      { error: "ブランドアセットを取得できませんでした" },
      { status: 500 },
    );
  }

  // One claim per field: the latest observation of it.
  const latestClaims: KnowledgeClaim[] = [];
  const seenPaths = new Set<string>();
  for (const row of claimsResult.data ?? []) {
    const fieldPath = row.field_path as string;
    if (seenPaths.has(fieldPath)) continue;
    seenPaths.add(fieldPath);
    latestClaims.push({
      fieldPath,
      value: row.value,
      layer: row.layer as string,
      confidence: row.confidence as string,
      sourceKind: row.source_kind as string,
      observedAt: row.observed_at as string,
    });
  }

  const files: BrandFile[] = (filesResult.data ?? []).map((row) => {
    const key = row.r2_key as string | null;
    const provenance = (row.provenance ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      kind: row.kind as string,
      category: (row.category as string | null) ?? null,
      label: (row.label as string) ?? "",
      mediaType: (row.media_type as string | null) ?? null,
      bytes: row.bytes === null || row.bytes === undefined ? null : Number(row.bytes),
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      sourceKind: row.source_kind as string,
      sourceUrl: (row.source_url as string | null) ?? null,
      role: typeof provenance.role === "string" ? provenance.role : null,
      createdAt: row.created_at as string,
      // Access was checked by RLS on the query above; the browser gets a URL
      // that proves it on its own, because an <img> cannot send a token.
      url: key
        ? signedLabsUrl(
            `/api/brands/${brandId}/materials/${row.id}/${encodeURIComponent(
              path.posix.basename(key),
            )}?key=${encodeURIComponent(key)}`,
            brandMaterialSignatureToken(brandId, row.id as string, key),
          )
        : null,
    };
  });

  const row = entityResult.data;
  const parentId = (row.parent_brand_id as string | null) ?? null;
  const [parentResult, childrenResult] = await Promise.all([
    parentId
      ? supabase.from("brand_entities").select("id, name").eq("id", parentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("organizations")
      .select("main_brand_id")
      .eq("org_id", row.organization_id as string)
      .maybeSingle(),
  ]);
  const overview: BrandOverview = {
    id: row.id as string,
    name: row.name as string,
    brandKind: (row.brand_kind as string) ?? "",
    brandOrganizationId: (row.organization_id as string) ?? "",
    parent: parentResult.data
      ? { id: parentResult.data.id as string, name: parentResult.data.name as string }
      : null,
    isMain: childrenResult.data?.main_brand_id === brandId,
    website: (row.website as string) ?? "",
    industry: (row.industry as string) ?? "",
    location: (row.location as string) ?? "",
    description: (row.description as string) ?? "",
    updatedAt: row.updated_at as string,
    knowledge: (knowledgeResult.data ?? []).map((k) => ({
      fieldPath: k.field_path as string,
      value: k.value,
      confidence: k.confidence as string,
      decidedAt: k.decided_at as string,
    })),
    claims: latestClaims,
    files,
  };
  return Response.json(
    { overview },
    { headers: { "Cache-Control": "no-store" } },
  );
}