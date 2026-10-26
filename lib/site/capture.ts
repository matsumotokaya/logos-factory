import "server-only";

import sharp from "sharp";
import type { CaptureEvidence, DesignTokens } from "./evidence";

// Stage 1 of the Tier S palette pipeline: render the real page in headless
// Chromium and collect what a human actually sees — screenshots plus a
// computed-style color histogram weighted by on-screen area, interactive
// element colors, :root CSS variables and logo pixels.
//
// Playwright is imported dynamically: on hosts without Chromium (e.g. the
// current Vercel runtime) captureSite() returns null and the pipeline falls
// back to the static-analysis path with palette_source: "generated".

export interface SiteCapture {
  url: string;
  /** base64 JPEG screenshots for the VLM adjudicator */
  screenshots: {
    desktop: string; // 1440×900 viewport, stored as 1024×640 JPEG
    fullPage: string | null; // top of the page, downscaled
    mobile: string | null; // 390×844 above-the-fold JPEG
  };
  evidence: CaptureEvidence;
  /** header logo element screenshot (or favicon fallback), base64 PNG */
  logoImage: string | null;
  /** inline-SVG logo with computed fills baked in (vector master), when the
   *  detected logo element was an <svg> */
  logoSvg: string | null;
  /** Top scored logo picks (crop + evidence), #1 first. logoImage/logoSvg stay
   *  the deterministic #1; the runners-up exist for the VLM adjudicator. */
  logoCandidates: CapturedLogoCandidate[];
  /** best-effort design guideline hints from computed CSS */
  designTokens: DesignTokens;
  /** everything the second in-page pass read. null when that pass threw. */
  profile: SiteProfile | null;
  /** the site's own images, downloaded — key visual first (see IMAGE_BUDGET) */
  images: FetchedSiteImage[];
}

/**
 * Everything about the site that is not colour: the type scale, the shape of
 * its components, what the page is made of, who to contact and where else the
 * brand is. Collected by COLLECT_SITE_PROFILE in one in-page pass.
 *
 * Every field is nullable and nothing is inferred. A site that does not state
 * its phone number leaves `telephone` null, which the brand page renders as
 * まだわからない — the one thing this must never do is fill a gap with a guess
 * (deliverable-architecture §8).
 */
export interface SiteProfile {
  typography: {
    headingWeight: string | null;
    bodyWeight: string | null;
    headingSize: string | null;
    bodySize: string | null;
    /** unitless ratio, as a string ("1.75") */
    lineHeight: string | null;
    letterSpacing: string | null;
    /** Google Fonts / Typekit hrefs and @font-face families actually declared. */
    fontSources: string[];
  };
  tokens: {
    buttonWeight: string | null;
    buttonShadow: string | null;
    cardRadius: string | null;
    cardShadow: string | null;
    borderWidth: string | null;
    borderColor: string | null;
  };
  layout: {
    sections: { kind: string | null; heading: string | null; height: number }[];
    navItems: string[];
    /** what the first screen is painted with: image / gradient / video / plain */
    heroKind: string | null;
    ctaLabel: string | null;
    /** characters per 1000 px² over the first three screens */
    density: number | null;
  };
  site: {
    lang: string | null;
    darkMode: boolean | null;
    title: string | null;
    description: string | null;
    tagline: string | null;
  };
  contact: { telephone: string | null; email: string | null; address: string | null };
  social: Record<string, string>;
  copyright: string | null;
  images: SiteImageRef[];
}

/** An image the page is built out of, as the DOM describes it. */
export interface SiteImageRef {
  src: string;
  alt: string | null;
  naturalWidth: number | null;
  naturalHeight: number | null;
  renderedWidth: number;
  renderedHeight: number;
  /** distance from the top of the document, in px */
  top: number;
  role: "keyvisual" | "hero" | "content" | "texture";
  /** a tiling background — the only way a texture is visible in a DOM */
  repeats: boolean;
}

/** One of those images, actually downloaded and ready to be stored. */
export interface FetchedSiteImage extends SiteImageRef {
  /** base64 of the original bytes — not re-encoded, so the file stays the site's own */
  data: string;
  mediaType: string;
  bytes: number;
}

export interface CapturedLogoCandidate {
  /** normalized PNG crop of the rendered element, base64 */
  image: string | null;
  /** inline-svg serialization (vector master) when the element was an <svg> */
  svg: string | null;
  /** referenced file URL when the element was an <img> */
  src: string | null;
  score: number;
  /** one evidence line for the adjudicator */
  note: string;
}

const NAV_TIMEOUT = 30_000;

/**
 * How much of a site's imagery one capture will carry home.
 *
 * A cap, not a sample: the collector already ranks key visual → hero → texture
 * → content and biggest-first, so what falls off the end is the least useful
 * thing on the page. `minBytes` drops tracking pixels and spacer GIFs that
 * survived the DOM-size filter by being stretched.
 */
const IMAGE_BUDGET = {
  count: 16,
  minBytes: 4_000,
  maxBytes: 8_000_000,
  totalBytes: 40_000_000,
};
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type RawPageColors = {
  bg: [string, number][];
  txt: [string, number][];
  border: [string, number][];
  grad: [string, number][]; // gradient background stops, weighted by area
  inter: [string, number][]; // key: "hex|role"
  vars: { name: string; hex: string }[];
  tokens: {
    bodyFont: string | null;
    headingFont: string | null;
    buttonRadius: string | null;
    buttonPadding: string | null;
    sectionSpacing: string | null;
    containerWidth: string | null;
  };
};

// Runs inside the page. Kept as a plain-JS source string (not a function)
// so no bundler (tsx/esbuild keepNames, webpack, turbopack) can inject
// helpers like `__name` that don't exist in the browser context.
const COLLECT_PAGE_COLORS = String.raw`(() => {
  const MAX_ELEMENTS = 6000;
  const bg = new Map();
  const txt = new Map();
  const border = new Map();
  const grad = new Map();
  const inter = new Map();

  const parse = (s) => {
    if (!s) return null;
    const hexM = s.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hexM) {
      let h = hexM[1].toLowerCase();
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      return "#" + h;
    }
    const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 0.5) return null;
    }
    const h = (n) => (+n).toString(16).padStart(2, "0");
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  };
  const add = (map, hex, w) => {
    if (hex && w > 0) map.set(hex, (map.get(hex) || 0) + w);
  };

  const vw = window.innerWidth;
  // Consider the top few viewports — where the brand actually shows.
  const scanH = Math.min(document.documentElement.scrollHeight, window.innerHeight * 5);

  let count = 0;
  for (const el of Array.from(document.querySelectorAll("*"))) {
    if (++count > MAX_ELEMENTS) break;
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    if (r.width < 2 || r.height < 2 || top > scanH) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1)
      continue;

    const area = Math.min(r.width, vw) * Math.min(r.height, scanH);
    add(bg, parse(cs.backgroundColor), area);

    // Gradient backgrounds (hero key visuals live here — invisible to the
    // backgroundColor histogram): weight each stop by the painted area.
    const bi = cs.backgroundImage;
    if (bi && bi.indexOf("gradient(") !== -1 && area > 4000) {
      const stops = bi.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [];
      for (const s of stops.slice(0, 6)) {
        add(grad, parse(s), area / Math.max(stops.length, 1));
      }
    }

    let textLen = 0;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) textLen += (n.textContent || "").trim().length;
    }
    if (textLen > 0) {
      const fs = parseFloat(cs.fontSize) || 16;
      add(txt, parse(cs.color), textLen * fs * fs);
    }

    const bw = parseFloat(cs.borderTopWidth) || 0;
    if (bw > 0) add(border, parse(cs.borderTopColor), (r.width + r.height) * 2 * bw);

    if (el instanceof SVGElement) add(bg, parse(cs.fill), area * 0.5);

    if (
      el.matches(
        'a, button, [role="button"], input[type="submit"], input[type="button"], summary'
      )
    ) {
      const b = parse(cs.backgroundColor);
      if (b) inter.set(b + "|background", (inter.get(b + "|background") || 0) + 1);
      const c = parse(cs.color);
      if (c) inter.set(c + "|text", (inter.get(c + "|text") || 0) + 1);
    }
  }

  // :root CSS custom properties that resolve to a color. Chromium exposes
  // custom properties when iterating the computed style declaration.
  const vars = [];
  try {
    const rootCs = getComputedStyle(document.documentElement);
    for (let i = 0; i < rootCs.length && vars.length < 60; i++) {
      const name = rootCs[i];
      if (!name.startsWith("--")) continue;
      const hex = parse(rootCs.getPropertyValue(name).trim());
      if (hex) vars.push({ name, hex });
    }
  } catch (e) {
    // best effort
  }

  // Best-effort design tokens: the most common value wins.
  const mode = (xs) => {
    const m = new Map();
    for (const x of xs) if (x) m.set(x, (m.get(x) || 0) + 1);
    let best = null, n = 0;
    for (const [k, v] of m) if (v > n) { best = k; n = v; }
    return best;
  };
  // Brand font families: the leading real families of the declared stack.
  // Skips generic keywords and synthetic "<X> Fallback" faces (next/font
  // metric shims). Keeps up to two — JP sites routinely pair a Latin face
  // with a JP face (e.g. "Ubuntu, Noto Sans JP") and both matter.
  const GENERIC = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|cursive|fantasy|math|emoji|-apple-system|BlinkMacSystemFont|Segoe UI|Helvetica( Neue)?|Arial|Roboto Fallback)$/i;
  const renderedFont = (el) => {
    if (!el) return null;
    const fam = getComputedStyle(el).fontFamily || "";
    const families = fam
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((f) => f && !GENERIC.test(f) && !/ Fallback$/i.test(f));
    return families.length ? families.slice(0, 2).join(", ") : null;
  };
  const tokens = { bodyFont: null, headingFont: null, buttonRadius: null, buttonPadding: null, sectionSpacing: null, containerWidth: null };
  try {
    // Body font: measure on a real paragraph when possible (body itself is
    // often reset-styled).
    let textEl = null;
    for (const p of Array.from(document.querySelectorAll("p, li")).slice(0, 200)) {
      const t = (p.textContent || "").trim();
      const r = p.getBoundingClientRect();
      if (t.length >= 20 && r.width > 100) { textEl = p; break; }
    }
    tokens.bodyFont = renderedFont(textEl || document.body);
    tokens.headingFont = renderedFont(document.querySelector("h1, h2")) || tokens.bodyFont;

    // Button tokens: only CTA-looking elements (saturated or dark solid
    // background, button proportions). Circular icon buttons (radius 50%,
    // near-square) previously polluted this — exclude them.
    const chromaOf = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    const lumaOf = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    const radii = [], paddings = [];
    for (const el of Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"]')).slice(0, 400)) {
      // CTA styling often lives on the anchor's single wrapper child, not on
      // the <a> itself — follow one level down when the anchor is unpainted.
      let cs = getComputedStyle(el);
      let bgHex = parse(cs.backgroundColor);
      if (!bgHex && el.children.length === 1) {
        const child = el.children[0];
        const ccs = getComputedStyle(child);
        const cHex = parse(ccs.backgroundColor);
        if (cHex) { cs = ccs; bgHex = cHex; }
      }
      if (!bgHex) continue;
      if (chromaOf(bgHex) < 24 && lumaOf(bgHex) > 96) continue; // not a CTA color
      const r = el.getBoundingClientRect();
      if (r.width < 72 || r.height < 30 || r.width / r.height < 1.6) continue; // icons/circles out
      const rad = cs.borderTopLeftRadius;
      if (rad && !rad.endsWith("%")) {
        // normalize pills: radius >= half height means "fully rounded"
        radii.push(parseFloat(rad) >= r.height / 2 ? "999px" : rad);
      }
      paddings.push(cs.paddingTop + " " + cs.paddingLeft);
    }
    tokens.buttonRadius = mode(radii);
    tokens.buttonPadding = mode(paddings);

    const secPads = [];
    for (const el of Array.from(document.querySelectorAll("section")).slice(0, 60)) {
      const pt = parseFloat(getComputedStyle(el).paddingTop) || 0;
      if (pt >= 24) secPads.push(Math.round(pt / 8) * 8 + "px");
    }
    tokens.sectionSpacing = mode(secPads);

    const widths = [];
    let scanned = 0;
    for (const el of Array.from(document.querySelectorAll("div, main, section")).slice(0, 800)) {
      if (++scanned > 800) break;
      const cs = getComputedStyle(el);
      if (cs.maxWidth && cs.maxWidth.endsWith("px") && parseFloat(cs.maxWidth) >= 640 && cs.marginLeft === cs.marginRight) {
        const r = el.getBoundingClientRect();
        if (r.width >= 500) widths.push(cs.maxWidth);
      }
    }
    tokens.containerWidth = mode(widths);
  } catch (e) {
    // best effort
  }

  return {
    bg: Array.from(bg.entries()),
    txt: Array.from(txt.entries()),
    border: Array.from(border.entries()),
    grad: Array.from(grad.entries()),
    inter: Array.from(inter.entries()),
    vars,
    tokens,
  };
})()`;

// Runs inside the page: everything about the site that is not colour.
//
// The colour histogram answers "what is this brand painted in". This answers
// the rest of what a designer copies off a site before rebuilding it — the
// type scale, the shape of a button, what the page is made of, who to contact,
// where else they are, and which images are actually load-bearing.
//
// Same conventions as COLLECT_PAGE_COLORS: a plain-JS source string so no
// bundler can inject helpers that do not exist in the browser, everything
// wrapped so one bad site cannot take the whole capture down with it, and a
// null for anything not found — never a guess (§8: 意味は発明しない).
const COLLECT_SITE_PROFILE = String.raw`(() => {
  const out = {
    typography: { headingWeight: null, bodyWeight: null, headingSize: null, bodySize: null, lineHeight: null, letterSpacing: null, fontSources: [] },
    tokens: { buttonWeight: null, buttonShadow: null, cardRadius: null, cardShadow: null, borderWidth: null, borderColor: null },
    layout: { sections: [], navItems: [], heroKind: null, ctaLabel: null, density: null },
    site: { lang: null, darkMode: null, title: null, description: null, tagline: null },
    contact: { telephone: null, email: null, address: null },
    social: {},
    copyright: null,
    images: [],
  };
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) + "px" : null;
  };
  const mode = (xs) => {
    const m = new Map();
    for (const x of xs) if (x !== null && x !== undefined && x !== "") m.set(x, (m.get(x) || 0) + 1);
    let best = null, n = 0;
    for (const [k, v] of m) if (v > n) { best = k; n = v; }
    return best;
  };
  const parseHex = (s) => {
    if (!s) return null;
    const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 0.35) return null;
    }
    const h = (x) => (+x).toString(16).padStart(2, "0");
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  };
  const visible = (el, cs) =>
    cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.1;

  // ---- type scale -------------------------------------------------------
  try {
    // The LARGEST visible heading, not the first in the DOM. On this site's
    // own pages the first h1 is a 15px tagline sitting in the masthead, and
    // reporting that as 見出しの大きさ would tell every renderer to set
    // headlines smaller than the body text.
    let h = null, hSize = 0;
    for (const el of Array.from(document.querySelectorAll("h1, h2")).slice(0, 60)) {
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      if (!(el.textContent || "").trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 10) continue;
      const fs = parseFloat(cs.fontSize) || 0;
      if (fs > hSize) { hSize = fs; h = el; }
    }
    if (h) {
      const cs = getComputedStyle(h);
      out.typography.headingWeight = cs.fontWeight || null;
      out.typography.headingSize = px(cs.fontSize);
      const ls = parseFloat(cs.letterSpacing);
      out.typography.letterSpacing = Number.isFinite(ls) ? (Math.round(ls * 100) / 100) + "px" : "normal";
    }
    const sizes = [], weights = [], leadings = [];
    for (const p of Array.from(document.querySelectorAll("p, li")).slice(0, 200)) {
      const t = (p.textContent || "").trim();
      if (t.length < 20) continue;
      const cs = getComputedStyle(p);
      if (!visible(p, cs)) continue;
      const fs = parseFloat(cs.fontSize);
      if (!Number.isFinite(fs) || fs < 9 || fs > 32) continue;
      sizes.push(Math.round(fs) + "px");
      weights.push(cs.fontWeight);
      const lh = parseFloat(cs.lineHeight);
      if (Number.isFinite(lh) && fs > 0) leadings.push((Math.round((lh / fs) * 100) / 100).toFixed(2));
    }
    out.typography.bodySize = mode(sizes);
    out.typography.bodyWeight = mode(weights);
    out.typography.lineHeight = mode(leadings);
  } catch (e) { /* best effort */ }

  // Where the faces actually come from. A family name the renderer cannot load
  // is a different page; a Google Fonts href or an @font-face src is the thing
  // that makes the same type reproducible.
  try {
    const srcs = new Set();
    for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"]'))) {
      const href = link.getAttribute("href") || "";
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny|typesquare|fontplus/i.test(href)) {
        srcs.add(href.split("?")[0].replace(/^\/\//, "https://"));
      }
    }
    for (const sheet of Array.from(document.styleSheets).slice(0, 40)) {
      let rules = null;
      try { rules = sheet.cssRules; } catch (e) { rules = null; } // cross-origin
      if (!rules) continue;
      for (const rule of Array.from(rules).slice(0, 800)) {
        if (rule.constructor && rule.constructor.name === "CSSFontFaceRule") {
          const fam = (rule.style.getPropertyValue("font-family") || "").replace(/["']/g, "").trim();
          if (fam) srcs.add("@font-face " + fam);
        }
      }
    }
    out.typography.fontSources = Array.from(srcs).slice(0, 8);
  } catch (e) { /* best effort */ }

  // ---- component shape --------------------------------------------------
  try {
    const weights = [], shadows = [], labels = [];
    for (const el of Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"]')).slice(0, 400)) {
      let cs = getComputedStyle(el);
      let bg = parseHex(cs.backgroundColor);
      if (!bg && el.children.length === 1) {
        const ccs = getComputedStyle(el.children[0]);
        const c = parseHex(ccs.backgroundColor);
        if (c) { cs = ccs; bg = c; }
      }
      if (!bg) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 72 || r.height < 30 || r.width / r.height < 1.6) continue;
      weights.push(cs.fontWeight);
      shadows.push(cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "none");
      const t = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (t && t.length <= 24 && r.top < window.innerHeight * 2) labels.push(t);
    }
    out.tokens.buttonWeight = mode(weights);
    out.tokens.buttonShadow = mode(shadows);
    out.layout.ctaLabel = labels.length ? labels[0] : null;

    // Cards: a bordered or shadowed box holding text. Their radius is a
    // different decision from the button's and generated pages get it wrong
    // by borrowing the button's.
    const radii = [], cardShadows = [], borderWidths = [], borderColors = [];
    for (const el of Array.from(document.querySelectorAll("article, li, div")).slice(0, 900)) {
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 160 || r.height < 100 || r.width > 900) continue;
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const shadow = cs.boxShadow && cs.boxShadow !== "none";
      if (!shadow && bw < 0.5) continue;
      if ((el.textContent || "").trim().length < 12) continue;
      const rad = cs.borderTopLeftRadius;
      if (rad && !rad.endsWith("%")) radii.push(px(rad));
      if (shadow) cardShadows.push(cs.boxShadow);
      if (bw >= 0.5) {
        borderWidths.push((Math.round(bw * 10) / 10) + "px");
        const bc = parseHex(cs.borderTopColor);
        if (bc) borderColors.push(bc);
      }
    }
    out.tokens.cardRadius = mode(radii);
    out.tokens.cardShadow = mode(cardShadows);
    out.tokens.borderWidth = mode(borderWidths);
    out.tokens.borderColor = mode(borderColors);
  } catch (e) { /* best effort */ }

  // ---- what the page is made of ----------------------------------------
  try {
    const KINDS = [
      ["hero", /hero|jumbotron|kv|mainvisual|main-visual|firstview/i],
      ["feature", /feature|benefit|service|strength|point|merit/i],
      ["pricing", /pricing|price|plan|料金|プラン/i],
      ["faq", /faq|question|よくある/i],
      ["testimonial", /voice|testimonial|review|case|導入事例|お客様/i],
      ["news", /news|blog|article|topics|お知らせ/i],
      ["contact", /contact|inquiry|form|問い合わせ|お問合せ/i],
      ["about", /about|company|profile|会社|概要/i],
      ["cta", /cta|apply|entry|download|trial|申し込み|無料/i],
    ];
    const nodes = Array.from(document.querySelectorAll("body > *, main > *, body > div > section, main section"));
    const seen = new Set();
    for (const el of nodes.slice(0, 120)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 120 || r.width < 240) continue;
      const cls = (typeof el.className === "string" ? el.className : "") + " " + (el.id || "");
      const head = (el.querySelector("h1, h2, h3") || {}).textContent || "";
      const hay = cls + " " + head;
      let kind = null;
      for (const [name, re] of KINDS) if (re.test(hay)) { kind = name; break; }
      out.layout.sections.push({
        kind: kind,
        heading: head.trim().replace(/\s+/g, " ").slice(0, 60) || null,
        height: Math.round(r.height),
      });
      if (out.layout.sections.length >= 24) break;
    }

    const nav = document.querySelector("header nav, nav, header");
    if (nav) {
      const items = [];
      for (const a of Array.from(nav.querySelectorAll("a")).slice(0, 40)) {
        const t = (a.textContent || "").trim().replace(/\s+/g, " ");
        if (t && t.length <= 24 && items.indexOf(t) === -1) items.push(t);
      }
      out.layout.navItems = items.slice(0, 12);
    }

    // What the first screen is actually made of. A template that opens on a
    // photograph and a template that opens on a flat colour are different
    // videos, and this is the only place that says which one this site is.
    let heroKind = "plain";
    const probe = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight * 0.4));
    let node = probe, depth = 0;
    while (node && depth < 8) {
      const cs = getComputedStyle(node);
      const bi = cs.backgroundImage || "";
      if (node.tagName === "VIDEO" || node.querySelector && node.querySelector("video")) { heroKind = "video"; break; }
      if (bi.indexOf("url(") !== -1) { heroKind = "image"; break; }
      if (bi.indexOf("gradient(") !== -1) { heroKind = "gradient"; break; }
      node = node.parentElement;
      depth++;
    }
    if (heroKind === "plain") {
      for (const img of Array.from(document.querySelectorAll("img")).slice(0, 60)) {
        const r = img.getBoundingClientRect();
        if (r.top < window.innerHeight && r.width > window.innerWidth * 0.5 && r.height > 200) { heroKind = "image"; break; }
      }
    }
    out.layout.heroKind = heroKind;

    // Density: how much text the first three screens carry, in characters per
    // 1000 px². Not a judgement, a measurement — the label is applied later.
    const area = window.innerWidth * Math.min(document.documentElement.scrollHeight, window.innerHeight * 3);
    const chars = (document.body.innerText || "").slice(0, 20000).length;
    if (area > 0) out.layout.density = Math.round((chars / area) * 1000 * 100) / 100;
  } catch (e) { /* best effort */ }

  // ---- the site's own statements about itself ---------------------------
  try {
    out.site.lang = document.documentElement.getAttribute("lang") || null;
    out.site.title = (document.title || "").trim() || null;
    const desc = document.querySelector('meta[name="description"]');
    out.site.description = desc ? (desc.getAttribute("content") || "").trim() || null : null;
    const h1 = document.querySelector("h1");
    out.site.tagline = h1 ? (h1.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120) || null : null;
    // Dark mode is a fact about the stylesheet, not a guess from the palette.
    let dark = false;
    for (const sheet of Array.from(document.styleSheets).slice(0, 40)) {
      let rules = null;
      try { rules = sheet.cssRules; } catch (e) { rules = null; }
      if (!rules) continue;
      for (const rule of Array.from(rules).slice(0, 1200)) {
        if (rule.media && String(rule.media.mediaText).indexOf("prefers-color-scheme") !== -1) { dark = true; break; }
      }
      if (dark) break;
    }
    if (!dark) {
      const cs = getComputedStyle(document.documentElement).colorScheme || "";
      if (cs.indexOf("dark") !== -1) dark = true;
    }
    out.site.darkMode = dark;
  } catch (e) { /* best effort */ }

  // ---- contact, social, copyright ---------------------------------------
  try {
    const footer = document.querySelector("footer") || document.body;
    const footText = (footer.innerText || "").slice(0, 4000);
    const tel = footer.querySelector('a[href^="tel:"]');
    if (tel) out.contact.telephone = (tel.getAttribute("href") || "").replace(/^tel:/, "").trim() || null;
    const mail = footer.querySelector('a[href^="mailto:"]');
    if (mail) out.contact.email = (mail.getAttribute("href") || "").replace(/^mailto:/, "").split("?")[0].trim() || null;
    const cr = footText.match(/(?:©|\(c\)|&copy;|Copyright)[^\n]{0,120}/i);
    if (cr) out.copyright = cr[0].trim().replace(/\s+/g, " ").slice(0, 160);

    const NETS = [
      ["x", /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i],
      ["instagram", /^https?:\/\/(www\.)?instagram\.com\//i],
      ["facebook", /^https?:\/\/(www\.)?facebook\.com\//i],
      ["youtube", /^https?:\/\/(www\.)?youtube\.com\//i],
      ["linkedin", /^https?:\/\/(www\.)?linkedin\.com\//i],
      ["github", /^https?:\/\/(www\.)?github\.com\//i],
    ];
    for (const a of Array.from(document.querySelectorAll("a[href]")).slice(0, 800)) {
      const href = a.href || "";
      for (const [name, re] of NETS) {
        if (!out.social[name] && re.test(href)) out.social[name] = href.split("?")[0];
      }
    }

    // JSON-LD is the site stating these as data rather than as layout, so it
    // wins over anything scraped out of the footer's text.
    for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 12)) {
      let data = null;
      try { data = JSON.parse(s.textContent || "null"); } catch (e) { data = null; }
      if (!data) continue;
      const nodes = Array.isArray(data) ? data : (data["@graph"] && Array.isArray(data["@graph"]) ? data["@graph"] : [data]);
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        if (n.telephone && !out.contact.telephone) out.contact.telephone = String(n.telephone).trim();
        if (n.email && !out.contact.email) out.contact.email = String(n.email).replace(/^mailto:/, "").trim();
        const addr = n.address;
        if (addr && !out.contact.address) {
          if (typeof addr === "string") out.contact.address = addr.trim();
          else if (typeof addr === "object") {
            const parts = [addr.postalCode, addr.addressRegion, addr.addressLocality, addr.streetAddress].filter(Boolean);
            if (parts.length) out.contact.address = parts.join(" ").trim();
          }
        }
        const same = n.sameAs;
        if (same) {
          for (const href of (Array.isArray(same) ? same : [same])) {
            for (const [name, re] of NETS) if (re.test(String(href))) out.social[name] = String(href).split("?")[0];
          }
        }
      }
    }
  } catch (e) { /* best effort */ }

  // ---- the images the page is actually built out of ---------------------
  //
  // Ranked, not dumped: a site has hundreds of images and almost all of them
  // are icons. What a deliverable can use is the handful that are large, load
  // early and carry the page — plus whatever tiles as a background, which is
  // the only way a texture shows up in a DOM.
  try {
    const seen = new Set();
    const push = (rec) => {
      if (!rec.src || seen.has(rec.src)) return;
      if (rec.src.indexOf("data:") === 0) return; // already inline; not worth a fetch
      seen.add(rec.src);
      out.images.push(rec);
    };
    const ogMeta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    const ogSrc = ogMeta ? ogMeta.getAttribute("content") : null;

    for (const img of Array.from(document.querySelectorAll("img")).slice(0, 300)) {
      const cs = getComputedStyle(img);
      if (!visible(img, cs)) continue;
      const r = img.getBoundingClientRect();
      const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
      if (r.width < 120 || r.height < 90) continue;
      if (nw && nh && nw * nh < 40000) continue; // 200x200 or smaller: an icon
      const src = img.currentSrc || img.getAttribute("src") || "";
      if (!src) continue;
      let abs = src;
      try { abs = new URL(src, location.href).href; } catch (e) { /* keep raw */ }
      const top = r.top + window.scrollY;
      const cover = r.width >= window.innerWidth * 0.6 && r.height >= 240;
      push({
        src: abs,
        alt: (img.getAttribute("alt") || "").trim().slice(0, 120) || null,
        naturalWidth: nw || null,
        naturalHeight: nh || null,
        renderedWidth: Math.round(r.width),
        renderedHeight: Math.round(r.height),
        top: Math.round(top),
        role: top < window.innerHeight && cover ? "hero" : "content",
        repeats: false,
      });
    }

    for (const el of Array.from(document.querySelectorAll("*")).slice(0, 4000)) {
      const cs = getComputedStyle(el);
      const bi = cs.backgroundImage || "";
      if (bi.indexOf("url(") === -1) continue;
      if (!visible(el, cs)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 90) continue;
      const m = bi.match(/url\(["']?([^"')]+)["']?\)/);
      if (!m) continue;
      let abs = m[1];
      try { abs = new URL(m[1], location.href).href; } catch (e) { /* keep raw */ }
      // A tiling pattern repeats AND is drawn at its own size. A hero
      // photograph is usually set to repeat too — nothing stops it — but it
      // is sized cover, and calling it a texture files a 700KB photograph
      // under 地紋 where no deliverable will ever find it.
      const size = (cs.backgroundSize || "").toLowerCase();
      const repeats =
        (cs.backgroundRepeat || "").indexOf("no-repeat") === -1 &&
        size.indexOf("cover") === -1 &&
        size.indexOf("contain") === -1;
      const top = r.top + window.scrollY;
      push({
        src: abs,
        alt: null,
        naturalWidth: null,
        naturalHeight: null,
        renderedWidth: Math.round(r.width),
        renderedHeight: Math.round(r.height),
        top: Math.round(top),
        role: repeats ? "texture" : (top < window.innerHeight ? "hero" : "content"),
        repeats: repeats,
      });
      if (out.images.length >= 60) break;
    }

    if (ogSrc) {
      let abs = ogSrc;
      try { abs = new URL(ogSrc, location.href).href; } catch (e) { /* keep raw */ }
      const existing = out.images.filter((i) => i.src === abs)[0];
      if (existing) existing.role = "keyvisual";
      else out.images.unshift({ src: abs, alt: null, naturalWidth: null, naturalHeight: null, renderedWidth: 0, renderedHeight: 0, top: 0, role: "keyvisual", repeats: false });
    }

    // Biggest first, hero and key visual ahead of the rest: whatever gets
    // dropped by the fetch budget should be the least useful thing.
    const rank = { keyvisual: 0, hero: 1, texture: 2, content: 3 };
    out.images.sort((a, b) => {
      const ra = rank[a.role] === undefined ? 9 : rank[a.role];
      const rb = rank[b.role] === undefined ? 9 : rank[b.role];
      if (ra !== rb) return ra - rb;
      return (b.renderedWidth * b.renderedHeight) - (a.renderedWidth * a.renderedHeight);
    });
    out.images = out.images.slice(0, 40);
  } catch (e) { /* best effort */ }

  return out;
})()`;

// Runs inside the page: score every plausible logo element and tag the best
// one for an element screenshot. The old approach took the FIRST selector
// match and gave up when it was unsuitable — on real sites that first match
// is routinely a 0x0 icon-sprite <svg>, so the actual header logo (match #3)
// was never tried. Also serializes inline-SVG logos with computed fills baked
// in: a real vector master, which is exactly this product's currency.
const PICK_LOGO_ELEMENT = String.raw`(() => {
  // Named markup: a <header>/<nav>, a "logo"/"brand" class, an alt saying so,
  // or a link to the site root. Sites built by visual builders have none of
  // these — no semantic tags, class="sd appear", empty alt — so the broad
  // selector below adds "any image inside any link", and NAMED decides how
  // much that candidate has to prove.
  const NAMED = 'header img, header svg, nav img, nav svg, [class*="logo" i] img, [class*="logo" i] svg, img[alt*="logo" i], a[href="/"] img, a[href="/"] svg';
  const SEL = NAMED + ', a img, a svg';
  const seen = new Set();
  const cands = [];
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 8 || r.width > 640 || r.height > 240) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;

    // An unnamed link image is only a logo where a logo actually sits. Without
    // this, every thumbnail in a card grid becomes a candidate and one of them
    // can out-score the real mark on position alone.
    const named = el.matches(NAMED);
    if (!named && r.top >= 200) continue;

    let hasLogoName = false, inHomeLink = false;
    let a = el, depth = 0;
    while (a && depth < 5) {
      const cls = (typeof a.className === "string" ? a.className : (a.getAttribute && a.getAttribute("class")) || "");
      const idc = (cls + " " + (a.id || "") + " " + ((a.getAttribute && a.getAttribute("alt")) || "") + " " + ((a.getAttribute && a.getAttribute("aria-label")) || "")).toLowerCase();
      if (idc.indexOf("logo") !== -1 || idc.indexOf("brand") !== -1) hasLogoName = true;
      if (a.tagName === "A") {
        // The masthead of a section links to that section, not to "/". Treat
        // the site root, this page, and any ancestor of it as "home" — all of
        // them are the link a masthead mark carries.
        let u = null;
        try { u = new URL(a.getAttribute("href") || "", location.href); } catch (e) { u = null; }
        if (u && u.origin === location.origin) {
          const there = u.pathname.replace(/\/+$/, "") || "/";
          const here = location.pathname.replace(/\/+$/, "") || "/";
          if (there === "/" || there === here || here.indexOf(there + "/") === 0) inHomeLink = true;
        }
      }
      a = a.parentElement;
      depth++;
    }

    // A vector file referenced from the masthead is a logo almost every time:
    // sites ship .svg for the mark and raster for photography.
    const rawSrc = el.tagName.toLowerCase() === "img"
      ? (el.currentSrc || el.getAttribute("src") || "")
      : "";
    const vectorFile = /\.svg(\?|#|$)/i.test(rawSrc) || rawSrc.indexOf("data:image/svg") === 0;

    let score = 0;
    if (hasLogoName) score += 3;
    if (inHomeLink) score += 3;
    if (vectorFile) score += 3;
    if (r.top < 160) score += 2;
    if (r.left < window.innerWidth * 0.4) score += 1;
    const ar = r.width / r.height;
    if (ar >= 1.6 && ar <= 12) score += 2;       // wordmark proportions
    else if (ar >= 0.8) score += 1;               // square-ish mark
    const area = r.width * r.height;
    if (area >= 600 && area <= 60000) score += 1;
    if (area < 900 && !hasLogoName) score -= 2;   // hamburger-sized icons
    if (!hasLogoName && !inHomeLink && el.closest('button, [role="button"]')) score -= 2;

    cands.push({ el, score, r, area, hasLogoName, inHomeLink, vectorFile });
  }
  cands.sort((x, y) => y.score - x.score || y.area - x.area);
  if (!cands[0] || cands[0].score < 3) return null;

  // Inline <svg> → serialize with computed fills/strokes inlined so the
  // markup survives outside the page's stylesheets.
  const serialize = (el, r) => {
    try {
      const clone = el.cloneNode(true);
      const src = [el].concat(Array.from(el.querySelectorAll("*")));
      const dst = [clone].concat(Array.from(clone.querySelectorAll("*")));
      for (let i = 0; i < src.length && i < dst.length; i++) {
        const c = getComputedStyle(src[i]);
        const d = dst[i];
        if (!d.setAttribute) continue;
        if (c.fill) d.setAttribute("fill", c.fill);
        if (c.stroke && c.stroke !== "none") {
          d.setAttribute("stroke", c.stroke);
          if (parseFloat(c.strokeWidth)) d.setAttribute("stroke-width", c.strokeWidth);
        }
        const op = parseFloat(c.opacity);
        if (op >= 0 && op < 1) d.setAttribute("opacity", String(op));
        const fo = parseFloat(c.fillOpacity);
        if (fo >= 0 && fo < 1) d.setAttribute("fill-opacity", String(fo));
        d.removeAttribute("class");
      }
      clone.removeAttribute("data-logos-pick");
      clone.setAttribute("width", String(Math.round(r.width)));
      clone.setAttribute("height", String(Math.round(r.height)));
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const out = clone.outerHTML;
      return out.length > 300000 ? null : out;
    } catch (e) {
      return null;
    }
  };

  // Top 3 distinct-looking picks, each tagged for an element screenshot. The
  // #1 heuristic pick stays the deterministic default; the runners-up exist so
  // an adjudicator can overrule a mis-scored pick (VLM, choose-only).
  for (const n of Array.from(document.querySelectorAll("[data-logos-pick]"))) n.removeAttribute("data-logos-pick");
  const picks = [];
  const usedSrc = new Set();
  for (const cand of cands) {
    if (picks.length >= 3 || cand.score < 3) break;
    const tag = cand.el.tagName.toLowerCase();
    const src = tag === "img"
      ? (cand.el.currentSrc || cand.el.getAttribute("src") || null)
      : null;
    if (src && usedSrc.has(src)) continue; // same file rendered twice
    if (src) usedSrc.add(src);
    cand.el.setAttribute("data-logos-pick", String(picks.length + 1));
    const alt = (cand.el.getAttribute && (cand.el.getAttribute("alt") || cand.el.getAttribute("aria-label"))) || "";
    const marks = [];
    if (cand.hasLogoName) marks.push("logo/brandの名前");
    if (cand.inHomeLink) marks.push("ホームへのリンク内");
    if (cand.vectorFile) marks.push("SVGファイル参照");
    const note = "実画面の<" + tag + ">" +
      (alt ? ' alt="' + alt.slice(0, 60) + '"' : "") +
      " " + Math.round(cand.r.width) + "×" + Math.round(cand.r.height) +
      "px @(" + Math.round(cand.r.left) + "," + Math.round(cand.r.top) + ")" +
      (marks.length ? " — " + marks.join("・") : "");
    picks.push({
      tag,
      score: cand.score,
      svg: tag === "svg" ? serialize(cand.el, cand.r) : null,
      src,
      note,
    });
  }
  return picks.length ? { picks } : null;
})()`;

async function toJpegBase64(png: Buffer, width: number, maxHeight = 3000): Promise<string> {
  let img = sharp(png).resize({ width, withoutEnlargement: true });
  const meta = await img.jpeg({ quality: 72 }).toBuffer({ resolveWithObject: true });
  if (meta.info.height > maxHeight) {
    img = sharp(meta.data).extract({ left: 0, top: 0, width: meta.info.width, height: maxHeight });
    return (await img.jpeg({ quality: 72 }).toBuffer()).toString("base64");
  }
  return meta.data.toString("base64");
}

/** Dominant colors of the rendered viewport, share 0..1 — this is what a
 *  human sees, including hero photography and CSS-gradient key visuals that
 *  no computed-style histogram can observe. */
async function screenPixelColors(png: Buffer): Promise<{ hex: string; share: number }[]> {
  try {
    const { data } = await sharp(png)
      .resize(240, 240, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const counts = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] & 0xf0;
      const g = data[i + 1] & 0xf0;
      const b = data[i + 2] & 0xf0;
      counts.set(`${r},${g},${b}`, (counts.get(`${r},${g},${b}`) ?? 0) + 1);
      total++;
    }
    if (total === 0) return [];
    const h = (n: number) => (n | 8).toString(16).padStart(2, "0");
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, n]) => {
        const [r, g, b] = key.split(",").map(Number);
        return { hex: `#${h(r)}${h(g)}${h(b)}`, share: n / total };
      })
      .filter((c) => c.share >= 0.015);
  } catch {
    return [];
  }
}

/** Dominant colors of an image buffer (logo / favicon / og:image), share 0..1. */
export async function imageDominantColors(
  buf: Buffer
): Promise<{ hex: string; share: number }[]> {
  return dominantColors(buf);
}

/** Dominant colors of an image buffer (logo / favicon), share 0..1. */
async function dominantColors(buf: Buffer): Promise<{ hex: string; share: number }[]> {
  try {
    const { data } = await sharp(buf)
      .resize(48, 48, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const counts = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // transparent
      // quantize to 16 levels per channel to merge JPEG noise
      const r = data[i] & 0xf0;
      const g = data[i + 1] & 0xf0;
      const b = data[i + 2] & 0xf0;
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
    if (total === 0) return [];
    const h = (n: number) => (n | 8).toString(16).padStart(2, "0"); // center of the bucket
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, n]) => {
        const [r, g, b] = key.split(",").map(Number);
        return { hex: `#${h(r)}${h(g)}${h(b)}`, share: n / total };
      })
      .filter((c) => c.share >= 0.02);
  } catch {
    return [];
  }
}

/** Public wrapper: normalize any decodable image (SVG included — sharp
 *  rasterizes it) to a compact base64 PNG for VLM input and previews. */
export async function normalizeLogoPng(buf: Buffer): Promise<string | null> {
  return toLogoPng(buf);
}

/** Normalize a logo/favicon image to a compact PNG (max 512px wide). */
async function toLogoPng(buf: Buffer): Promise<string | null> {
  try {
    const out = await sharp(buf)
      .resize({ width: 512, withoutEnlargement: true })
      .png()
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null; // e.g. .ico favicons sharp can't decode
  }
}

function rawToEvidence(
  raw: RawPageColors,
  logoColors: { hex: string; share: number }[],
  pixels: { hex: string; share: number }[]
): CaptureEvidence {
  return {
    backgrounds: raw.bg.map(([hex, weight]) => ({ hex, weight })),
    texts: raw.txt.map(([hex, weight]) => ({ hex, weight })),
    borders: raw.border.map(([hex, weight]) => ({ hex, weight })),
    gradients: (raw.grad ?? []).map(([hex, weight]) => ({ hex, weight })),
    pixels: pixels.map((p) => ({ hex: p.hex, weight: p.share })),
    interactive: raw.inter.map(([key, count]) => {
      const [hex, role] = key.split("|") as [string, "background" | "text"];
      return { hex, role, count };
    }),
    cssVars: raw.vars,
    logoColors,
  };
}

/** page.evaluate, retried once when an in-page navigation (redirect, carousel
 *  link, meta refresh) destroys the execution context mid-run. Without this a
 *  single navigation kills the whole capture — screenshots, palette and logo. */
async function evaluateSettled<T>(
  page: import("playwright").Page,
  script: string
): Promise<T> {
  try {
    return (await page.evaluate(script)) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Execution context was destroyed|navigation/i.test(msg)) throw e;
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
    return (await page.evaluate(script)) as T;
  }
}

export async function captureSite(
  url: string,
  opts: { faviconUrl?: string | null } = {}
): Promise<SiteCapture | null> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    return null; // playwright not installed on this host
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await pw.chromium.launch({ headless: true });

    // --- desktop pass: evidence + screenshots ---
    const context = await browser.newContext({
      viewport: DESKTOP,
      locale: "ja-JP",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
    } catch {
      // networkidle never settles on some sites; take what has loaded
    }
    await page.waitForTimeout(1200);

    const raw = await evaluateSettled<RawPageColors>(page, COLLECT_PAGE_COLORS);

    const desktopPng = await page.screenshot({ type: "png" });
    const desktopShot = await toJpegBase64(desktopPng, 1024);
    // What a human actually sees above the fold — catches hero photography
    // and gradient key visuals invisible to the computed-style histogram.
    const pixels = await screenPixelColors(desktopPng);

    let fullPage: string | null = null;
    try {
      const scrollHeight = (await page.evaluate(
        "document.documentElement.scrollHeight"
      )) as number;
      const clipH = Math.min(scrollHeight, 4500);
      const fullPng = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: DESKTOP.width, height: clipH },
      });
      fullPage = await toJpegBase64(fullPng, 640, 2600);
    } catch {
      fullPage = null;
    }

    // Logo: score all candidates in-page, screenshot the top picks, and keep
    // the inline-SVG vector when a logo element is an <svg>.
    let logoColors: { hex: string; share: number }[] = [];
    let logoImage: string | null = null;
    let logoSvg: string | null = null;
    const logoCandidates: CapturedLogoCandidate[] = [];
    try {
      const picked = await evaluateSettled<{
        picks: {
          tag: string;
          score: number;
          svg: string | null;
          src: string | null;
          note: string;
        }[];
      } | null>(page, PICK_LOGO_ELEMENT);
      const picks = picked?.picks ?? [];
      const primary = picks[0] ?? null;
      if (primary) {
        logoSvg = primary.svg;

        // <img src="…"> logo: fetch the referenced file through the page's
        // browser context. An .svg file is the vector master (same value as
        // an inline <svg>); any raster file at natural resolution beats the
        // rendered-size element screenshot below.
        if (!logoSvg && primary.src) {
          try {
            const abs = new URL(primary.src, page.url()).href;
            const resp = await page.request.get(abs, { timeout: 10_000 });
            if (resp.ok()) {
              const body = await resp.body();
              const ct = resp.headers()["content-type"] ?? "";
              const isSvg =
                ct.includes("svg") ||
                new URL(abs).pathname.toLowerCase().endsWith(".svg");
              if (isSvg && body.length < 300_000) {
                // Scripts are inert in the <img data:> contexts we embed
                // into, but strip them anyway.
                logoSvg = body
                  .toString("utf8")
                  .replace(/<script[\s\S]*?<\/script>/gi, "");
              } else if (!isSvg && body.length < 3_000_000) {
                try {
                  logoImage = await toLogoPng(body);
                  logoColors = await dominantColors(body);
                } catch {
                  // not a decodable raster — fall back to the screenshot
                }
              }
            }
          } catch {
            // fetch failed — the element screenshot below still works
          }
        }

        for (let i = 0; i < picks.length; i++) {
          const el = page.locator(`[data-logos-pick="${i + 1}"]`).first();
          let crop: string | null = null;
          try {
            const png = await el.screenshot({ type: "png" });
            crop = await toLogoPng(png);
            if (i === 0) {
              if (logoColors.length === 0) logoColors = await dominantColors(png);
              if (!logoImage) logoImage = crop;
            }
          } catch {
            // element gone or zero-sized — keep the candidate without a crop
          }
          logoCandidates.push({
            image: crop,
            svg: picks[i].svg,
            src: picks[i].src,
            score: picks[i].score,
            note: picks[i].note,
          });
        }
      }
    } catch {
      // logo detection is best-effort
    }
    if ((logoColors.length === 0 || !logoImage) && opts.faviconUrl) {
      try {
        const res = await fetch(opts.faviconUrl, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (logoColors.length === 0) logoColors = await dominantColors(buf);
          if (!logoImage) logoImage = await toLogoPng(buf);
        }
      } catch {
        // ignore
      }
    }

    // --- profile pass: everything that is not colour ---
    let profile: SiteProfile | null = null;
    try {
      profile = await evaluateSettled<SiteProfile>(page, COLLECT_SITE_PROFILE);
    } catch {
      profile = null; // one bad site must not cost the whole capture
    }

    // --- the site's own images ---
    //
    // Downloaded through the page's request context so that referer, cookies
    // and any auth the page itself needed still apply — a plain fetch() gets
    // 403 from most CDNs that serve a real site's photography.
    const images: FetchedSiteImage[] = [];
    if (profile?.images?.length) {
      let spent = 0;
      for (const ref of profile.images) {
        if (images.length >= IMAGE_BUDGET.count || spent >= IMAGE_BUDGET.totalBytes) break;
        try {
          const resp = await page.request.get(ref.src, { timeout: 15_000 });
          if (!resp.ok()) continue;
          const body = await resp.body();
          if (body.length < IMAGE_BUDGET.minBytes || body.length > IMAGE_BUDGET.maxBytes) continue;
          const mediaType = (resp.headers()["content-type"] ?? "").split(";")[0].trim();
          if (!/^image\//.test(mediaType)) continue;
          spent += body.length;
          images.push({
            ...ref,
            data: body.toString("base64"),
            mediaType,
            bytes: body.length,
          });
        } catch {
          // one image failing is not a capture failing
        }
      }
    }

    await context.close();

    // --- mobile pass: screenshot only ---
    let mobile: string | null = null;
    try {
      const mctx = await browser.newContext({
        viewport: MOBILE,
        locale: "ja-JP",
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      const mpage = await mctx.newPage();
      try {
        await mpage.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      } catch {
        // best effort
      }
      await mpage.waitForTimeout(800);
      mobile = await toJpegBase64(await mpage.screenshot({ type: "png" }), 480);
      await mctx.close();
    } catch {
      mobile = null;
    }

    return {
      url,
      screenshots: { desktop: desktopShot, fullPage, mobile },
      evidence: rawToEvidence(raw, logoColors, pixels),
      logoImage,
      logoSvg,
      logoCandidates,
      profile,
      images,
      designTokens: {
        body_font: raw.tokens?.bodyFont ?? null,
        heading_font: raw.tokens?.headingFont ?? null,
        button_radius: raw.tokens?.buttonRadius ?? null,
        button_padding: raw.tokens?.buttonPadding ?? null,
        section_spacing: raw.tokens?.sectionSpacing ?? null,
        container_width: raw.tokens?.containerWidth ?? null,
      },
    };
  } catch (e) {
    console.error("captureSite failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** Screenshot self-contained HTML (the generated LP) for the verification loop. */
export async function screenshotHtml(html: string): Promise<string | null> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    return null;
  }
  let browser: import("playwright").Browser | null = null;
  try {
    browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: DESKTOP });
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(400);
    return await toJpegBase64(await page.screenshot({ type: "png" }), 1024);
  } catch (e) {
    console.error("screenshotHtml failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
