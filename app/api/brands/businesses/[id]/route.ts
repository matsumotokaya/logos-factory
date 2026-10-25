import { guardBrandRequest } from "@/lib/brand-access";
import type { BusinessDetail, BusinessUpdate } from "@/lib/brand-detail";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import { knowledgeProfilesByBrand } from "@/lib/brand/knowledge";
import {
  parseBrandImport,
  saveBrandAssetsFromUrl,
} from "@/lib/brand/import-assets";
import {
  LOGO_PREVIEW_COLUMNS,
  logoPreviewUrl,
  type LogoPreviewCandidate,
} from "@/lib/brand/logo-preview";
import { listTakeAssetsByBrand } from "@/lib/takes/read-model";

const MANAGER_ROLES = ["owner", "admin", "editor"];

function text(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${name}が不正です`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${name}が長すぎます`);
  return normalized;
}

function website(value: unknown): string {
  const normalized = text(value, "WebサイトURL", 2048);
  if (!normalized) return "";
  const candidate = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("WebサイトURLはhttp/httpsで入力してください");
  }
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

/** A workspace (v3 §19.2). RLS already limits these to the caller's own. */
type OrganizationRow = { org_id: string; name: string };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const entityResult = await supabase
    .from("brand_entities")
    .select(
      "id, name, organization_id, brand_kind, parent_brand_id, website, industry, location, description, status, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (entityResult.error) {
    return Response.json({ error: "事業を取得できませんでした" }, { status: 500 });
  }
  if (!entityResult.data) {
    return Response.json({ error: "事業が見つかりません" }, { status: 404 });
  }

  const parentId = entityResult.data.organization_id as string | null;
  if (!parentId) {
    return Response.json(
      { error: "このブランドにはワークスペースが設定されていません" },
      { status: 409 },
    );
  }

  const [
    knowledgeResult,
    logosResult,
    takeAssetsResult,
    audiencesResult,
    organizationsResult,
    membershipsResult,
  ] = await Promise.all([
    knowledgeProfilesByBrand(supabase, [id]),
    supabase
      .from("logos")
      .select(
        `id, title, role, visibility, logo_candidates(${LOGO_PREVIEW_COLUMNS})`,
      )
      .eq("subject_entity_id", id)
      .order("created_at", { ascending: true }),
    listTakeAssetsByBrand(supabase, [id]),
    supabase
      .from("brand_entities")
      .select("id, name, status")
      .eq("parent_brand_id", id)
      .eq("brand_kind", "audience")
      .order("created_at", { ascending: true }),
    supabase
      .from("organizations")
      .select("org_id, name")
      .order("created_at", { ascending: true }),
    supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .in("role", MANAGER_ROLES),
  ]);

  const relatedError =
    knowledgeResult.error ??
    logosResult.error ??
    takeAssetsResult.error ??
    audiencesResult.error ??
    organizationsResult.error ??
    membershipsResult.error;
  if (relatedError) {
    return Response.json({ error: "事業に関連する情報を取得できませんでした" }, { status: 500 });
  }

  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const parent = organizations.find((organization) => organization.org_id === parentId);
  if (!parent) {
    return Response.json(
      { error: "所属するワークスペースを取得できませんでした" },
      { status: 409 },
    );
  }
  // Only workspaces the caller manages could receive a brand. Moving between
  // workspaces is not implemented yet, so this list is informational.
  const managedWorkspaceIds = new Set(
    (membershipsResult.data ?? []).map((membership) => membership.org_id as string),
  );
  const availableOrganizations = organizations
    .filter((organization) => managedWorkspaceIds.has(organization.org_id))
    .map((organization) => ({
      id: organization.org_id,
      name: organization.name,
      status: "confirmed" as BusinessDetail["status"],
    }));
  if (!availableOrganizations.some((organization) => organization.id === parent.org_id)) {
    availableOrganizations.unshift({
      id: parent.org_id,
      name: parent.name,
      status: "confirmed",
    });
  }

  const row = entityResult.data;
  const knowledgeProfile = knowledgeResult.data.get(id) ?? {};
  const detail: BusinessDetail = {
    id: row.id as string,
    kind: row.brand_kind as BusinessDetail["kind"],
    name: row.name as string,
    website: (row.website as string) ?? "",
    industry: (row.industry as string) ?? "",
    location: (row.location as string) ?? "",
    description: (row.description as string) ?? "",
    status: row.status as BusinessDetail["status"],
    updatedAt: row.updated_at as string,
    parentOrganization: { id: parent.org_id, name: parent.name },
    profile: Object.keys(knowledgeProfile).length > 0
      ? {
          inheritsParent: true,
          status: "confirmed",
          value: knowledgeProfile,
        }
      : null,
    logos: await Promise.all(
      (logosResult.data ?? []).map(async (logo) => ({
        id: logo.id as string,
        title: logo.title as string,
        role: logo.role as string,
        visibility: logo.visibility as string,
        previewUrl: await logoPreviewUrl(
          (logo.logo_candidates ?? []) as LogoPreviewCandidate[],
        ),
      })),
    ),
    campaigns: (takeAssetsResult.data.get(id) ?? [])
        .filter((asset) => asset.kind === "lp")
        .map((asset) => ({
          id: asset.id,
          jobId: asset.jobId,
          name: asset.title.replace(/\s+LP$/, ""),
          status: asset.status,
          createdAt: asset.createdAt,
        })),
    audiences: (audiencesResult.data ?? []) as BusinessDetail["audiences"],
    availableOrganizations,
  };

  return Response.json({ business: detail }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  try {
    const body = (await req.json()) as Partial<BusinessUpdate> & {
      brandImport?: unknown;
    };
    // The capture that produced the name also produced the palette, the design
    // tokens and the logo. This screen used to keep the three text fields and
    // drop the rest, which is why a brand could sit here with a full set of
    // knowledge claims and no logo to show for it.
    const importedBrand = parseBrandImport(body.brandImport);
    const name = text(body.name, "事業名", 160);
    if (!name) throw new Error("事業名を入力してください");
    const current = await supabase
      .from("brand_entities")
      .select("organization_id, brand_kind, parent_brand_id, provenance")
      .eq("id", id)
      .maybeSingle();
    if (current.error) throw new Error("ブランドを確認できませんでした");
    if (!current.data) {
      return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const fields = ["name", "website", "industry", "location", "description"];
    // A brand stays in the workspace it was created in, and its place in the
    // tree is set by dragging it (parent_brand_id), not by this form. v2 moved
    // brands between real-world organizations here and reparented them onto a
    // corporate brand; neither entity exists in v3.
    const provenance = {
      ...((current.data.provenance as Record<string, unknown> | null) ?? {}),
      ...Object.fromEntries(
        fields.map((field) => [
          field,
          { source: "user_confirmed", confirmed_at: now, confirmed_by: user.id },
        ]),
      ),
    };

    const updated = await supabase
      .from("brand_entities")
      .update({
        name,
        website: website(body.website),
        industry: text(body.industry, "業種", 160),
        location: text(body.location, "所在地", 240),
        description: text(body.description, "説明", 4000),
        status: "confirmed",
        source_kind: "manual",
        provenance,
        updated_at: now,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (updated.error) throw new Error("ブランドを保存できませんでした");
    if (!updated.data) throw new Error("このブランドを編集する権限がありません");

    // Assets are applied after the entity update so a rejected edit never
    // leaves a refreshed logo attached to stale brand facts.
    const savedBrand = importedBrand
      ? await saveBrandAssetsFromUrl({
          supabase,
          userId: user.id,
          brandId: id,
          brandName: name,
          role: current.data.brand_kind === "corporate" ? "corporate" : "service",
          sourceUrl: website(body.website),
          value: importedBrand,
        })
      : null;

    return Response.json(
      {
        ok: true,
        parentChanged: false,
        profile: savedBrand?.profile ?? null,
        logo: savedBrand?.logo ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "入力内容が不正です" },
      { status: 400 },
    );
  }
}

// Removing one Brand.
//
// Postgres already refuses this while takes, works or materials point at the
// brand (`on delete restrict`), and that refusal is the design: a brand is not
// a folder you can throw away with its contents inside. What Postgres would
// *not* stop is the quiet damage — `logos.subject_entity_id` and
// `brand_entities.parent_brand_id` are `on delete set null`, so deleting a brand
// that still owns a logo or has a child brand would leave them alive and
// unreachable from any tree. Both are checked here, in front of the FK, so the
// answer is one sentence about what to do rather than a constraint name.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  try {
    const brand = await supabase
      .from("brand_entities")
      .select("id, name, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (brand.error) throw new Error("ブランドを確認できませんでした");
    if (!brand.data) {
      return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
    }

    const [takes, materials, logos, children] = await Promise.all([
      supabase.from("takes").select("id", { count: "exact", head: true }).eq("brand_id", id),
      supabase
        .from("brand_materials")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", id),
      supabase
        .from("logos")
        .select("id", { count: "exact", head: true })
        .eq("subject_entity_id", id),
      supabase
        .from("brand_entities")
        .select("id", { count: "exact", head: true })
        .eq("parent_brand_id", id),
    ]);
    const countError =
      takes.error ?? materials.error ?? logos.error ?? children.error;
    if (countError) throw new Error("関連データを確認できませんでした");

    const blocking: string[] = [];
    if ((logos.count ?? 0) > 0) blocking.push(`ロゴ${logos.count}件`);
    if ((takes.count ?? 0) > 0) blocking.push(`動画・LP${takes.count}件`);
    if ((materials.count ?? 0) > 0) blocking.push(`素材${materials.count}件`);
    if ((children.count ?? 0) > 0) blocking.push(`子ブランド${children.count}件`);
    if (blocking.length > 0) {
      return Response.json(
        {
          error: `${blocking.join("・")}が残っているため削除できません。先に削除または移動してください`,
        },
        { status: 409 },
      );
    }

    const deleted = await supabase
      .from("brand_entities")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (deleted.error) throw new Error("ブランドを削除できませんでした");
    if (!deleted.data) {
      return Response.json(
        { error: "このブランドを削除する権限がありません" },
        { status: 403 },
      );
    }

    return Response.json(
      { ok: true, organizationId: brand.data.organization_id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "削除できませんでした" },
      { status: 500 },
    );
  }
}
