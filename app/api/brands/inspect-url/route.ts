import { guardBrandRequest } from "@/lib/brand-access";
import type {
  BrandUrlInspection,
  OrganizationKind,
} from "@/lib/brand-detail";
import { assignPaletteRoles } from "@/lib/brand/site-palette";
import { inferOrganizationFacts } from "@/lib/brand-source-inspection";
import { captureSite, type SiteCapture } from "@/lib/campaign/capture";
import { scrapeUrl } from "@/lib/campaign/ingest";
import { normalizePublicHttpUrl } from "@/lib/public-url";

function nameFromTitle(title: string | null): string {
  if (!title) return "";
  return title.split(/\s+[|｜–—-]\s+/)[0]?.trim().slice(0, 160) ?? "";
}

function organizationKindFromName(name: string): OrganizationKind {
  if (/NPO法人|非営利|一般社団法人|一般財団法人/i.test(name)) return "nonprofit";
  if (/株式会社|合同会社|有限会社|Corporation|Company|\bInc\.?\b|\bLtd\.?\b/i.test(name)) {
    return "company";
  }
  return "other";
}

function detectedPalette(
  capture: SiteCapture | null,
  themeColor: string | null,
  colorHints: string[],
): Record<string, string> {
  if (!capture) {
    const colors = [themeColor, ...colorHints].filter(
      (value): value is string => Boolean(value && /^#[0-9a-f]{6}$/i.test(value)),
    );
    return Object.fromEntries([...new Set(colors)].slice(0, 5).map((color, index) => [`detected_${index + 1}`, color]));
  }

  const byWeight = (values: Array<{ hex: string; weight: number }>) =>
    [...values].sort((left, right) => right.weight - left.weight).map((value) => value.hex);

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

export async function POST(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { url?: unknown; scope?: unknown };
    if (typeof body.url !== "string") throw new Error("URLを入力してください");
    if (body.scope !== "organization" && body.scope !== "business") {
      throw new Error("取得対象が不正です");
    }
    const requestedUrl = normalizePublicHttpUrl(body.url).href;
    const page = await scrapeUrl(requestedUrl);
    const [capture, inferredFacts] = await Promise.all([
      captureSite(page.url, { faviconUrl: page.faviconUrl }),
      body.scope === "organization"
        ? inferOrganizationFacts(page)
        : Promise.resolve(null),
    ]);
    const name =
      body.scope === "business"
        ? nameFromTitle(page.title) || page.organizationHints[0] || ""
        : inferredFacts?.name || page.organizationHints[0] || nameFromTitle(page.title);
    const palette = detectedPalette(capture, page.themeColor, page.colorHints);
    const designTokens = capture?.designTokens ?? null;
    const evidence = [
      page.title ? `ページタイトル: ${page.title}` : null,
      page.organizationHints.length > 0
        ? `会社名候補: ${page.organizationHints.join("、")}`
        : null,
      Object.keys(palette).length > 0
        ? `ブランドカラー候補: ${Object.values(palette).join("、")}`
        : null,
      designTokens && Object.values(designTokens).some(Boolean)
        ? "表示中のWebページからフォント・余白などのデザイン要素を取得"
        : null,
      capture?.logoImage ? "ヘッダー周辺からロゴ候補を取得" : null,
    ].filter((value): value is string => Boolean(value));
    const inspection: BrandUrlInspection = {
      requestedUrl,
      finalUrl: page.url,
      name,
      organizationKind:
        body.scope === "organization"
          ? inferredFacts?.organizationKind ?? organizationKindFromName(name)
          : null,
      industry: inferredFacts?.industry ?? "",
      location: inferredFacts?.location ?? "",
      description: page.description?.trim().slice(0, 4000) ?? "",
      organizationHints: page.organizationHints,
      evidence,
      brandAssets:
        Object.keys(palette).length > 0 ||
        Boolean(capture?.logoSvg || capture?.logoImage) ||
        Boolean(designTokens && Object.values(designTokens).some(Boolean))
          ? {
              palette,
              designTokens,
              // Prefer the vector. The PNG stays as the fallback for sites
              // that only ever render their mark as an image.
              logo:
                capture?.logoSvg || capture?.logoImage
                  ? {
                      svg: capture.logoSvg,
                      data: capture.logoImage,
                      mediaType: capture.logoSvg
                        ? "image/svg+xml"
                        : "image/png",
                      sourceUrl: page.url,
                    }
                  : null,
            }
          : null,
    };
    return Response.json({ inspection }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "URLを取得できませんでした" },
      { status: 400 },
    );
  }
}
