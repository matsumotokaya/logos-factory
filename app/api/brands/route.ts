import { guardBrandRequest } from "@/lib/brand-access";
import type {
  BrandAssetSummary,
  BrandCampaignSummary,
  BrandLogoSummary,
  BrandOrganizationSummary,
  BrandRecordStatus,
  BrandSummary,
} from "@/lib/brand-hierarchy";
import { listTakeAssetsByBrand } from "@/lib/takes/read-model";
import { knowledgeProfilesByBrand, mergeProfile } from "@/lib/brand/knowledge";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";

// The workspace, not a scraped company (v3 §19.2): public.organizations is the
// tenant boundary, so it carries membership and a name — not a legal identity.
type OrganizationRow = {
  org_id: string;
  name: string;
  website: string | null;
  description: string | null;
};

type BrandRow = {
  id: string;
  organization_id: string;
  parent_brand_id: string | null;
  brand_kind: BrandSummary["kind"];
  name: string;
  website: string;
  industry: string;
  description: string;
  status: BrandRecordStatus;
};

type LogoRow = {
  id: string;
  subject_entity_id: string;
  title: string;
  role: string;
  visibility: string;
};

function paletteFrom(value: Record<string, unknown>): {
  primary: string | null;
  accent: string | null;
  fontStyle: string | null;
} {
  const palette = value.palette;
  if (!palette || typeof palette !== "object") {
    return { primary: null, accent: null, fontStyle: null };
  }
  const row = palette as Record<string, unknown>;
  return {
    primary: typeof row.primary === "string" ? row.primary : null,
    accent: typeof row.accent === "string" ? row.accent : null,
    fontStyle: typeof row.font_style === "string" ? row.font_style : null,
  };
}

function campaignStatus(
  status: BrandAssetSummary["status"],
): BrandCampaignSummary["status"] {
  if (status === "pending") return "running";
  if (status === "failed") return "failed";
  if (status === "archived") return "archived";
  return "draft";
}

export async function GET(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const supabase = createServerSupabaseForToken(user.token);

  // RLS returns only the workspaces this user belongs to.
  const organizationResult = await supabase
    .from("organizations")
    .select("org_id, name, website, description")
    .order("created_at", { ascending: true });
  if (organizationResult.error) {
    return Response.json(
      { error: "Organizationを取得できませんでした" },
      { status: 500 },
    );
  }

  const organizations = (organizationResult.data ?? []) as OrganizationRow[];
  if (organizations.length === 0) {
    return Response.json(
      { organizations: [] satisfies BrandOrganizationSummary[] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const organizationIds = organizations.map((organization) => organization.org_id);
  const brandResult = await supabase
    .from("brand_entities")
    .select(
      "id, organization_id, parent_brand_id, brand_kind, name, website, industry, description, status",
    )
    .in("organization_id", organizationIds)
    // Newest first: the left pane is a work surface, so what was just
    // registered has to be at the top instead of scrolling off the bottom.
    .order("created_at", { ascending: false });
  if (brandResult.error) {
    return Response.json(
      { error: "ブランドを取得できませんでした" },
      { status: 500 },
    );
  }

  const brands = (brandResult.data ?? []) as BrandRow[];
  const brandIds = brands.map((brand) => brand.id);
  if (brandIds.length === 0) {
    return Response.json(
      {
        organizations: organizations.map(
          (organization): BrandOrganizationSummary => ({
            id: organization.org_id,
            name: organization.name,
            organizationKind: null,
            website: organization.website ?? "",
            description: organization.description ?? "",
            status: "confirmed",
            logos: [],
            brands: [],
            businesses: [],
          }),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [knowledgeResult, logoResult, takeAssetResult] = await Promise.all([
    knowledgeProfilesByBrand(supabase, brandIds),
    supabase
      .from("logos")
      .select("id, subject_entity_id, title, role, visibility")
      .in("subject_entity_id", brandIds),
    listTakeAssetsByBrand(supabase, brandIds),
  ]);
  const relatedError =
    knowledgeResult.error ??
    logoResult.error ??
    takeAssetResult.error;
  if (relatedError) {
    return Response.json(
      { error: "ブランド関連データを取得できませんでした" },
      { status: 500 },
    );
  }

  const profiles = knowledgeResult.data;
  const logos = new Map<string, LogoRow[]>();
  for (const row of (logoResult.data ?? []) as LogoRow[]) {
    const current = logos.get(row.subject_entity_id) ?? [];
    current.push(row);
    logos.set(row.subject_entity_id, current);
  }
  const assets = takeAssetResult.data;

  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const availableLogos = (brand: BrandRow): BrandLogoSummary[] => {
    const items: BrandLogoSummary[] = [];
    const seen = new Set<string>();
    let current: BrandRow | undefined = brand;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      for (const logo of logos.get(current.id) ?? []) {
        if (seen.has(logo.id)) continue;
        seen.add(logo.id);
        items.push({
          id: logo.id,
          title: logo.title,
          role: logo.role,
          visibility: logo.visibility,
          subjectEntityId: current.id,
          subjectEntityName: current.name,
          inherited: current.id !== brand.id,
        });
      }
      visited.add(current.id);
      current = current.parent_brand_id
        ? brandById.get(current.parent_brand_id)
        : undefined;
    }
    return items;
  };
  const resolvedProfile = (brand: BrandRow): Record<string, unknown> => {
    const chain: BrandRow[] = [];
    let current: BrandRow | undefined = brand;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      chain.unshift(current);
      visited.add(current.id);
      current = current.parent_brand_id
        ? brandById.get(current.parent_brand_id)
        : undefined;
    }
    let resolved: Record<string, unknown> = {};
    for (const member of chain) {
      const profile = profiles.get(member.id);
      if (!profile) continue;
      resolved = mergeProfile(resolved, profile);
    }
    return resolved;
  };

  const summariesByOrganization = new Map<string, BrandSummary[]>();
  for (const brand of brands) {
    const profile = paletteFrom(resolvedProfile(brand));
    const resolvedLogos = availableLogos(brand);
    const brandAssets = assets.get(brand.id) ?? [];
    const videosByJob = new Map(
      brandAssets
        .filter((asset) => asset.kind === "video" && asset.jobId)
        .map((asset) => [asset.jobId!, asset]),
    );
    const campaigns: BrandCampaignSummary[] = brandAssets
      .filter((asset) => asset.kind === "lp" && asset.jobId)
      .map((asset) => {
        const jobId = asset.jobId!;
        const video = videosByJob.get(jobId);
        return {
          id: asset.id,
          jobId,
          name: asset.title.replace(/\s+LP$/, ""),
          status: campaignStatus(asset.status),
          logoId: resolvedLogos[0]?.id ?? null,
          primary: profile.primary,
          accent: profile.accent,
          createdAt: asset.createdAt,
          lpUrl: asset.publicPath ?? `/brands/${brand.id}/lp/${asset.id}`,
          videoStatus:
            video?.status === "ready"
              ? "mp4_ready"
              : video
                ? "preview_ready"
                : "not_created",
        };
      });
    const summary: BrandSummary = {
      id: brand.id,
      organizationId: brand.organization_id,
      parentBrandId: brand.parent_brand_id,
      kind: brand.brand_kind,
      isPrimary: false,
      name: brand.name,
      website: brand.website,
      industry: brand.industry,
      description: brand.description,
      status: brand.status,
      primary: profile.primary,
      accent: profile.accent,
      fontStyle: profile.fontStyle,
      logos: resolvedLogos,
      logoIds: resolvedLogos.map((logo) => logo.id),
      assets: brandAssets,
      campaigns,
    };
    const current = summariesByOrganization.get(brand.organization_id) ?? [];
    current.push(summary);
    summariesByOrganization.set(brand.organization_id, current);
  }

  const result = organizations.map(
    (organization): BrandOrganizationSummary => {
      const organizationBrands =
        summariesByOrganization.get(organization.org_id) ?? [];
      // A workspace has no logo of its own; the tree shows the logos of the
      // brands inside it. (v2 lifted the primary corporate brand's logos here.)
      return {
        id: organization.org_id,
        name: organization.name,
        organizationKind: null,
        website: organization.website ?? "",
        description: organization.description ?? "",
        status: "confirmed" as BrandRecordStatus,
        logos: [],
        brands: organizationBrands,
        businesses: organizationBrands.filter(
          (brand) => brand.kind !== "corporate",
        ),
      };
    },
  );

  return Response.json(
    { organizations: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
