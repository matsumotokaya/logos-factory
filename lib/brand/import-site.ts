import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBrandKind } from "@/lib/brand-kind";
import { saveBrandAssetsFromUrl } from "@/lib/brand/import-assets";
import {
  adoptBrandKnowledge,
  appendBrandKnowledgeClaims,
  type AppendKnowledgeField,
} from "@/lib/brand/knowledge";
import type { BrandRunLog, BrandRunResult } from "@/lib/brand/runs";
import { assignPaletteRoles } from "@/lib/brand/site-palette";
import { siteKnowledge } from "@/lib/brand/site-knowledge";
import { saveSiteMaterials } from "@/lib/brand/site-materials";
import { analyzeSite, type SiteAnalysis } from "@/lib/brand/analyze-site";
import { captureSite, type SiteCapture } from "@/lib/site/capture";
import { scrapeUrl } from "@/lib/site/ingest";
import { resolveLogo } from "@/lib/site/logo-resolve";

// Reading a site into a brand — the one path, for a brand being created from
// a URL and for 「サイトを読み直す」 alike. Rules first: the rendered page is
// measured (palette, type, tokens, sections, contact, images) and what a rule
// measured is adopted. A model then structures what the page says about who
// runs it and what it offers; those stay claims. Nothing here writes a
// deliverable — LPs and videos are made from the brand afterwards.
//
// On creation the brand was made a moment before, named after the host
// (createBrandFromUrl); `identify` lets the analysis name it, label its kind
// and name a workspace made for it. A field the user has set is never
// touched, and a re-read never renames anything.

type Identify = {
  /** The name the workspace got when it was made for this brand, or null. */
  provisionalWorkspaceName: string | null;
};

/** The five palette roles, read off the rendered page by rule alone. */
function paletteFrom(
  capture: SiteCapture,
  logoColors: { hex: string; share: number }[],
  themeColor: string | null,
  colorHints: string[],
): Record<string, string> {
  const byWeight = (values: Array<{ hex: string; weight: number }>) =>
    [...values].sort((left, right) => right.weight - left.weight).map((v) => v.hex);
  return assignPaletteRoles({
    logoColors: [...logoColors].sort((left, right) => right.share - left.share).map((v) => v.hex),
    interactive: [...capture.evidence.interactive].sort((left, right) => right.count - left.count),
    backgrounds: byWeight(capture.evidence.backgrounds),
    texts: byWeight(capture.evidence.texts),
    hints: [themeColor ?? "", ...colorHints],
  });
}

function analysisClaims(analysis: SiteAnalysis): AppendKnowledgeField[] {
  const fact = (field_path: string, value: string): AppendKnowledgeField | null =>
    value.trim() ? { field_path, layer: "fact", value: value.trim(), confidence: "inferred" } : null;
  return [
    fact("identity.legal_name", analysis.operator.name),
    fact("identity.description", analysis.operator.description),
    fact("offering.name", analysis.subject.name),
    fact("offering.tagline", analysis.subject.tagline),
    fact("offering.description", analysis.subject.description),
    fact("offering.industry", analysis.subject.industry),
    fact("offering.audience", analysis.subject.audience),
    fact("offering.summary", analysis.subject.offering),
  ].filter((field): field is AppendKnowledgeField => field !== null);
}

/**
 * Name, describe and label a brand that was made for this run, and name the
 * workspace if it was made too. A field whose provenance says the user set it
 * is theirs; a workspace they renamed (its name no longer the provisional one)
 * is theirs. The operator names the workspace only when the analysis is
 * reasonably sure of it — a guess would put the wrong company on all of it.
 */
async function identifyBrand(
  supabase: SupabaseClient,
  brandId: string,
  analysis: SiteAnalysis,
  identify: Identify,
): Promise<void> {
  const current = await supabase
    .from("brand_entities")
    .select("organization_id, provenance")
    .eq("id", brandId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new Error("ブランドが見つかりません");
  const provenance =
    (current.data.provenance as Record<string, { source?: string }> | null) ?? {};
  const userSet = (field: string) => provenance[field]?.source === "user_confirmed";
  const inferred = { source: "site_analysis", confidence: "medium" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const nextProvenance: Record<string, unknown> = { ...provenance };
  const name = analysis.subject.name.trim() || analysis.operator.name.trim();
  if (name && !userSet("name")) {
    patch.name = name.slice(0, 200);
    nextProvenance.name = inferred;
  }
  if (analysis.subject.description.trim() && !userSet("description")) {
    patch.description = analysis.subject.description.trim();
    nextProvenance.description = inferred;
  }
  if (analysis.subject.industry.trim() && !userSet("industry")) {
    patch.industry = analysis.subject.industry.trim().slice(0, 160);
    nextProvenance.industry = inferred;
  }
  if (isBrandKind(analysis.brand_kind) && !userSet("brand_kind")) {
    patch.brand_kind = analysis.brand_kind;
    nextProvenance.brand_kind = { source: "site_analysis", confidence: analysis.kind_confidence };
  }
  patch.provenance = nextProvenance;
  const updated = await supabase.from("brand_entities").update(patch).eq("id", brandId);
  if (updated.error) throw new Error(updated.error.message);

  const operator = analysis.operator;
  if (identify.provisionalWorkspaceName && operator.confidence !== "low" && operator.name.trim()) {
    const renamed = await supabase
      .from("organizations")
      .update({ name: operator.name.trim().slice(0, 200) })
      .eq("org_id", current.data.organization_id as string)
      .eq("name", identify.provisionalWorkspaceName);
    if (renamed.error) throw new Error(renamed.error.message);
  }
}

export async function importSiteIntoBrand(input: {
  supabase: SupabaseClient;
  userId: string;
  brandId: string;
  url: string;
  log: BrandRunLog;
  /** Set when the brand was made for this run; null on a re-read. */
  identify: Identify | null;
}): Promise<BrandRunResult> {
  const { supabase, userId, brandId, url, log } = input;

  await log.step(`${url} を取得しています`);
  const page = await scrapeUrl(url);
  await log.step(`ページを取得しました${page.title ? `: ${page.title}` : ""}`);

  await log.step("ブラウザで描画して、色・書体・レイアウト・ロゴを測っています");
  const capture = await captureSite(page.url, { faviconUrl: page.faviconUrl });
  if (!capture) {
    // Without a browser there is nothing to measure, and writing the static
    // hints as if they were measurements would conflate the two.
    throw new Error("この環境ではページを描画できないため、取り込めませんでした（Chromiumが必要です）");
  }
  await log.step(`測りました: サイトの画像${capture.images.length}点`);

  await log.step("ロゴの候補を集めて、このサイト自身のロゴを選んでいます");
  const resolved = await resolveLogo({ raw: page, capture });
  const logo =
    resolved?.kind === "logo" && (resolved.svg || resolved.image)
      ? { svg: resolved.svg, data: resolved.image, colors: resolved.colors }
      : capture.logoSvg || capture.logoImage
        ? { svg: capture.logoSvg, data: capture.logoImage, colors: capture.evidence.logoColors }
        : null;
  await log.step(
    resolved?.kind === "logo"
      ? `ロゴを決めました（${resolved.sourceLabel}${resolved.svg ? "・SVG" : ""}${resolved.rationale ? `）— ${resolved.rationale}` : "）"}`
      : logo
        ? "ロゴを決めました（ページ上の位置から）"
        : "このサイト自身のロゴは見つかりませんでした",
    logo ? "info" : "warn",
  );

  const capturedAt = new Date().toISOString();
  const sourceRef = { source: "site_import", source_url: page.url, at: capturedAt };

  // Palette, tokens and the mark, through the path that owns them: a new
  // logo comes with its presentation, an existing one is updated in place.
  await log.step("配色・デザイントークン・ロゴを保存しています");
  const brand = await supabase.from("brand_entities").select("name").eq("id", brandId).maybeSingle();
  await saveBrandAssetsFromUrl({
    supabase,
    userId,
    brandId,
    brandName: (brand.data?.name as string | undefined) ?? "",
    role: "brand",
    sourceUrl: page.url,
    value: {
      palette: paletteFrom(capture, logo?.colors ?? [], page.themeColor, page.colorHints),
      designTokens: capture.designTokens,
      logo: logo
        ? {
            svg: logo.svg,
            data: logo.data,
            mediaType: logo.svg ? "image/svg+xml" : "image/png",
            sourceUrl: page.url,
          }
        : null,
    },
  });

  // Everything else the page said: type scale, component shapes, sections,
  // contact details, social accounts. What a rule measured is adopted.
  await log.step("ページが言っていること（書体の大きさ・構成・連絡先・SNS）を記録しています");
  const knowledge = siteKnowledge(capture, capturedAt);
  const claimed = await appendBrandKnowledgeClaims(supabase, {
    brandId,
    fields: knowledge.claims,
    sourceKind: "url_extraction",
    sourceRef,
    userId,
  });
  if (!claimed.ok) throw new Error(claimed.error);
  let adopted = 0;
  if (knowledge.adopt.length > 0) {
    const result = await adoptBrandKnowledge(supabase, {
      brandId,
      fields: knowledge.adopt,
      sourceKind: "url_extraction",
      sourceRef,
      userId,
    });
    if (!result.ok) throw new Error(result.error);
    adopted = result.adopted;
  }
  await log.step(`${claimed.appended}件を記録し、測定できた${adopted}項目を採用しました`);

  // Who runs it and what it offers: structured from the page's own text.
  await log.step("運営者・提供内容・ブランドの種別を、ページの文章から読み取っています");
  const { analysis } = await analyzeSite(page);
  const facts = await appendBrandKnowledgeClaims(supabase, {
    brandId,
    fields: analysisClaims(analysis),
    sourceKind: "llm_structuring",
    sourceRef,
    userId,
  });
  if (!facts.ok) throw new Error(facts.error);
  if (input.identify) {
    await identifyBrand(supabase, brandId, analysis, input.identify);
    await log.step(
      `「${analysis.subject.name || analysis.operator.name}」として登録しました（運営: ${analysis.operator.name || "不明"}）`,
    );
  } else {
    await log.step(`運営者・提供内容を記録しました（運営: ${analysis.operator.name || "不明"}）`);
  }

  // Files last, and never fatal: a brand that gained its measurements but
  // lost a screenshot to a storage hiccup is still better off.
  await log.step("サイトの画像を保存しています");
  let files = { saved: [] as { label: string }[], skipped: 0, note: null as string | null };
  try {
    files = await saveSiteMaterials({ supabase, userId, brandId, capture });
    await log.step(`画像${files.saved.length}点を保存しました`);
  } catch (error) {
    console.error("Site material capture failed:", error);
    await log.step("画像の保存に失敗しました（測定値は保存済みです）", "warn");
  }

  const result: BrandRunResult = {
    url: page.url,
    adopted,
    claims: claimed.appended + (facts.ok ? facts.appended : 0),
    files: files.saved.length,
    note: files.note,
  };
  await log.step("読み取りが終わりました", "success");
  await log.finish(result);
  return result;
}
