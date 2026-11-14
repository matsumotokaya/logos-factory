import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKitBrief } from "@/lib/brand/kit/build";
import { appendBrandKnowledgeClaims } from "@/lib/brand/knowledge";
import { CONTENT_PATHS } from "@/lib/brand/content";
import { readSiteContent, siteContentClaims } from "@/lib/brand/site-content";
import { scrapeUrl } from "@/lib/site/ingest";
import { createTake } from "@/lib/takes/create";
import type { PipelineStageId } from "@/lib/pipeline/stages";
import type { BrandLpBrief } from "./brief-schema";
import { lpDesign } from "./design";
import { lpContext, type LpScreen } from "./context";
import { frameLp } from "./frame";
import { writeLp } from "./write";

// Making an LP from a brand — the one button.
//
// Five steps, one per pipeline stage (lib/pipeline/brand-lp.ts), each
// reported as it starts:
//
//   入力       read the kit as it stands (the draft, in the published kit's shape)
//   抽出       make sure the brand has been asked for its features and its
//              customers' words; a brand read before those were collected is
//              read once more, and what is found is the BRAND's — recorded as
//              claims, shown on the kit page, adopted there
//   構造化     frame the page from the facts and write its words
//   マッピング  fit the kit's colour, type and shape to the page
//   出力       save it as a take whose brief freezes all of the above
//
// Nothing here fails the LP for want of a fact: a section with nothing under
// it gets the frame's stand-in and says so.

/** The readings an LP draws on beyond the kit, by field path. */
const GUESS_PATHS = [
  "offering.tagline",
  "voice.tagline",
  "offering.description",
  "offering.audience",
  "offering.summary",
  "voice.tone",
  "identity.legal_name",
  "layout.cta_label",
  ...CONTENT_PATHS,
];

export const LP_CREATE_STEPS = 5;

/**
 * Ask the brand's site for its features and voices if nobody has. Any claim on
 * the paths — including the `unknown` one that records an empty answer —
 * means it was asked.
 */
async function ensureSiteContent(
  supabase: SupabaseClient,
  input: { brandId: string; userId: string; website: string },
): Promise<"present" | "read" | "skipped"> {
  const [claims, values] = await Promise.all([
    supabase
      .from("brand_knowledge_claims")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", input.brandId)
      .in("field_path", [...CONTENT_PATHS]),
    supabase
      .from("brand_knowledge_values")
      .select("field_path", { count: "exact", head: true })
      .eq("brand_id", input.brandId)
      .in("field_path", [...CONTENT_PATHS]),
  ]);
  if (claims.error) throw new Error(claims.error.message);
  if (values.error) throw new Error(values.error.message);
  if ((claims.count ?? 0) > 0 || (values.count ?? 0) > 0) return "present";
  if (!input.website) return "skipped";

  const page = await scrapeUrl(input.website);
  const content = await readSiteContent(page);
  const appended = await appendBrandKnowledgeClaims(supabase, {
    brandId: input.brandId,
    fields: siteContentClaims(content),
    sourceKind: "llm_structuring",
    sourceRef: { source: "site_content", source_url: page.url, at: new Date().toISOString() },
    userId: input.userId,
  });
  if (!appended.ok) throw new Error(appended.error);
  return "read";
}

/** The brand's latest unadopted readings on the paths an LP uses. */
async function loadGuesses(
  supabase: SupabaseClient,
  brandId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("brand_knowledge_claims")
    .select("field_path, value, confidence, observed_at")
    .eq("brand_id", brandId)
    .is("variant_id", null)
    .in("field_path", GUESS_PATHS)
    .neq("confidence", "unknown")
    .order("observed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const guesses: Record<string, unknown> = {};
  for (const row of data ?? []) {
    const path = row.field_path as string;
    if (!(path in guesses)) guesses[path] = row.value;
  }
  return guesses;
}

/** The site's own desktop screen, the widest landscape one the capture kept. */
async function loadScreen(supabase: SupabaseClient, brandId: string): Promise<LpScreen | null> {
  const { data, error } = await supabase
    .from("brand_materials")
    .select("id, width, height")
    .eq("brand_id", brandId)
    .eq("scope", "brand")
    .eq("category", "screen")
    .not("r2_key", "is", null)
    .order("width", { ascending: false });
  if (error) throw new Error(error.message);
  const landscape = (data ?? []).find(
    (row) => typeof row.width === "number" && typeof row.height === "number" && row.width > row.height,
  );
  return landscape
    ? { materialId: landscape.id as string, width: landscape.width as number, height: landscape.height as number }
    : null;
}

export async function createBrandLp(input: {
  supabase: SupabaseClient;
  brandId: string;
  userId: string;
  step: (label: string, index: number, stage: PipelineStageId) => void;
}): Promise<{ takeId: string; writer: BrandLpBrief["writer"] }> {
  const { supabase, brandId, userId, step } = input;

  step("キットを読んでいます", 1, "input");
  const kit = await buildKitBrief(supabase, brandId);
  if (!kit.ok) throw new Error(kit.error);

  step("ブランドの特長とお客様の声を確かめています", 2, "extract");
  try {
    await ensureSiteContent(supabase, { brandId, userId, website: kit.brief.brand.website });
  } catch (error) {
    // The page could not be read just now. The LP is still made; those
    // sections fall to the frame and are marked.
    console.error("Site content reading failed:", error);
  }
  const [guesses, screen] = await Promise.all([loadGuesses(supabase, brandId), loadScreen(supabase, brandId)]);
  const context = lpContext(kit.brief, guesses, screen);

  step("節に当てはめて、文章を書いています", 3, "structure");
  const framed = frameLp(context);
  const written = await writeLp(context, framed);

  step("キットの色・書体・形をページに当てはめています", 4, "map");
  // Derived again on every read; computed here so a kit the page cannot use
  // fails the run instead of the first view.
  lpDesign(kit.brief);

  step("LPを保存しています", 5, "output");
  const brief: BrandLpBrief = {
    version: 1,
    lang: context.lang,
    kit: kit.brief,
    content: written.content,
    basis: framed.basis,
    visuals: { screen },
    read: { features: context.features?.value ?? [], voices: context.voices?.value ?? [] },
    writer: written.writer,
  };
  const created = await createTake(supabase, {
    brandId,
    templateId: "brand-lp",
    brief,
    title: `${kit.brief.brand.name} LP`,
    createdBy: userId,
  });
  if (!created.ok) throw new Error(created.error);

  // The page is derived from the brief on read; there is no file to wait for.
  const renderId = created.renderIds[0];
  if (renderId) {
    const ready = await supabase
      .from("take_renders")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", renderId);
    if (ready.error) throw new Error(ready.error.message);
  }
  return { takeId: created.takeId, writer: written.writer };
}
