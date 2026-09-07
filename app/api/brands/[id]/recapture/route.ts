// Read this brand's site again, and keep everything it says.
//
// The two paths that read a URL had drifted apart. Creation ran the full
// pipeline (render, adjudicate, generate) and wrote knowledge; re-import went
// through `inspect-url`, which returns a small JSON the browser carries back to
// a PATCH — a shape that can hold a palette and one logo and nothing else. So a
// brand created before the frame was widened had no way to gain the rest, and
// the only way to see what the product had learned to collect was to register
// the same site a second time as a new brand.
//
// This route is the re-import of §19.3: it appends what the site says now,
// adopts only what a rule measured, and never overwrites a value a person
// decided. It deliberately does not regenerate deliverables — remaking an LP or
// a video stays each deliverable's own button.

import { guardLabsRequest } from "@/lib/labs-access";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import { captureSite, type SiteCapture } from "@/lib/campaign/capture";
import { scrapeUrl } from "@/lib/campaign/ingest";
import { normalizePublicHttpUrl } from "@/lib/public-url";
import { assignPaletteRoles } from "@/lib/brand/site-palette";
import { siteKnowledge } from "@/lib/brand/site-knowledge";
import { saveSiteMaterials } from "@/lib/brand/site-materials";
import {
  adoptBrandKnowledge,
  appendBrandKnowledgeClaims,
} from "@/lib/brand/knowledge";
import { saveBrandAssetsFromUrl } from "@/lib/brand/import-assets";

/** The five roles, read off the rendered page by rule alone — no model. */
function paletteFrom(
  capture: SiteCapture,
  themeColor: string | null,
  colorHints: string[],
): Record<string, string> {
  const byWeight = (values: Array<{ hex: string; weight: number }>) =>
    [...values].sort((left, right) => right.weight - left.weight).map((v) => v.hex);
  return assignPaletteRoles({
    logoColors: [...capture.evidence.logoColors]
      .sort((left, right) => right.share - left.share)
      .map((value) => value.hex),
    interactive: [...capture.evidence.interactive].sort(
      (left, right) => right.count - left.count,
    ),
    backgrounds: byWeight(capture.evidence.backgrounds),
    texts: byWeight(capture.evidence.texts),
    hints: [themeColor ?? "", ...colorHints],
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const brand = await supabase
    .from("brand_entities")
    .select("id, name, website")
    .eq("id", brandId)
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

  // The body may name a URL; otherwise the brand's own website is the source.
  // `source_url` is not unique and is not identity (§19.3) — it is only where
  // to look.
  let requested: string;
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    const candidate =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : ((brand.data.website as string | null) ?? "");
    if (!candidate) throw new Error("このブランドにはサイトURLが登録されていません");
    requested = normalizePublicHttpUrl(candidate).href;
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "URLを読み取れませんでした",
      },
      { status: 400 },
    );
  }

  const page = await scrapeUrl(requested);
  const capture = await captureSite(page.url, { faviconUrl: page.faviconUrl });
  if (!capture) {
    // Without a browser there is nothing to measure, and writing the static
    // hints as if they were measurements is the exact conflation this work
    // removed. Say so instead.
    return Response.json(
      {
        error:
          "この環境ではページを描画できないため、取り込めませんでした（Chromiumが必要です）",
      },
      { status: 503 },
    );
  }

  const capturedAt = new Date().toISOString();
  const sourceRef = { source: "site_recapture", source_url: page.url, at: capturedAt };
  const palette = paletteFrom(capture, page.themeColor, page.colorHints);

  // Palette, tokens and the mark, through the path that already owns them:
  // it updates an existing logo in place rather than orphaning its
  // presentation take, and retires values this source no longer finds.
  const assets = await saveBrandAssetsFromUrl({
    supabase,
    userId: user.id,
    brandId,
    brandName: (brand.data.name as string) ?? "",
    role: "brand",
    sourceUrl: page.url,
    value: {
      palette,
      designTokens: capture.designTokens,
      logo:
        capture.logoSvg || capture.logoImage
          ? {
              svg: capture.logoSvg,
              data: capture.logoImage,
              mediaType: capture.logoSvg ? "image/svg+xml" : "image/png",
              sourceUrl: page.url,
            }
          : null,
    },
  });

  // Everything else the page said: the type scale, the component shapes, the
  // sections, the contact details, the social accounts.
  const knowledge = siteKnowledge(capture, capturedAt);
  const claimed = await appendBrandKnowledgeClaims(supabase, {
    brandId,
    fields: knowledge.claims,
    sourceKind: "url_extraction",
    sourceRef,
    userId: user.id,
  });
  if (!claimed.ok) {
    return Response.json({ error: claimed.error }, { status: 500 });
  }
  let adoptedCount = 0;
  if (knowledge.adopt.length > 0) {
    const adopted = await adoptBrandKnowledge(supabase, {
      brandId,
      fields: knowledge.adopt,
      sourceKind: "url_extraction",
      sourceRef,
      userId: user.id,
    });
    if (!adopted.ok) {
      return Response.json({ error: adopted.error }, { status: 500 });
    }
    adoptedCount = adopted.adopted;
  }

  // Files last, and never fatal: a brand that gained its measurements but lost
  // a screenshot to a storage hiccup is still better off than before the run.
  let files = { saved: [] as { label: string }[], skipped: 0, note: null as string | null };
  try {
    files = await saveSiteMaterials({
      supabase,
      userId: user.id,
      brandId,
      capture,
    });
  } catch (error) {
    console.error("Site material capture failed:", error);
  }

  return Response.json(
    {
      url: page.url,
      capturedAt,
      adopted: adoptedCount,
      claims: claimed.appended,
      files: files.saved.length,
      filesSkipped: files.skipped,
      note: files.note,
      logo: assets.logo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
