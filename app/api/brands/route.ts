import { guardBrandRequest } from "@/lib/brand-access";
import { createBrandFromUrl } from "@/lib/brand/create-from-url";
import { importSiteIntoBrand } from "@/lib/brand/import-site";
import { startBrandRun, type BrandRunLog } from "@/lib/brand/runs";
import { normalizePublicHttpUrl } from "@/lib/public-url";
import type {
  BrandAssetSummary,
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
      };
    },
  );

  return Response.json(
    { organizations: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST: make a brand from its site's URL.
//
// The brand (and a workspace, when asked for) exists at once and the answer
// carries its id, so the client goes to the brand's page; the site is read
// into it detached, logging to brand_runs (importSiteIntoBrand). Which
// workspace it goes in is the caller's choice and never inferred: with none
// a new one is made, with one that one, with several the caller must say.
export async function POST(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const supabase = createServerSupabaseForToken(user.token);

  let url: string;
  let organizationId: string | null = null;
  let newWorkspace = false;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      url?: unknown;
      organizationId?: unknown;
      newWorkspace?: unknown;
    };
    if (typeof body.url !== "string" || !body.url.trim()) {
      throw new Error("URLを入力してください");
    }
    url = normalizePublicHttpUrl(body.url.trim()).href;

    if (body.newWorkspace === true) {
      newWorkspace = true;
    } else if (typeof body.organizationId === "string" && body.organizationId.trim()) {
      // The form offers only the caller's workspaces, so a miss is refused.
      const { data: membership, error } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("org_id", body.organizationId.trim())
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !membership) throw new Error("選択したワークスペースを利用できません");
      organizationId = membership.org_id as string;
    } else {
      const { data: memberships, error } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id);
      if (error) throw new Error("ワークスペースを確認できませんでした");
      if (!memberships || memberships.length === 0) newWorkspace = true;
      else if (memberships.length === 1) organizationId = memberships[0].org_id as string;
      else throw new Error("ブランドを入れるワークスペースを選んでください");
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "リクエストが不正です" },
      { status: 400 },
    );
  }

  let created: Awaited<ReturnType<typeof createBrandFromUrl>>;
  let log: BrandRunLog;
  try {
    created = await createBrandFromUrl(supabase, user.id, {
      url,
      organizationId: newWorkspace ? null : organizationId,
    });
    log = await startBrandRun(supabase, { brandId: created.brandId, userId: user.id });
  } catch (error) {
    console.error("Brand creation failed:", error);
    return Response.json({ error: "ブランドを作成できませんでした" }, { status: 500 });
  }

  void importSiteIntoBrand({
    supabase,
    userId: user.id,
    brandId: created.brandId,
    url,
    log,
    identify: { provisionalWorkspaceName: created.provisionalWorkspaceName },
  }).catch(async (error) => {
    console.error("Site import failed:", error);
    await log.fail(error instanceof Error ? error.message : "サイトを読み取れませんでした");
  });

  return Response.json(
    { brandId: created.brandId, organizationId: created.organizationId, runId: log.id },
    { status: 202 },
  );
}
