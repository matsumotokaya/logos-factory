import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignTokens } from "@/lib/site/evidence";

/** What reading a site found for the brand's look: roles, tokens, the mark. */
export type BrandImport = {
  palette: Record<string, string>;
  designTokens: DesignTokens | null;
  logo: {
    /**
     * The site's own vector master, when it ships one. Sites serve .svg for
     * the mark and raster for photography, so this is the file the capture
     * should be judged on — carrying only the rendered PNG is what made a site
     * with a perfectly good logo end up with its favicon.
     */
    svg: string | null;
    /** base64 raster, used when there is no vector to be had. */
    data: string | null;
    mediaType: string;
    sourceUrl: string;
  } | null;
};
import { newLogoId } from "@/lib/id";
import {
  adoptBrandKnowledge,
  knowledgeProfilesByBrand,
  mergeProfile,
  type AdoptKnowledgeField,
} from "@/lib/brand/knowledge";
import { logoPreviewUrl } from "@/lib/brand/logo-preview";

type Supabase = SupabaseClient;

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const PALETTE_PATHS: Record<string, string> = {
  primary: "palette.primary",
  accent: "palette.accent",
  background: "palette.background",
  surface: "palette.surface",
  text: "palette.text",
  mode: "palette.mode",
  palette_source: "palette.source",
  font_style: "typography.font_style",
};

const TOKEN_PATHS: Record<string, string> = {
  body_font: "typography.body_font",
  heading_font: "typography.heading_font",
  button_radius: "tokens.button_radius",
  button_padding: "tokens.button_padding",
  section_spacing: "tokens.section_spacing",
  container_width: "tokens.container_width",
};

/**
 * A raster mark still has to reach the logo tables, and those only accept SVG
 * (`create_brand_logo_with_presentation` requires a non-empty p_svg). Wrapping
 * the bitmap keeps one storage shape instead of two half-supported ones — but
 * it is a wrapper, not a vector, and `provenance.raster_wrapped` says so rather
 * than leaving later code to guess from the markup.
 */
function wrapRaster(base64: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 256"><image width="512" height="256" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${base64}"/></svg>`;
}

function analysisFor(svg: string, primary: string | undefined) {
  const hex = /^#[0-9a-f]{6}$/i.test(primary ?? "") ? primary! : "#101012";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b) / 255;
  const k = 1 - max;
  const cmyk =
    max === 0
      ? [0, 0, 0, 100]
      : [
          Math.round(((max - r / 255) / max) * 100),
          Math.round(((max - g / 255) / max) * 100),
          Math.round(((max - b / 255) / max) * 100),
          Math.round(k * 100),
        ];
  // viewBox is read off the file when it has one. The rest of the analysis
  // (anchors, handles, area-weighted colors) needs a browser, and
  // normalizeLogoData() completes it when the presentation renders.
  const viewBoxMatch = /viewBox\s*=\s*"([\d.\-\s]+)"/i.exec(svg);
  const parts = viewBoxMatch
    ? viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)
    : [];
  const viewBox =
    parts.length === 4 && parts.every(Number.isFinite)
      ? { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
      : { x: 0, y: 0, w: 512, h: 256 };
  return {
    viewBox,
    colors: [{ hex, rgb: { r, g, b }, cmyk, share: 1 }],
    anchors: [],
    handles: [],
    fileName: "website-logo.svg",
  };
}

export interface SavedBrandAssets {
  profile: {
    inheritsParent: boolean;
    status: "confirmed";
    value: Record<string, unknown>;
  };
  logo: {
    id: string;
    title: string;
    role: string;
    visibility: string;
    previewUrl: string | null;
  } | null;
}

/**
 * Apply a URL capture to one Brand: adopt the palette and design tokens as
 * knowledge, then create or refresh its logo.
 *
 * Re-running is the point. The previous implementation created the logo only
 * when the brand had none, so a first capture that picked the wrong image
 * could never be corrected from the product — and a capture is exactly the
 * kind of thing that gets better as the extractor improves.
 */
export async function saveBrandAssetsFromUrl({
  supabase,
  userId,
  brandId,
  brandName,
  role,
  sourceUrl,
  value,
}: {
  supabase: Supabase;
  userId: string;
  brandId: string;
  brandName: string;
  role: string;
  sourceUrl: string;
  value: BrandImport;
}): Promise<SavedBrandAssets> {
  const currentKnowledge = await knowledgeProfilesByBrand(supabase, [brandId]);
  if (currentKnowledge.error) {
    throw new Error("ブランドプロフィールを確認できませんでした");
  }
  const profileValue = mergeProfile(currentKnowledge.data.get(brandId) ?? {}, {
    ...(Object.keys(value.palette).length > 0
      ? { palette: value.palette }
      : {}),
    ...(value.designTokens ? { design_tokens: value.designTokens } : {}),
  });

  const fields: AdoptKnowledgeField[] = [];
  for (const [key, fieldPath] of Object.entries(PALETTE_PATHS)) {
    const fieldValue = value.palette[key];
    if (typeof fieldValue === "string" && fieldValue) {
      fields.push({ field_path: fieldPath, layer: "expression", value: fieldValue });
    }
  }
  for (const [key, fieldPath] of Object.entries(TOKEN_PATHS)) {
    const fieldValue =
      value.designTokens?.[key as keyof NonNullable<BrandImport["designTokens"]>];
    if (typeof fieldValue === "string" && fieldValue) {
      fields.push({ field_path: fieldPath, layer: "expression", value: fieldValue });
    }
  }
  const sourceRef = { source: "site_capture", source_url: sourceUrl };
  if (fields.length > 0) {
    const adopted = await adoptBrandKnowledge(supabase, {
      brandId,
      fields,
      sourceKind: "url_extraction",
      sourceRef,
      userId,
    });
    if (!adopted.ok) throw new Error("ブランドプロフィールを保存できませんでした");
  }
  await retireValuesThisSourceNoLongerFinds({
    supabase,
    brandId,
    sourceRef,
    stillFound: fields.map((field) => field.field_path),
  });

  const logo = await saveCapturedLogo({
    supabase,
    brandId,
    brandName,
    role,
    sourceUrl,
    value,
  });

  return {
    profile: { inheritsParent: false, status: "confirmed", value: profileValue },
    logo,
  };
}

/**
 * Drop the values this source used to supply and no longer does.
 *
 * Adoption upserts field by field, so a value the extractor got wrong once
 * outlived every correction: re-running with a better rule simply did not
 * mention the field, and the bad row stayed adopted forever. That is the same
 * defect §17.6 recorded for one-shot imports, in a slower form — and it broke
 * the same principle, that a source can be re-run and the output must follow
 * (§17.4). wealthpark-lab.com kept an accent of #abb8c3 (a WordPress preset)
 * through two corrected captures because of it.
 *
 * Scope is deliberately narrow: only values whose adopted claim came from THIS
 * source. A colour somebody typed, or one adopted from an uploaded guideline,
 * is not this crawl's to retract.
 */
async function retireValuesThisSourceNoLongerFinds({
  supabase,
  brandId,
  sourceRef,
  stillFound,
}: {
  supabase: Supabase;
  brandId: string;
  sourceRef: Record<string, unknown>;
  stillFound: string[];
}): Promise<void> {
  const { data: claims } = await supabase
    .from("brand_knowledge_claims")
    .select("id")
    .eq("brand_id", brandId)
    .eq("source_kind", "url_extraction")
    .contains("source_ref", sourceRef);
  const claimIds = (claims ?? []).map((claim) => claim.id as string);
  if (claimIds.length === 0) return;

  const { data: values } = await supabase
    .from("brand_knowledge_values")
    .select("id, field_path, adopted_claim_id")
    .eq("brand_id", brandId)
    .in("adopted_claim_id", claimIds);

  const stale = (values ?? [])
    .filter((value) => !stillFound.includes(value.field_path as string))
    .map((value) => value.id as string);
  if (stale.length === 0) return;

  await supabase.from("brand_knowledge_values").delete().in("id", stale);
}

async function saveCapturedLogo({
  supabase,
  brandId,
  brandName,
  role,
  sourceUrl,
  value,
}: {
  supabase: Supabase;
  brandId: string;
  brandName: string;
  role: string;
  sourceUrl: string;
  value: BrandImport;
}): Promise<SavedBrandAssets["logo"]> {
  const captured = value.logo;
  if (!captured) return null;

  let svg: string;
  let rasterWrapped = false;
  if (captured.svg) {
    svg = captured.svg;
  } else if (captured.data) {
    const buffer = Buffer.from(captured.data, "base64");
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error("取得したロゴ画像が不正です");
    }
    svg = wrapRaster(captured.data);
    rasterWrapped = true;
  } else {
    return null;
  }

  const analysis = analysisFor(svg, value.palette.primary);
  const provenance = {
    source: "site_capture",
    source_url: sourceUrl,
    raster_wrapped: rasterWrapped,
    confirmed: false,
  };

  const existing = await supabase
    .from("logos")
    .select("id, title, visibility")
    .eq("subject_entity_id", brandId)
    .eq("role", role)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error("ロゴを確認できませんでした");

  if (existing.data) {
    // Refresh in place. Replacing the row would orphan the presentation Take
    // and the canonical slot that 0041 attached to this logo id.
    const logoId = existing.data.id as string;
    const candidate = await supabase
      .from("logo_candidates")
      .select("id")
      .eq("logo_id", logoId)
      .eq("is_primary", true)
      .maybeSingle();
    if (candidate.error || !candidate.data) {
      throw new Error("ロゴの主候補を確認できませんでした");
    }
    const updated = await supabase
      .from("logo_candidates")
      .update({
        svg,
        analysis,
        media_type: "image/svg+xml",
        file_path: null,
        label: "公式サイトから取得（仮）",
        source_url: captured.sourceUrl,
        asset_status: "provisional",
        provenance,
      })
      .eq("id", candidate.data.id);
    if (updated.error) throw new Error("ロゴを更新できませんでした");
    return {
      id: logoId,
      title: existing.data.title as string,
      role,
      visibility: existing.data.visibility as string,
      previewUrl: await logoPreviewUrl([
        { is_primary: true, svg, media_type: "image/svg+xml", file_path: null },
      ]),
    };
  }

  const logoId = newLogoId();
  const created = await supabase.rpc("create_brand_logo_with_presentation", {
    p_brand_id: brandId,
    p_logo_id: logoId,
    p_title: brandName,
    p_role: role,
    p_visibility: "draft",
    p_svg: svg,
    p_analysis: analysis,
  });
  if (created.error) {
    throw new Error("ロゴとプレゼンを登録できませんでした");
  }

  // The master and its presentation are committed atomically by the RPC;
  // capture provenance is added afterwards so it can be confirmed later.
  const candidate = await supabase
    .from("logo_candidates")
    .select("id")
    .eq("logo_id", logoId)
    .eq("is_primary", true)
    .maybeSingle();
  if (candidate.data) {
    await supabase
      .from("logo_candidates")
      .update({
        label: "公式サイトから取得（仮）",
        media_type: "image/svg+xml",
        source_url: captured.sourceUrl,
        asset_status: "provisional",
        provenance,
      })
      .eq("id", candidate.data.id);
  }

  return {
    id: logoId,
    title: brandName,
    role,
    visibility: "draft",
    previewUrl: await logoPreviewUrl([
      { is_primary: true, svg, media_type: "image/svg+xml", file_path: null },
    ]),
  };
}
