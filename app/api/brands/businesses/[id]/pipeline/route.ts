import { guardBrandRequest } from "@/lib/brand-access";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import {
  brandAssetsPipeline,
  type BrandPipelineInput,
} from "@/lib/pipeline/brand-assets";

/**
 * The brand-asset pipeline for one brand, derived on every request from the
 * rows that actually exist. Nothing about stage state is stored, so this can
 * be re-fetched after any run and will simply tell the truth again.
 *
 * The two extraction layers are already distinguishable in the data without a
 * new table: `url_extraction` is what the deterministic capture read off the
 * page (stage ②), `llm_structuring` is what the model made of it (stage ③).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const brand = await supabase
    .from("brand_entities")
    .select("id, name, website, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (brand.error) {
    return Response.json(
      { error: "ブランドを取得できませんでした" },
      { status: 500 },
    );
  }
  if (!brand.data) {
    return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
  }

  const [claims, values, materials, logos] = await Promise.all([
    supabase
      .from("brand_knowledge_claims")
      .select("field_path, source_kind, observed_at, created_at")
      .eq("brand_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("brand_knowledge_values")
      .select("field_path")
      .eq("brand_id", id),
    supabase
      .from("brand_materials")
      .select("label, kind, created_at")
      .eq("brand_id", id)
      .eq("scope", "brand")
      .order("created_at", { ascending: true }),
    supabase
      .from("logos")
      .select("id, logo_candidates(is_primary, svg, file_path, asset_status)")
      .eq("subject_entity_id", id),
  ]);
  const failed = [claims, values, materials, logos].find(
    (result) => result.error,
  );
  if (failed?.error) {
    return Response.json(
      { error: "パイプラインの状態を読み取れませんでした" },
      { status: 500 },
    );
  }

  const claimRows = claims.data ?? [];
  const website = brand.data.website as string | null;

  const input: BrandPipelineInput = {
    sources: [
      // The site URL is a source like any other: it is the first thing fed in,
      // and later PDFs and guidelines join it in the same list.
      ...(website
        ? [{ label: website, addedAt: null as string | null }]
        : []),
      ...(materials.data ?? []).map((row) => ({
        label: (row.label as string) ?? (row.kind as string),
        addedAt: row.created_at as string | null,
      })),
    ],
    extracted: claimRows
      .filter((row) => row.source_kind === "url_extraction")
      .map((row) => ({
        kind: row.field_path as string,
        observedAt: (row.observed_at ?? row.created_at) as string | null,
      })),
    claims: claimRows.map((row) => ({
      fieldPath: row.field_path as string,
      sourceKind: row.source_kind as string,
      createdAt: row.created_at as string | null,
    })),
    adoptedPaths: (values.data ?? []).map((row) => row.field_path as string),
    logos: (logos.data ?? []).map((row) => {
      const candidates = (row.logo_candidates ?? []) as Array<{
        is_primary: boolean;
        svg: string | null;
        file_path: string | null;
        asset_status: string | null;
      }>;
      const primary = candidates.find((item) => item.is_primary) ?? candidates[0];
      return {
        hasImage: Boolean(primary?.svg || primary?.file_path),
        provisional: primary?.asset_status === "provisional",
      };
    }),
  };

  const pipeline = brandAssetsPipeline(input);

  return Response.json(
    {
      pipeline: {
        stages: pipeline.stages,
        goal: pipeline.goal,
        sources: input.sources,
        // Grouped for the drawer: which fields each layer produced, and
        // whether the value that won is the one a person settled on.
        extractedFields: input.extracted.map((item) => item.kind),
        structuredFields: claimRows
          .filter((row) => row.source_kind !== "url_extraction")
          .map((row) => row.field_path as string),
        adoptedFields: input.adoptedPaths,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
