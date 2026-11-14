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
import { readSiteContent, siteContentClaims } from "@/lib/brand/site-content";
import { readBrandInputs, type InputRead } from "@/lib/brand/read-inputs";
import { classifySiteImages } from "@/lib/brand/classify-site-images";
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

  // The five stages every pipeline shows (lib/pipeline/stages.ts), named as
  // the work passes through them so the log and the pipeline say the same.
  log.stage("input");
  await log.step(`${url} を取得しています`);
  const page = await scrapeUrl(url);
  await log.step(`ページを取得しました${page.title ? `: ${page.title}` : ""}`);

  log.stage("extract");
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
  log.stage("structure");
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

  // What the page says for itself — its features and its customers' words.
  // Never fatal: a brand without them is still a brand, and the first
  // deliverable that wants them reads the page again (ensureSiteContent).
  await log.step("ページが挙げている特長とお客様の声を読み取っています");
  try {
    const content = await readSiteContent(page);
    const said = await appendBrandKnowledgeClaims(supabase, {
      brandId,
      fields: siteContentClaims(content),
      sourceKind: "llm_structuring",
      sourceRef,
      userId,
    });
    if (!said.ok) throw new Error(said.error);
    await log.step(`特長${content.features.length}件・お客様の声${content.voices.length}件を記録しました`);
  } catch (error) {
    console.error("Site content reading failed:", error);
    await log.step("特長とお客様の声は読み取れませんでした（ほかの項目は保存済みです）", "warn");
  }

  // What the person fed in beside the site — files, pages, notes. Read after
  // the site, so where both speak, their own material is the newer word.
  const inputs = await readInputsStep(supabase, { brandId, userId, log });

  // Files last, and never fatal: a brand that gained its measurements but
  // lost a screenshot to a storage hiccup is still better off.
  log.stage("map");
  await log.step("サイトの画像を保存しています");
  let files = { saved: [] as { label: string }[], skipped: 0, note: null as string | null };
  try {
    files = await saveSiteMaterials({ supabase, userId, brandId, capture });
    await log.step(`画像${files.saved.length}点を保存しました`);
  } catch (error) {
    console.error("Site material capture failed:", error);
    await log.step("画像の保存に失敗しました（測定値は保存済みです）", "warn");
  }

  // The pictures on the pages added as input — the company page's portraits,
  // the product page's screens — which the top page does not carry.
  const extra = await addedPageImages({ supabase, userId, brandId, log });

  // Which of them are the brand's own assets and which only happened to be
  // on the page (lib/brand/asset-use.ts).
  await judgeImagesStep(supabase, { brandId, log });

  const result: BrandRunResult = {
    url: page.url,
    adopted,
    claims: claimed.appended + (facts.ok ? facts.appended : 0) + inputs.recorded,
    files: files.saved.length + extra,
    note: files.note,
  };
  log.stage("output");
  await log.step("読み取りが終わりました", "success");
  await log.finish(result);
  return result;
}

/**
 * The brand's own inputs, read into claims, with the account of it in the
 * run's log. Never fatal: a brand whose site was read is still better off
 * when a brand book could not be.
 */
export async function readInputsStep(
  supabase: SupabaseClient,
  input: { brandId: string; userId: string; log: BrandRunLog },
): Promise<InputRead> {
  const { log } = input;
  try {
    const result = await readBrandInputs({ supabase, brandId: input.brandId, userId: input.userId });
    if (result.read.length === 0 && result.skipped.length === 0) return result;
    if (result.read.length > 0) {
      await log.step(`追加した素材${result.read.length}点を読み、${result.recorded}件を記録しました（${result.read.join("、")}）`);
    }
    for (const item of result.skipped) {
      await log.step(`読まなかった素材: ${item.label} — ${item.reason}`, "warn");
    }
    return result;
  } catch (error) {
    console.error("Reading brand inputs failed:", error);
    await log.step(
      `追加した素材を読めませんでした（${error instanceof Error ? error.message : "不明なエラー"}）。サイトの読み取りは保存済みです`,
      "warn",
    );
    return { read: [], skipped: [], recorded: 0 };
  }
}

/**
 * A brand with no site to read: its inputs alone, through the same stages
 * and the same log.
 */
export async function importInputsOnly(input: {
  supabase: SupabaseClient;
  userId: string;
  brandId: string;
  log: BrandRunLog;
}): Promise<BrandRunResult> {
  const { supabase, userId, brandId, log } = input;
  log.stage("input");
  await log.step("サイトの URL が無いので、追加した素材だけを読みます");
  log.stage("structure");
  await log.step("追加した素材から、運営者・提供内容・特長・お客様の声を読み取っています");
  const inputs = await readInputsStep(supabase, { brandId, userId, log });
  if (inputs.read.length === 0) {
    throw new Error("読める素材がありません。サイトの URL か、資料・メモを追加してください");
  }
  const result: BrandRunResult = { url: "", adopted: 0, claims: inputs.recorded, files: 0, note: null };
  log.stage("output");
  await log.step("読み取りが終わりました", "success");
  await log.finish(result);
  return result;
}

/** At most this many added pages are rendered for their pictures per read. */
const ADDED_PAGES_RENDERED = 3;

/** Render the pages added as input and keep their pictures. Never fatal. */
async function addedPageImages(input: {
  supabase: SupabaseClient;
  userId: string;
  brandId: string;
  log: BrandRunLog;
}): Promise<number> {
  const { supabase, userId, brandId, log } = input;
  const { data, error } = await supabase
    .from("brand_materials")
    .select("source_url, provenance")
    .eq("brand_id", brandId)
    .eq("scope", "brand")
    .eq("source_kind", "upload")
    .not("source_url", "is", null);
  if (error) return 0;
  const urls = [
    ...new Set(
      (data ?? [])
        .filter((row) => (row.provenance as Record<string, unknown> | null)?.input === "url")
        .map((row) => row.source_url as string),
    ),
  ].slice(0, ADDED_PAGES_RENDERED);
  let saved = 0;
  for (const url of urls) {
    try {
      await log.step(`追加したページの画像を集めています: ${url}`);
      const capture = await captureSite(url);
      if (!capture) continue;
      const result = await saveSiteMaterials({ supabase, userId, brandId, capture, screenshots: false });
      saved += result.saved.length;
      await log.step(`画像${result.saved.length}点を保存しました（${url}）`);
    } catch (error) {
      console.error("Added page capture failed:", error);
      await log.step(`このページの画像は集められませんでした: ${url}`, "warn");
    }
  }
  return saved;
}

/** Judge the brand's site images, with the account of it in the log. Never fatal. */
async function judgeImagesStep(
  supabase: SupabaseClient,
  input: { brandId: string; log: BrandRunLog },
): Promise<void> {
  const { log } = input;
  try {
    await log.step("画像を1枚ずつ見て、ブランドの素材か、たまたま載っていた画像かを判断しています");
    const result = await classifySiteImages({ supabase, brandId: input.brandId });
    if (result.judged === 0 && result.remaining === 0) {
      await log.step("新しく判断する画像はありませんでした");
      return;
    }
    await log.step(
      `画像${result.judged}点を判断しました（ブランドの素材 ${result.core}点）${
        result.remaining > 0 ? `。残り${result.remaining}点は次の作り直しで判断します` : ""
      }`,
    );
  } catch (error) {
    console.error("Judging site images failed:", error);
    await log.step("画像の判断はできませんでした（画像は保存済みです）", "warn");
  }
}
