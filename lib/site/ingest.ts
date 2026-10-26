import "server-only";

import * as cheerio from "cheerio";
import { fetchPublicUrl } from "@/lib/public-url";

// Reading a URL statically: the page's text, meta information, colour hints and
// the logo files it declares. Works without a browser; capture.ts adds what
// only rendering can see.

export interface RawServiceInfo {
  url: string;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  faviconUrl: string | null;
  themeColor: string | null;
  colorHints: string[];
  headings: string[];
  bodyText: string;
  /** Footer and structured organization hints are kept separately because
   * the visible body copy often names the service but not its operator. */
  footerText: string;
  organizationHints: string[];
  /** Logo files the static HTML itself declares (JSON-LD, meta, header imgs).
   * Works without a browser — the production runtime has no Chromium. */
  logoCandidates: DeclaredLogo[];
}

export type DeclaredLogoSource =
  | "json-ld"
  | "meta-logo"
  | "named-img"
  | "header-img"
  | "apple-touch-icon";

export interface DeclaredLogo {
  url: string;
  source: DeclaredLogoSource;
  alt: string | null;
  /** One line of evidence for the adjudicator ("header <img> alt=..."). */
  note: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function scrapeUrl(url: string): Promise<RawServiceInfo> {
  const res = await fetchPublicUrl(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`ページを取得できませんでした (HTTP ${res.status})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const base = new URL(res.url);

  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ??
    $(`meta[name="${name}"]`).attr("content") ??
    null;

  const title = meta("og:title") ?? ($("title").first().text().trim() || null);
  const description = meta("og:description") ?? meta("description");

  const ogImage = resolveMaybe(meta("og:image"), base);
  // Prefer icons sharp can decode (PNG/SVG): apple-touch-icon is almost
  // always a PNG, while bare /favicon.ico often defeats the logo fallback.
  const faviconUrl =
    resolveMaybe($('link[rel="apple-touch-icon"]').first().attr("href"), base) ??
    resolveMaybe(
      $('link[rel="icon"], link[rel="shortcut icon"]')
        .filter((_, el) => {
          const href = $(el).attr("href") ?? "";
          const type = $(el).attr("type") ?? "";
          return /png|svg/i.test(type) || /\.(png|svg)(\?|$)/i.test(href);
        })
        .first()
        .attr("href"),
      base
    ) ??
    resolveMaybe(
      $('link[rel="icon"], link[rel="shortcut icon"]').first().attr("href"),
      base
    ) ??
    new URL("/favicon.ico", base).href;

  const themeColor = meta("theme-color");

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length <= 120) headings.push(t);
  });

  const footerText = $("footer")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
  const organizationHints = extractOrganizationHints($, footerText);
  // Before the destructive cleanup below — JSON-LD lives in <script> tags.
  const logoCandidates = extractDeclaredLogos($, base);

  $("script, style, noscript, svg, nav, footer").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);

  return {
    url: res.url,
    title,
    description,
    ogImage,
    faviconUrl,
    themeColor,
    colorHints: extractColorHints(html, themeColor),
    headings: headings.slice(0, 30),
    bodyText,
    footerText,
    organizationHints,
    logoCandidates,
  };
}

// ---------- Declared logo candidates (static HTML, no browser) ----------

const LOGO_WORD = /logo|ロゴ/i;

/** Enumerate the logo files the HTML itself points at, most trustworthy first:
 * JSON-LD / meta self-declarations, then imgs that say "logo" in alt/class/src,
 * then any masthead img, then the apple-touch-icon. Deterministic — the pick
 * among them is the adjudicator's job (lib/site/logo-resolve). */
export function extractDeclaredLogos(
  $: cheerio.CheerioAPI,
  base: URL,
): DeclaredLogo[] {
  const out: DeclaredLogo[] = [];
  const seen = new Set<string>();
  const push = (
    href: string | null | undefined,
    source: DeclaredLogoSource,
    alt: string | null,
    note: string,
  ) => {
    const url = resolveMaybe(href ?? null, base);
    if (!url || !/^https?:/i.test(url)) return; // data:/blob: stay out
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, source, alt, note });
  };

  // 1. JSON-LD: Organization.logo / publisher.logo (string, {url}, ImageObject).
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const roots = Array.isArray(parsed) ? parsed : [parsed];
      const entries: unknown[] = [];
      for (const root of roots) {
        entries.push(root);
        const graph = (root as Record<string, unknown> | null)?.["@graph"];
        if (Array.isArray(graph)) entries.push(...graph);
      }
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const value = entry as Record<string, unknown>;
        const logo = value.logo ?? (value.publisher as Record<string, unknown> | undefined)?.logo;
        const url =
          typeof logo === "string"
            ? logo
            : logo && typeof logo === "object"
              ? (logo as Record<string, unknown>).url
              : null;
        if (typeof url === "string")
          push(url, "json-ld", null, "JSON-LD が logo として宣言");
      }
    } catch {
      // Invalid JSON-LD is common and should not block page ingestion.
    }
  });

  // 2. Meta / link self-declarations.
  push(
    $('meta[property="og:logo"]').attr("content") ??
      $('meta[itemprop="logo"]').attr("content"),
    "meta-logo",
    null,
    "meta が logo として宣言",
  );
  push($('link[rel="logo"]').attr("href"), "meta-logo", null, "link rel=logo");

  // 3. <img> elements, in confidence order. Named ("logo" in alt/class/src)
  //    beats merely sitting in the masthead.
  $("img").each((_, el) => {
    if (out.length >= 12) return;
    const img = $(el);
    const src = img.attr("src") ?? img.attr("data-src");
    if (!src) return;
    const alt = img.attr("alt") ?? "";
    const cls = `${img.attr("class") ?? ""} ${img.attr("id") ?? ""}`;
    const named =
      LOGO_WORD.test(alt) || LOGO_WORD.test(cls) || LOGO_WORD.test(src);
    const inMasthead =
      img.parents("header, nav").length > 0 ||
      img
        .parents()
        .toArray()
        .some((a) =>
          /header|masthead|navbar|logo|brand/i.test(
            `${$(a).attr("class") ?? ""} ${$(a).attr("id") ?? ""}`,
          ),
        );
    const note = `${inMasthead ? "ヘッダー" : "ページ内"}の<img>${alt.trim() ? ` alt="${alt.trim().slice(0, 60)}"` : ""}`;
    if (named) push(src, "named-img", alt || null, note);
    else if (inMasthead) push(src, "header-img", alt || null, note);
  });

  // 4. apple-touch-icon: nearly always a decodable PNG of the mark.
  push(
    $('link[rel="apple-touch-icon"]').first().attr("href"),
    "apple-touch-icon",
    null,
    "apple-touch-icon",
  );

  const order: Record<DeclaredLogoSource, number> = {
    "json-ld": 0,
    "meta-logo": 1,
    "named-img": 2,
    "header-img": 3,
    "apple-touch-icon": 4,
  };
  return out.sort((a, b) => order[a.source] - order[b.source]).slice(0, 6);
}

function extractOrganizationHints(
  $: cheerio.CheerioAPI,
  footerText: string
): string[] {
  const hints = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const value = entry as Record<string, unknown>;
        const type = value["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (!types.some((item) => typeof item === "string" && /Organization|Corporation|LocalBusiness|Person/i.test(item))) continue;
        if (typeof value.name === "string" && value.name.trim()) {
          hints.add(value.name.trim());
        }
        if (typeof value.legalName === "string" && value.legalName.trim()) {
          hints.add(value.legalName.trim());
        }
      }
    } catch {
      // Invalid JSON-LD is common and should not block page ingestion.
    }
  });

  for (const match of footerText.matchAll(
    /(?:株式会社|合同会社|有限会社|一般社団法人|一般財団法人|NPO法人)[^｜|・·©]{1,60}|[^｜|・·©]{1,60}(?:株式会社|合同会社|有限会社)/g
  )) {
    const value = match[0].replace(/\s+/g, " ").trim();
    if (value.length <= 80) hints.add(value);
  }
  return [...hints].slice(0, 8);
}

function resolveMaybe(href: string | null | undefined, base: URL): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// Collect frequent hex colors from inline styles / style blocks as brand hints.
function extractColorHints(html: string, themeColor: string | null): string[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const c = m[0].toLowerCase();
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const boring = new Set(["#ffffff", "#000000"]);
  const hints = [...counts.entries()]
    .filter(([c]) => !boring.has(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([c]) => c);
  if (themeColor && /^#[0-9a-fA-F]{6}$/.test(themeColor)) {
    hints.unshift(themeColor.toLowerCase());
  }
  return [...new Set(hints)];
}

export type FetchedImage = {
  data: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

// Fetch an image (e.g. og:image) as base64 for passing to Claude vision.
export async function fetchImageAsBase64(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetchPublicUrl(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const mediaType = ct.includes("png")
      ? ("image/png" as const)
      : ct.includes("webp")
        ? ("image/webp" as const)
        : ct.includes("gif")
          ? ("image/gif" as const)
          : ct.includes("jpeg") || ct.includes("jpg")
            ? ("image/jpeg" as const)
            : null;
    if (!mediaType) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return { data: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}
