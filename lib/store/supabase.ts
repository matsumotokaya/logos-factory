// Supabase implementation of BrandRepo (schema: supabase/migrations/).
// Client-side only, like LocalStorageRepo: every method ensures an auth
// session first — guests get an anonymous session (docs/account-design.md §1),
// which later upgrades to a permanent account with the same user_id.

import { ensureSession, supabase } from "@/lib/supabase/client";
import type { LogoData } from "@/lib/svg";
import {
  emptyPresentation,
  emptyAssetRegistry,
  type AssetRun,
  type AssetRunStatus,
  type BrandEntity,
  type BrandEntityDraft,
  type BrandRepo,
  type Company,
  type GeneratedMockups,
  type InventoryItem,
  type LogoActivityAction,
  type LogoAccessRole,
  type LogoAssetRegistry,
  type LogoLockup,
  type LogoPatch,
  type LogoPresentation,
  type LogoVariantAsset,
  normalizePresentation,
  type Order,
  type StoredLogo,
} from "./types";
import { SEED_INVENTORY } from "./local";

// ---------------------------------------------------------------------------
// Row ↔ app-type mapping

type LogoRow = {
  id: string;
  title: string;
  role: StoredLogo["role"];
  logo_type: StoredLogo["logoType"];
  parent_logo_id: string | null;
  visibility: StoredLogo["visibility"];
  owner_user_id: string | null;
  owner_org_id: string | null;
  allow_contact: boolean;
  slug: string | null;
  created_at: string;
  updated_at: string;
  logo_candidates: {
    id: string;
    is_primary: boolean;
    svg: string;
    analysis: Omit<LogoData, "svg"> | null;
  }[];
  logo_credits: { id: string; role: string; name: string; contact: string }[];
  logo_trademarks: {
    id: string;
    status: string;
    jurisdiction: string;
    registration_no: string;
    trademark_type: string | null;
    nice_classes: number[];
    goods_services: string;
  }[];
  logo_activities: { id: string; action: string; created_at: string }[];
  logo_tags: { tags: { name: string } | null }[];
};

type BrandEntityRow = {
  id: string;
  name: string;
  brand_kind: string;
  parent_brand_id: string | null;
  website: string;
  industry: string;
  location: string;
  description: string;
};

type LogoLockupRow = {
  id: string;
  candidate_id: string;
  kind: string;
  label: string;
  is_primary: boolean;
  sort_order: number;
};

type LogoVariantRow = {
  id: string;
  lockup_id: string;
  kind: string;
  source: string;
  colorway: string;
  label: string;
  sort_order: number;
};

type EffectiveLogoGrant = {
  role: LogoAccessRole;
  canEditDetails: boolean;
  canEditPresentation: boolean;
};

const LOGO_SELECT = `
  id, title, role, logo_type, parent_logo_id, visibility, owner_user_id, owner_org_id, allow_contact, slug, created_at, updated_at,
  logo_candidates ( id, is_primary, svg, analysis ),
  logo_credits ( id, role, name, contact ),
  logo_trademarks ( id, status, jurisdiction, registration_no, trademark_type, nice_classes, goods_services ),
  logo_activities ( id, action, created_at ),
  logo_tags ( tags ( name ) )
`;

// Roles that may edit an org's logos.
const EDIT_ROLES = new Set(["owner", "admin", "editor"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

function rowToStoredLogo(
  row: LogoRow,
  currentUserId: string | null,
  orgRoles: Map<string, string>,
  logoGrants: Map<string, EffectiveLogoGrant>,
): StoredLogo | null {
  const primary =
    row.logo_candidates.find((c) => c.is_primary) ?? row.logo_candidates[0];
  if (!primary) return null; // defensive: a logo without a master file
  const data = { ...(primary.analysis ?? {}), svg: primary.svg } as LogoData;
  // UI gate only — writes are also enforced by RLS server-side.
  const canAdmin =
    (row.owner_user_id !== null && row.owner_user_id === currentUserId) ||
    (row.owner_org_id !== null &&
      ADMIN_ROLES.has(orgRoles.get(row.owner_org_id) ?? ""));
  const grant = logoGrants.get(row.id);
  const canEdit =
    canAdmin ||
    (row.owner_org_id !== null &&
      EDIT_ROLES.has(orgRoles.get(row.owner_org_id) ?? "")) ||
    Boolean(grant?.canEditDetails);
  const canEditPresentation =
    canEdit || Boolean(grant?.canEditPresentation);
  return {
    id: row.id,
    title: row.title,
    role: row.role,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    logoType: row.logo_type,
    parentId: row.parent_logo_id,
    visibility: row.visibility,
    allowContact: row.allow_contact,
    slug: row.slug,
    canEdit,
    canEditPresentation,
    canAdmin,
    accessRole: grant?.role ?? null,
    ownerOrgId: row.owner_org_id,
    credits: row.logo_credits.map((c) => ({
      id: c.id,
      role: c.role as StoredLogo["credits"][number]["role"],
      name: c.name,
      contact: c.contact,
    })),
    trademarks: row.logo_trademarks.map((t) => ({
      id: t.id,
      status: t.status as StoredLogo["trademarks"][number]["status"],
      jurisdiction: t.jurisdiction,
      registrationNo: t.registration_no,
      trademarkType:
        t.trademark_type as StoredLogo["trademarks"][number]["trademarkType"],
      niceClasses: t.nice_classes,
      goodsServices: t.goods_services,
    })),
    activities: [...row.logo_activities]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => ({
        id: a.id,
        action: a.action as LogoActivityAction,
        at: a.created_at,
      })),
    tags: row.logo_tags.flatMap((lt) => (lt.tags ? [lt.tags.name] : [])),
    primaryCandidateId: primary.id,
  };
}

function mapBrandEntity(row: BrandEntityRow): BrandEntity {
  return {
    id: row.id,
    name: row.name,
    entityType: row.brand_kind as BrandEntity["entityType"],
    parentId: row.parent_brand_id,
    website: row.website,
    industry: row.industry,
    location: row.location,
    description: row.description,
  };
}

function mapLogoVariant(row: LogoVariantRow): LogoVariantAsset {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source as LogoVariantAsset["source"],
    colorway: row.colorway as LogoVariantAsset["colorway"],
    label: row.label,
    sortOrder: row.sort_order,
  };
}

function splitLogoData(data: LogoData): {
  svg: string;
  analysis: Omit<LogoData, "svg">;
} {
  const { svg, ...analysis } = data;
  return { svg, analysis };
}

function throwOn(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseRepo implements BrandRepo {
  private async authToken(): Promise<string> {
    await this.ensureAuth();
    const { data, error } = await supabase.auth.getSession();
    throwOn(error);
    const token = data.session?.access_token;
    if (!token) throw new Error("No Supabase access token.");
    return token;
  }

  private async mockupRequest(
    input: string,
    init?: RequestInit
  ): Promise<Response> {
    const token = await this.authToken();
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  /** Resolve the current user id, signing in anonymously on first contact. */
  private async ensureAuth(): Promise<string> {
    const id = await ensureSession();
    if (!id) throw new Error("No Supabase session.");
    return id;
  }

  async getLatestAssetRun(
    candidateId: string,
    assetDefinitionId: string
  ): Promise<AssetRun | null> {
    await this.ensureAuth();
    const { data, error } = await supabase
      .from("logo_asset_runs")
      .select(
        "id, asset_definition_id, status, params, error_message, queued_at, started_at, finished_at"
      )
      .eq("candidate_id", candidateId)
      .eq("asset_definition_id", assetDefinitionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOn(error);
    if (!data) return null;
    return {
      id: data.id as string,
      assetDefinitionId: data.asset_definition_id as string,
      status: data.status as AssetRunStatus,
      params: (data.params ?? {}) as Record<string, unknown>,
      errorMessage: (data.error_message as string | null) ?? null,
      queuedAt: data.queued_at as string,
      startedAt: (data.started_at as string | null) ?? null,
      finishedAt: (data.finished_at as string | null) ?? null,
    };
  }

  async queueAssetRun(
    candidateId: string,
    assetDefinitionId: string,
    params: Record<string, unknown> = {}
  ): Promise<AssetRun> {
    const res = await this.mockupRequest("/api/labs/workflow/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, assetDefinitionId, params }),
    });
    const body = (await res.json().catch(() => null)) as
      | { run?: AssetRun; error?: string }
      | null;
    if (!res.ok || !body?.run) {
      throw new Error(body?.error || "レンダーをキューへ登録できませんでした。");
    }
    return body.run;
  }

  /**
   * The user's workspace, created on first use. Company profile, inventory and
   * orders hang off it.
   *
   * Resolved by ensure_my_workspace, the same RPC brand registration uses. A
   * select-then-insert here had no lock, and /brand calls this from three
   * requests at once — a new user got two or three empty workspaces.
   */
  private async ensureOrg(): Promise<string> {
    await this.ensureAuth();
    const { data, error } = await supabase.rpc("ensure_my_workspace");
    throwOn(error);
    if (!data) throw new Error("ワークスペースを解決できませんでした");
    return data as string;
  }

  /** Map of org_id → my role, for org-owned logo access decisions. */
  private async myOrgRoles(): Promise<Map<string, string>> {
    const uid = await this.ensureAuth();
    const { data, error } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", uid);
    throwOn(error);
    return new Map((data ?? []).map((m) => [m.org_id as string, m.role as string]));
  }

  /** Effective logo-scoped grants for me, including grants to my orgs. */
  private async myLogoGrants(
    uid: string,
    orgRoles: Map<string, string>,
  ): Promise<Map<string, EffectiveLogoGrant>> {
    const orgIds = [...orgRoles.keys()];
    const filter =
      `grantee_user_id.eq.${uid}` +
      (orgIds.length ? `,grantee_org_id.in.(${orgIds.join(",")})` : "");
    const { data, error } = await supabase
      .from("logo_access_grants")
      .select("logo_id, grantee_user_id, grantee_org_id, role")
      .or(filter);
    // Keep owned-logo flows available during a migration-first deployment.
    if (error?.code === "42P01" || error?.code === "PGRST205") return new Map();
    throwOn(error);

    const priority: Record<LogoAccessRole, number> = {
      viewer: 0,
      editor: 1,
      manager: 2,
    };
    const grants = new Map<string, EffectiveLogoGrant>();
    for (const row of data ?? []) {
      const role = row.role as LogoAccessRole;
      const isDirect = row.grantee_user_id === uid;
      const orgRole = row.grantee_org_id
        ? orgRoles.get(row.grantee_org_id as string)
        : null;
      const granteeCanEdit = isDirect || EDIT_ROLES.has(orgRole ?? "");
      const canEditDetails = role === "manager" && granteeCanEdit;
      const canEditPresentation = role !== "viewer" && granteeCanEdit;
      const current = grants.get(row.logo_id as string);
      if (!current || priority[role] > priority[current.role]) {
        grants.set(row.logo_id as string, {
          role,
          canEditDetails,
          canEditPresentation,
        });
      } else if (
        (canEditDetails && !current.canEditDetails) ||
        (canEditPresentation && !current.canEditPresentation)
      ) {
        grants.set(row.logo_id as string, {
          ...current,
          canEditDetails: current.canEditDetails || canEditDetails,
          canEditPresentation:
            current.canEditPresentation || canEditPresentation,
        });
      }
    }
    return grants;
  }

  private async logActivity(
    logoId: string,
    action: LogoActivityAction
  ): Promise<void> {
    const uid = await this.ensureAuth();
    await supabase
      .from("logo_activities")
      .insert({ logo_id: logoId, user_id: uid, action });
  }

  // ---------- company (organization profile) ----------

  async getCompany(): Promise<Company> {
    const orgId = await this.ensureOrg();
    const { data, error } = await supabase
      .from("organizations")
      .select("name, description, website, industry, location")
      .eq("org_id", orgId)
      .single();
    throwOn(error);
    return {
      name: data!.name ?? "",
      description: data!.description ?? "",
      website: data!.website ?? "",
      industry: data!.industry ?? "",
      location: data!.location ?? "",
    };
  }

  async saveCompany(company: Company): Promise<void> {
    const orgId = await this.ensureOrg();
    const { error } = await supabase
      .from("organizations")
      .update(company)
      .eq("org_id", orgId);
    throwOn(error);
  }

  // ---------- logos ----------

  async listLogos(): Promise<StoredLogo[]> {
    const uid = await this.ensureAuth();
    const roles = await this.myOrgRoles();
    const grants = await this.myLogoGrants(uid, roles);
    // My logos: owned by me personally, or owned by an org I belong to. RLS also
    // grants SELECT on every unlisted/public logo (for permalinks and the future
    // public directory), so without this filter the personal gallery and admin
    // would show other people's logos.
    const orgIds = [...roles.keys()];
    const grantIds = [...grants.keys()];
    const orFilter =
      `owner_user_id.eq.${uid}` +
      (orgIds.length ? `,owner_org_id.in.(${orgIds.join(",")})` : "") +
      (grantIds.length ? `,id.in.(${grantIds.join(",")})` : "");
    const { data, error } = await supabase
      .from("logos")
      .select(LOGO_SELECT)
      .or(orFilter)
      .order("created_at", { ascending: false });
    throwOn(error);
    return (data as unknown as LogoRow[]).flatMap((row) => {
      const logo = rowToStoredLogo(row, uid, roles, grants);
      return logo ? [logo] : [];
    });
  }

  async listPublicLogos(): Promise<StoredLogo[]> {
    // The public directory (logo 図鑑) feed: every logo published as "public",
    // regardless of owner. RLS grants SELECT on public logos to everyone.
    const uid = await this.ensureAuth();
    const roles = await this.myOrgRoles();
    const grants = await this.myLogoGrants(uid, roles);
    const { data, error } = await supabase
      .from("logos")
      .select(LOGO_SELECT)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(48);
    throwOn(error);
    return (data as unknown as LogoRow[]).flatMap((row) => {
      const logo = rowToStoredLogo(row, uid, roles, grants);
      return logo ? [logo] : [];
    });
  }

  async getLogo(id: string): Promise<StoredLogo | null> {
    const uid = await this.ensureAuth();
    const roles = await this.myOrgRoles();
    const grants = await this.myLogoGrants(uid, roles);
    const { data, error } = await supabase
      .from("logos")
      .select(LOGO_SELECT)
      .eq("id", id)
      .maybeSingle();
    throwOn(error);
    return data
      ? rowToStoredLogo(data as unknown as LogoRow, uid, roles, grants)
      : null;
  }

  async saveLogo(logo: StoredLogo): Promise<void> {
    await this.ensureAuth();
    const { svg, analysis } = splitLogoData(logo.data);
    const { error } = await supabase.rpc("create_logo_with_presentation", {
      p_logo_id: logo.id,
      p_title: logo.title,
      p_role: logo.role,
      p_visibility: logo.visibility,
      p_svg: svg,
      p_analysis: analysis,
    });
    throwOn(error);
  }

  async updateLogo(id: string, patch: LogoPatch): Promise<void> {
    const uid = await this.ensureAuth();

    const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: uid };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.role !== undefined) row.role = patch.role;
    if (patch.logoType !== undefined) row.logo_type = patch.logoType;
    if (patch.parentId !== undefined) row.parent_logo_id = patch.parentId;
    if (patch.allowContact !== undefined) row.allow_contact = patch.allowContact;
    if (patch.slug !== undefined) row.slug = patch.slug || null;

    let action: LogoActivityAction = "info_updated";
    if (patch.visibility !== undefined) {
      row.visibility = patch.visibility;
      action = "visibility_changed";
    }
    const { error } = await supabase.from("logos").update(row).eq("id", id);
    throwOn(error);

    // Credits / trademarks / tags are replaced as whole sets — same semantics
    // as the localStorage implementation.
    if (patch.credits !== undefined) {
      throwOn((await supabase.from("logo_credits").delete().eq("logo_id", id)).error);
      if (patch.credits.length > 0) {
        throwOn(
          (
            await supabase.from("logo_credits").insert(
              patch.credits.map((c) => ({
                logo_id: id,
                role: c.role,
                name: c.name,
                contact: c.contact,
              }))
            )
          ).error
        );
      }
    }
    if (patch.trademarks !== undefined) {
      throwOn((await supabase.from("logo_trademarks").delete().eq("logo_id", id)).error);
      if (patch.trademarks.length > 0) {
        throwOn(
          (
            await supabase.from("logo_trademarks").insert(
              patch.trademarks.map((t) => ({
                logo_id: id,
                status: t.status,
                jurisdiction: t.jurisdiction,
                registration_no: t.registrationNo,
                trademark_type: t.trademarkType,
                nice_classes: t.niceClasses,
                goods_services: t.goodsServices,
              }))
            )
          ).error
        );
      }
    }
    if (patch.tags !== undefined) {
      const normalizedNames = patch.tags
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (normalizedNames.some((name) => name.length > 48)) {
        throw new Error("タグは48文字以内で入力してください。");
      }
      const names = [...new Set(normalizedNames)];
      throwOn((await supabase.from("logo_tags").delete().eq("logo_id", id)).error);
      if (names.length > 0) {
        const { data: tagRows, error: tagErr } = await supabase
          .from("tags")
          .upsert(names.map((name) => ({ name })), { onConflict: "name" })
          .select("id, name");
        throwOn(tagErr);
        throwOn(
          (
            await supabase
              .from("logo_tags")
              .insert(tagRows!.map((t) => ({ logo_id: id, tag_id: t.id })))
          ).error
        );
      }
    }

    await this.logActivity(id, action);
  }

  async replaceLogoData(id: string, data: LogoData): Promise<void> {
    await this.ensureAuth();
    const { data: primary, error: primaryErr } = await supabase
      .from("logo_candidates")
      .select("id")
      .eq("logo_id", id)
      .eq("is_primary", true)
      .single();
    throwOn(primaryErr);
    if (primary?.id) {
      const res = await this.mockupRequest(`/api/mockups/${id}/${primary.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Failed to purge mockups.");
      }
    }
    const { svg, analysis } = splitLogoData(data);
    const { error } = await supabase
      .from("logo_candidates")
      .update({ svg, analysis, updated_at: new Date().toISOString() })
      .eq("logo_id", id)
      .eq("is_primary", true);
    throwOn(error);
    await this.logActivity(id, "file_updated");
  }

  async deleteLogo(id: string): Promise<void> {
    await this.ensureAuth();
    const { data: candidates, error: candErr } = await supabase
      .from("logo_candidates")
      .select("id")
      .eq("logo_id", id);
    throwOn(candErr);
    for (const candidate of candidates ?? []) {
      const res = await this.mockupRequest(`/api/mockups/${id}/${candidate.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Failed to purge mockups.");
      }
    }
    // The canonical presentation Take must disappear with the logo; doing both
    // in one RPC avoids leaving an unreachable Take or a dangling /p slot.
    const { error } = await supabase.rpc("delete_logo_with_presentation", {
      p_logo_id: id,
    });
    throwOn(error);
  }

  async getAssetRegistry(logoId: string): Promise<LogoAssetRegistry> {
    await this.ensureAuth();
    const { data: logoRow, error: logoErr } = await supabase
      .from("logos")
      .select("subject_entity_id")
      .eq("id", logoId)
      .maybeSingle();
    throwOn(logoErr);
    if (!logoRow) return emptyAssetRegistry();

    const subjectId = (logoRow.subject_entity_id as string | null) ?? null;
    const [subjectResult, candidatesResult] = await Promise.all([
      subjectId
        ? supabase
            .from("brand_entities")
            .select("id, name, brand_kind, parent_brand_id, website, industry, location, description")
            .eq("id", subjectId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("logo_candidates").select("id").eq("logo_id", logoId),
    ]);
    throwOn(subjectResult.error);
    throwOn(candidatesResult.error);

    const candidateIds = (candidatesResult.data ?? []).map((row) => row.id as string);
    if (candidateIds.length === 0) {
      return {
        subject: subjectResult.data
          ? mapBrandEntity(subjectResult.data as BrandEntityRow)
          : null,
        lockups: [],
      };
    }

    const { data: lockupRows, error: lockupErr } = await supabase
      .from("logo_lockups")
      .select("id, candidate_id, kind, label, is_primary, sort_order")
      .in("candidate_id", candidateIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    throwOn(lockupErr);

    const lockupIds = (lockupRows ?? []).map((row) => row.id as string);
    const variantRows =
      lockupIds.length > 0
        ? await supabase
            .from("logo_variants")
            .select("id, lockup_id, kind, source, colorway, label, sort_order")
            .in("lockup_id", lockupIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
        : { data: [], error: null };
    throwOn(variantRows.error);

    const variantsByLockup = new Map<string, LogoVariantAsset[]>();
    for (const row of (variantRows.data ?? []) as unknown as LogoVariantRow[]) {
      const current = variantsByLockup.get(row.lockup_id) ?? [];
      current.push(mapLogoVariant(row));
      variantsByLockup.set(row.lockup_id, current);
    }

    return {
      subject: subjectResult.data
        ? mapBrandEntity(subjectResult.data as BrandEntityRow)
        : null,
      lockups: ((lockupRows ?? []) as unknown as LogoLockupRow[]).map(
        (row): LogoLockup => ({
          id: row.id,
          candidateId: row.candidate_id,
          kind: row.kind as LogoLockup["kind"],
          label: row.label,
          isPrimary: row.is_primary,
          sortOrder: row.sort_order,
          variants: variantsByLockup.get(row.id) ?? [],
        })
      ),
    };
  }

  async saveAssetSubject(
    logoId: string,
    subject: BrandEntityDraft | null
  ): Promise<BrandEntity | null> {
    const uid = await this.ensureAuth();
    const { data: logoRow, error: logoErr } = await supabase
      .from("logos")
      .select("subject_entity_id")
      .eq("id", logoId)
      .maybeSingle();
    throwOn(logoErr);
    if (!logoRow) return null;

    const currentSubjectId = (logoRow.subject_entity_id as string | null) ?? null;
    const now = new Date().toISOString();
    if (!subject) {
      const reassigned = await supabase
        .from("logos")
        .update({ subject_entity_id: null, updated_at: now, updated_by: uid })
        .eq("id", logoId)
        .select("subject_entity_id")
        .single();
      throwOn(reassigned.error);

      const placeholderId = reassigned.data?.subject_entity_id as string | null;
      if (!placeholderId) throw new Error("ロゴの仮Organizationを作成できませんでした");
      const placeholder = await supabase
        .from("brand_entities")
        .select("id, name, brand_kind, parent_brand_id, website, industry, location, description")
        .eq("id", placeholderId)
        .single();
      throwOn(placeholder.error);
      await this.logActivity(logoId, "info_updated");
      return mapBrandEntity(placeholder.data as BrandEntityRow);
    }

    const row = {
      name: subject.name,
      brand_kind: subject.entityType,
      parent_brand_id: subject.parentId,
      website: subject.website,
      industry: subject.industry,
      location: subject.location,
      description: subject.description,
      updated_at: now,
    };
    if (!currentSubjectId) {
      throw new Error("ロゴに紐づくBrandが見つかりません");
    }
    const { data: saved, error: saveErr } = await supabase
      .from("brand_entities")
      .update(row)
      .eq("id", currentSubjectId)
      .select("id, name, brand_kind, parent_brand_id, website, industry, location, description")
      .single();
    throwOn(saveErr);
    await this.logActivity(logoId, "info_updated");
    return mapBrandEntity(saved as BrandEntityRow);
  }

  // ---------- presentation (layer B) ----------

  async getPresentation(logoId: string): Promise<LogoPresentation> {
    await this.ensureAuth();
    const { data, error } = await supabase.rpc("read_logo_presentation_take", {
      p_logo_id: logoId,
    });
    throwOn(error);
    const row = (data as
      | { presentation: Partial<LogoPresentation> | null; updated_at: string }[]
      | null)?.[0];
    if (!row?.presentation) return emptyPresentation();
    return normalizePresentation({ ...row.presentation, updatedAt: row.updated_at });
  }

  async savePresentation(
    logoId: string,
    presentation: LogoPresentation
  ): Promise<void> {
    await this.ensureAuth();
    const normalized = {
      ...normalizePresentation(presentation),
      updatedAt: new Date().toISOString(),
    };
    const { error } = await supabase.rpc("update_logo_presentation_take", {
      p_logo_id: logoId,
      p_presentation: normalized,
    });
    throwOn(error);
  }

  // ---------- inventory / orders (org-scoped) ----------

  async listInventory(): Promise<InventoryItem[]> {
    const orgId = await this.ensureOrg();
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    throwOn(error);
    if (data && data.length > 0) return data.map(mapInventoryRow);

    // First visit: seed the demo inventory for this organization.
    const { data: seeded, error: seedErr } = await supabase
      .from("inventory_items")
      .insert(
        SEED_INVENTORY.map((item) => ({
          org_id: orgId,
          name: item.name,
          spec: item.spec,
          category: item.category,
          emoji: item.emoji,
          unit: item.unit,
          unit_price: item.unitPrice,
          stock: item.stock,
          par_level: item.parLevel,
          pending_qty: item.pendingQty,
        }))
      )
      .select("*");
    throwOn(seedErr);
    return (seeded ?? []).map(mapInventoryRow);
  }

  async listOrders(): Promise<Order[]> {
    const orgId = await this.ensureOrg();
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .order("ordered_at", { ascending: false });
    throwOn(error);
    return (data ?? []).map((o) => ({
      id: o.id,
      itemId: o.item_id,
      itemName: o.item_name,
      qty: o.qty,
      amount: o.amount,
      status: o.status,
      orderedAt: o.ordered_at,
    }));
  }

  async placeOrder(itemId: string, qty: number): Promise<Order> {
    const orgId = await this.ensureOrg();
    const uid = await this.ensureAuth();
    if (qty <= 0) throw new Error("数量は1以上を指定してください。");
    const { data: item, error: itemErr } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", itemId)
      .single();
    throwOn(itemErr);

    const now = new Date().toISOString();
    throwOn(
      (
        await supabase
          .from("inventory_items")
          .update({ pending_qty: item!.pending_qty + qty, last_ordered_at: now })
          .eq("id", itemId)
      ).error
    );
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        org_id: orgId,
        item_id: itemId,
        item_name: `${item!.name}（${item!.spec}）`,
        qty,
        amount: qty * item!.unit_price,
        status: "ordered",
        ordered_by: uid,
      })
      .select("*")
      .single();
    throwOn(orderErr);
    return {
      id: order!.id,
      itemId: order!.item_id,
      itemName: order!.item_name,
      qty: order!.qty,
      amount: order!.amount,
      status: order!.status,
      orderedAt: order!.ordered_at,
    };
  }

  // ---------- generated mockups ----------
  // Candidate-scoped generated mockups now live in R2; the relational index is
  // public.logo_mockups and the bytes are served through /api/mockups/*.

  async getMockups(
    logoId: string,
    candidateId?: string | null
  ): Promise<GeneratedMockups> {
    if (!candidateId) return {};
    const res = await this.mockupRequest(`/api/mockups/${logoId}/${candidateId}`);
    if (!res.ok) return {};
    return (await res.json()) as GeneratedMockups;
  }

  async saveMockup(
    logoId: string,
    candidateId: string | null | undefined,
    mockupId: string,
    image: string
  ): Promise<void> {
    if (!candidateId) return;
    const res = await this.mockupRequest(`/api/mockups/${logoId}/${candidateId}/${mockupId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Failed to save mockup.");
    }
  }
}

function mapInventoryRow(row: {
  id: string;
  name: string;
  spec: string;
  category: string;
  emoji: string;
  unit: string;
  unit_price: number;
  stock: number;
  par_level: number;
  pending_qty: number;
  last_ordered_at: string | null;
}): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    spec: row.spec,
    category: row.category as InventoryItem["category"],
    emoji: row.emoji,
    unit: row.unit,
    unitPrice: row.unit_price,
    stock: row.stock,
    parLevel: row.par_level,
    pendingQty: row.pending_qty,
    lastOrderedAt: row.last_ordered_at,
  };
}
