import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { newLogoId } from "@/lib/id";
import { deleteR2Object, isR2Configured, putR2Object } from "@/lib/r2";
import { createServerSupabaseForToken } from "@/lib/supabase/server";
import {
  adoptBrandKnowledge,
  appendBrandKnowledgeClaims,
  type AppendKnowledgeField,
} from "@/lib/brand/knowledge";
import { paletteKnowledge, siteKnowledge } from "@/lib/brand/site-knowledge";
import { saveSiteMaterials } from "@/lib/brand/site-materials";
import type { SiteCapture } from "./capture";
import type { CampaignJob } from "./jobs";
import type { CampaignBrandKit } from "./schema";
import { resolveSubjectCategory, type BrandKind } from "./classification";
import {
  normalizedCatalogWebsite,
  organizationCatalogSeed,
} from "./catalog-seed";

export type CampaignCatalogLink = {
  /** The workspace the brand was filed in. */
  organizationId: string;
  brandId: string;
  publishedLpTakeId?: string;
  publishedLpPath?: string;
  /** @deprecated Kept while local job records and older clients are upgraded. */
  businessId: string;
  /** @deprecated The generation job ID, not a required Campaign container. */
  campaignId: string;
  /** @deprecated New generations record execution on take_runs. */
  generationRunId?: string;
  /** @deprecated New generated outputs are Takes. */
  lpAssetId?: string;
  logoId: string;
  syncedAt: string;
};

type PersistCatalogInput = {
  accessToken: string;
  userId: string;
  job: CampaignJob;
  kit: CampaignBrandKit;
  /** The rendered-page evidence, when there was a page and a browser to read
   *  it with. Its absence is why a brand can end up knowing only what a model
   *  proposed, and the two must not be stored as if they were the same. */
  capture?: SiteCapture | null;
};

type BrandTarget = {
  organizationId: string;
  brandId: string;
  brandKind: BrandKind;
};

function throwOn(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function provisionalWordmark(name: string, color: string): string {
  const label = xml(name.trim() || "Brand");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 320"><rect width="960" height="320" rx="24" fill="#fff"/><text x="480" y="178" text-anchor="middle" dominant-baseline="middle" fill="${xml(color)}" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="700">${label}</text></svg>`;
}

/** The captured vector master, script-stripped, or null when the kit has none. */
function capturedLogoSvg(kit: CampaignBrandKit): string | null {
  const svg = kit.assets?.logo_svg;
  if (!svg || !svg.trim()) return null;
  const clean = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  return clean.length <= 300_000 ? clean : null;
}

/** What findOrCreateLogo would store as the master right now. */
type CapturedMaster =
  | { kind: "svg"; svg: string }
  | { kind: "raster"; data: string; mediaType: string }
  | null;

function capturedMaster(kit: CampaignBrandKit): CapturedMaster {
  const svg = capturedLogoSvg(kit);
  if (svg) return { kind: "svg", svg };
  const raster = kit.assets?.logo;
  if (raster && isR2Configured())
    return { kind: "raster", data: raster.data, mediaType: raster.media_type };
  return null;
}

/** The caller's workspace, created on first use (migration 0056). */
async function resolveWorkspace(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_my_workspace");
  throwOn(error);
  const organizationId = (data as string | null) ?? null;
  if (!organizationId) throw new Error("ワークスペースを解決できませんでした");
  return organizationId;
}

/**
 * File the generated subject as a Brand — always a new one.
 *
 * v2 matched an existing row by the name the LLM produced, so 「BEST株式会社」
 * and 「BEST」 became two organizations while a vague guess could merge two
 * unrelated sites. Identity is the id now (§19.3): registering a URL always
 * yields one new Brand, and the entry point is what offers to update an
 * existing one instead. `source_url` is recorded so it can make that offer.
 */
async function createBrand(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  kit: CampaignBrandKit,
  sourceUrl: string | null,
  brandKind: BrandKind,
): Promise<string> {
  const brandId = randomUUID();
  const inserted = await supabase.from("brand_entities").insert({
    id: brandId,
    name: kit.service.name || kit.organization?.name || "名称未設定のブランド",
    website: normalizedCatalogWebsite(kit.service.url ?? sourceUrl),
    industry: kit.service.industry,
    description: kit.service.description,
    status: "inferred",
    source_kind: sourceUrl ? "scraped" : "uploaded",
    source_url: normalizedCatalogWebsite(sourceUrl) || null,
    provenance: {
      name: { source: "generation_brand_kit", confidence: "medium" },
      description: { source: "generation_brand_kit", confidence: "medium" },
      brand_kind: {
        source: "generation_classification",
        confidence: kit.classification?.confidence ?? "low",
      },
    },
    created_by: userId,
    organization_id: organizationId,
    brand_kind: brandKind,
  });
  throwOn(inserted.error);
  return brandId;
}

/** The Brand the user picked in the entry form, when they picked one. */
async function selectedBrandTarget(
  supabase: SupabaseClient,
  brandId: string,
): Promise<BrandTarget> {
  const selected = await supabase
    .from("brand_entities")
    .select("id, organization_id, brand_kind")
    .eq("id", brandId)
    .maybeSingle();
  throwOn(selected.error);
  if (!selected.data?.organization_id) {
    throw new Error("選択したブランドを確認できませんでした");
  }
  return {
    organizationId: selected.data.organization_id as string,
    brandId: selected.data.id as string,
    brandKind: (selected.data.brand_kind as BrandKind | null) ?? "business",
  };
}

async function saveCatalogKnowledge(
  supabase: SupabaseClient,
  userId: string,
  target: BrandTarget,
  job: CampaignJob,
  kit: CampaignBrandKit,
  capture: SiteCapture | null,
  capturedAt: string,
): Promise<void> {
  const sourceRef = { campaign_job_id: job.id, source_url: job.input.url };
  const organizationFields: AppendKnowledgeField[] = [
    { field_path: "identity.legal_name", layer: "fact", value: kit.organization?.name, confidence: "inferred" },
    { field_path: "identity.description", layer: "fact", value: kit.organization?.description, confidence: "inferred" },
  ];
  const serviceFields: AppendKnowledgeField[] = [
    { field_path: "offering.name", layer: "fact", value: kit.service.name, confidence: "inferred" },
    { field_path: "offering.tagline", layer: "fact", value: kit.service.tagline, confidence: "inferred" },
    { field_path: "offering.description", layer: "fact", value: kit.service.description, confidence: "inferred" },
    { field_path: "offering.industry", layer: "fact", value: kit.service.industry, confidence: "inferred" },
    { field_path: "offering.business_type", layer: "fact", value: kit.service.business_type, confidence: "inferred" },
    { field_path: "offering.audience", layer: "fact", value: kit.service.audience, confidence: "inferred" },
    { field_path: "offering.summary", layer: "fact", value: kit.service.offering, confidence: "inferred" },
  ];
  // The palette splits by where it came from: read off the rendered page, or
  // proposed by the model because there was no page to read.
  const palette = paletteKnowledge(kit.brand);
  // Everything the second in-page pass measured — type scale, component shape,
  // section structure — plus the facts the page states about itself.
  const site = capture ? siteKnowledge(capture, capturedAt) : null;

  const expressionFields: AppendKnowledgeField[] = [
    ...palette.claims,
    { field_path: "tone.theme", layer: "expression", value: kit.theme, confidence: "suggested" },
  ];
  // A design token is a measurement, so it is only a suggestion when nothing
  // measured it. With a capture in hand these are adopted below instead.
  if (!capture) {
    for (const [path, value] of [
      ["typography.body_font", kit.design_tokens?.body_font],
      ["typography.heading_font", kit.design_tokens?.heading_font],
      ["tokens.button_radius", kit.design_tokens?.button_radius],
      ["tokens.button_padding", kit.design_tokens?.button_padding],
      ["tokens.section_spacing", kit.design_tokens?.section_spacing],
      ["tokens.container_width", kit.design_tokens?.container_width],
    ] as const) {
      if (value) {
        expressionFields.push({
          field_path: path,
          layer: "expression",
          value,
          confidence: "suggested",
        });
      }
    }
  }

  // One Brand carries both: the operator facts describe who runs it, and in
  // v3 there is no separate corporate Brand to hang them on. They stay claims
  // rather than becoming the workspace's identity — the workspace is the
  // user's container, not the scraped company (§19.2).
  const facts = await appendBrandKnowledgeClaims(supabase, {
    brandId: target.brandId,
    fields: [...organizationFields, ...serviceFields],
    sourceKind: "llm_structuring",
    sourceRef,
    userId,
  });
  if (!facts.ok) throw new Error(facts.error);

  const expression = await appendBrandKnowledgeClaims(supabase, {
    brandId: target.brandId,
    fields: expressionFields,
    sourceKind:
      kit.brand.palette_source === "extracted"
        ? "url_extraction"
        : "llm_generation",
    sourceRef,
    userId,
  });
  if (!expression.ok) throw new Error(expression.error);

  if (site) {
    const observed = await appendBrandKnowledgeClaims(supabase, {
      brandId: target.brandId,
      fields: site.claims,
      sourceKind: "url_extraction",
      sourceRef,
      userId,
    });
    if (!observed.ok) throw new Error(observed.error);
  }

  // Adopting what a rule measured is what makes the brand page show anything
  // at all. Before this, a URL produced two dozen claims and zero values, and
  // the page — which reads values — said 「まだ採用されたデザインルールはありません」
  // about a brand it had just finished measuring. Adoption is confined to
  // `expression` fields a deterministic reading produced; facts stay claims,
  // and a value a person has already decided is not touched by the RPC.
  const toAdopt = [...palette.adopt, ...(site?.adopt ?? [])];
  if (toAdopt.length > 0) {
    const adopted = await adoptBrandKnowledge(supabase, {
      brandId: target.brandId,
      fields: toAdopt,
      sourceKind: "url_extraction",
      sourceRef,
      userId,
    });
    if (!adopted.ok) throw new Error(adopted.error);
  }
}

async function findOrCreateLogo(
  supabase: SupabaseClient,
  userId: string,
  target: BrandTarget,
  kit: CampaignBrandKit,
): Promise<string> {
  // A freshly created Brand has no logo; a Brand the user picked may already
  // have one, and re-registering into it must not add a second.
  const existing = await supabase
    .from("logos")
    .select("id")
    .eq("subject_entity_id", target.brandId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  throwOn(existing.error);
  if (existing.data) {
    // A placeholder wordmark from an earlier degraded run (no Chromium, no
    // capture) must not survive a run that DID capture the real mark, or the
    // brand looks permanently logoless.
    await upgradeWordmarkFallback(
      supabase,
      userId,
      existing.data.id as string,
      capturedMaster(kit),
    );
    return existing.data.id as string;
  }

  const logoId = newLogoId();
  const candidateId = randomUUID();
  let filePath: string | null = null;
  let mediaType = "image/svg+xml";
  let svg: string | null = null;

  const master = capturedMaster(kit);
  if (master?.kind === "svg") {
    // The vector master is this product's currency — store it as-is.
    svg = master.svg;
  } else if (master?.kind === "raster") {
    filePath = `logos/${logoId}/candidates/${candidateId}/master.png`;
    mediaType = master.mediaType;
    await putR2Object(
      filePath,
      Buffer.from(master.data, "base64"),
      master.mediaType,
      "private, max-age=0",
    );
  } else {
    svg = provisionalWordmark(
      target.brandKind === "corporate" || target.brandKind === "organization"
        ? (kit.organization?.name ?? kit.service.name)
        : kit.service.name,
      kit.brand.primary,
    );
  }

  const logoInsert = await supabase.from("logos").insert({
    id: logoId,
    owner_user_id: userId,
    created_by: userId,
    updated_by: userId,
    subject_entity_id: target.brandId,
    title:
      target.brandKind === "corporate" || target.brandKind === "organization"
        ? (kit.organization?.name ?? kit.service.name)
        : kit.service.name,
    role:
      target.brandKind === "corporate" || target.brandKind === "organization"
        ? "corporate"
        : "service",
    logo_type: "combination",
    visibility: "draft",
  });
  throwOn(logoInsert.error);

  const candidateInsert = await supabase.from("logo_candidates").insert({
    id: candidateId,
    logo_id: logoId,
    label: "サイトから取得（仮）",
    is_primary: true,
    svg,
    media_type: mediaType,
    file_path: filePath,
    source_url: kit.assets?.source_url ?? null,
    asset_status: "provisional",
    provenance: {
      source: master ? "site_capture" : "generated_wordmark_fallback",
      confirmed: false,
    },
  });
  if (candidateInsert.error) {
    await supabase.from("logos").delete().eq("id", logoId);
    if (filePath) await deleteR2Object(filePath);
    throwOn(candidateInsert.error);
  }

  await supabase.from("logo_activities").insert({
    logo_id: logoId,
    user_id: userId,
    action: "created",
    detail: { source: "brand_generation", asset_status: "provisional" },
  });
  return logoId;
}

/**
 * Replace a generated-wordmark placeholder with the real captured mark.
 *
 * Only touches the primary candidate, and only while its provenance still says
 * `generated_wordmark_fallback` — a candidate a person confirmed, replaced or
 * that already came from the site is never overwritten by a later run.
 */
async function upgradeWordmarkFallback(
  supabase: SupabaseClient,
  userId: string,
  logoId: string,
  master: CapturedMaster,
): Promise<void> {
  if (!master) return;
  const { data: candidates, error } = await supabase
    .from("logo_candidates")
    .select("id, is_primary, provenance, file_path")
    .eq("logo_id", logoId);
  throwOn(error);
  const primary =
    (candidates ?? []).find((c) => c.is_primary) ?? (candidates ?? [])[0];
  const provenance = (primary?.provenance ?? null) as {
    source?: string;
  } | null;
  if (!primary || provenance?.source !== "generated_wordmark_fallback") return;

  let patch: Record<string, unknown>;
  if (master.kind === "svg") {
    patch = { svg: master.svg, media_type: "image/svg+xml", file_path: null };
  } else {
    const filePath = `logos/${logoId}/candidates/${primary.id}/master.png`;
    await putR2Object(
      filePath,
      Buffer.from(master.data, "base64"),
      master.mediaType,
      "private, max-age=0",
    );
    patch = { svg: null, media_type: master.mediaType, file_path: filePath };
  }
  const update = await supabase
    .from("logo_candidates")
    .update({
      ...patch,
      label: "サイトから取得（仮）",
      provenance: { source: "site_capture", confirmed: false },
      updated_at: new Date().toISOString(),
    })
    .eq("id", primary.id);
  throwOn(update.error);

  await supabase.from("logo_activities").insert({
    logo_id: logoId,
    user_id: userId,
    action: "file_updated",
    detail: { source: "brand_generation", replaced: "generated_wordmark_fallback" },
  });
}

export async function persistCampaignCatalog({
  accessToken,
  userId,
  job,
  kit,
  capture,
}: PersistCatalogInput): Promise<CampaignCatalogLink> {
  const supabase = createServerSupabaseForToken(accessToken);
  const sourceUrl = job.input.url;
  const category = resolveSubjectCategory(
    kit.classification,
    job.input.registrationScope,
  );

  // Either the user pointed at a Brand they already have, or this registration
  // makes a new one. There is no third path that guesses which existing row
  // this "really" is (§19.3).
  const target: BrandTarget = job.input.brandEntityId
    ? await selectedBrandTarget(supabase, job.input.brandEntityId)
    : await (async () => {
        // The workspace the user was looking at when they submitted. Without
        // it a brand lands in whichever workspace ensure_my_workspace picks,
        // which is not necessarily the world on their screen.
        const organizationId =
          job.input.organizationId ?? (await resolveWorkspace(supabase));
        return {
          organizationId,
          brandId: await createBrand(
            supabase,
            userId,
            organizationId,
            kit,
            sourceUrl,
            category.brandKind,
          ),
          brandKind: category.brandKind,
        };
      })();

  const now = new Date().toISOString();
  await saveCatalogKnowledge(
    supabase,
    userId,
    target,
    job,
    kit,
    capture ?? null,
    now,
  );
  const logoId = await findOrCreateLogo(supabase, userId, target, kit);

  // The files the capture brought home. Deliberately after the knowledge and
  // the logo: a brand that gained its colours and its mark but lost a
  // screenshot to a storage hiccup is still a brand, so this must not be able
  // to fail the registration.
  if (capture) {
    try {
      await saveSiteMaterials({
        supabase,
        userId,
        brandId: target.brandId,
        capture,
      });
    } catch (error) {
      console.error("Site material capture failed:", error);
    }
  }

  return {
    organizationId: target.organizationId,
    brandId: target.brandId,
    businessId: target.brandId,
    campaignId: job.id,
    logoId,
    syncedAt: now,
  };
}
