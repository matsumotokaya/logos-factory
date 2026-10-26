import "server-only";

import { fetchPublicUrl } from "@/lib/public-url";
import {
  imageDominantColors,
  normalizeLogoPng,
  type SiteCapture,
} from "./capture";
import type { DeclaredLogo, RawServiceInfo } from "./ingest";
import {
  adjudicateLogo,
  type LlmUsage,
  type LogoAdjudicationCandidate,
} from "./logo-adjudicate";

// Stage 1c — decide WHICH mark is the logo.
//
// Enumeration is deterministic and rule-based (the rendered-page picks from
// capture.ts, the self-declared files from ingest.ts). The pick among them is
// judgment, and rules cannot see that a masthead image is a certification
// badge — so when more than one candidate exists, a VLM chooses. Choose-only:
// the adjudicator can select a candidate or say "none", never invent one.
//
// This stage works without Chromium: on hosts where captureSite() returns
// null (the production runtime), the declared candidates alone are fetched
// and adjudicated, so a plain WordPress site still yields its real logo.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const SOURCE_LABELS: Record<DeclaredLogo["source"], string> = {
  "json-ld": "JSON-LD宣言",
  "meta-logo": "meta宣言",
  "named-img": "HTMLのlogo名指し",
  "header-img": "HTMLヘッダー",
  "apple-touch-icon": "タッチアイコン",
};

export type LogoResolution =
  | {
      kind: "logo";
      svg: string | null;
      image: string | null; // base64 PNG
      colors: { hex: string; share: number }[];
      sourceLabel: string;
      adjudicated: boolean;
      rationale: string | null;
      examined: number;
      usage: LlmUsage | null;
    }
  | { kind: "none"; rationale: string; examined: number; usage: LlmUsage | null };

interface InternalCandidate {
  id: string;
  origin: "capture" | "declared";
  captureIndex: number; // 0 = the deterministic #1 pick
  image: string | null;
  svg: string | null;
  srcUrl: string | null;
  bytes: Buffer | null; // fetched raster at natural resolution
  note: string;
  sourceLabel: string;
}

type FetchedLogoFile =
  | { kind: "svg"; text: string }
  | { kind: "raster"; buffer: Buffer }
  | null;

async function fetchLogoFile(url: string): Promise<FetchedLogoFile> {
  try {
    const res = await fetchPublicUrl(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    const isSvg =
      ct.includes("svg") || new URL(url).pathname.toLowerCase().endsWith(".svg");
    if (isSvg) {
      if (buf.length >= 300_000) return null;
      return {
        kind: "svg",
        text: buf.toString("utf8").replace(/<script[\s\S]*?<\/script>/gi, ""),
      };
    }
    if (buf.length >= 3_000_000) return null;
    return { kind: "raster", buffer: buf };
  } catch {
    return null;
  }
}

/** Declared candidates minus the files the capture picks already cover. */
export function dedupeDeclared(
  declared: DeclaredLogo[],
  captureSrcUrls: (string | null)[],
): DeclaredLogo[] {
  const used = new Set(
    captureSrcUrls.filter((u): u is string => Boolean(u)).map(stripQuery),
  );
  return declared.filter((d) => !used.has(stripQuery(d.url)));
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export async function resolveLogo(input: {
  raw: RawServiceInfo | null;
  capture: SiteCapture | null;
}): Promise<LogoResolution | null> {
  const candidates: InternalCandidate[] = [];

  const capturePicks = input.capture?.logoCandidates ?? [];
  capturePicks.forEach((pick, i) => {
    candidates.push({
      id: `c${candidates.length + 1}`,
      origin: "capture",
      captureIndex: i,
      image: pick.image,
      svg: pick.svg,
      srcUrl: pick.src,
      bytes: null,
      note: pick.note,
      sourceLabel: "実画面キャプチャ",
    });
  });

  const declared = dedupeDeclared(
    input.raw?.logoCandidates ?? [],
    capturePicks.map((p) => p.src),
  ).slice(0, 4);
  for (const d of declared) {
    const fetched = await fetchLogoFile(d.url);
    if (!fetched) continue;
    if (fetched.kind === "svg") {
      // sharp rasterizes SVG, so the adjudicator sees what the file draws.
      const image = await normalizeLogoPng(Buffer.from(fetched.text, "utf8"));
      if (!image) continue;
      candidates.push({
        id: `c${candidates.length + 1}`,
        origin: "declared",
        captureIndex: -1,
        image,
        svg: fetched.text,
        srcUrl: d.url,
        bytes: null,
        note: d.note,
        sourceLabel: SOURCE_LABELS[d.source],
      });
    } else {
      const image = await normalizeLogoPng(fetched.buffer);
      if (!image) continue;
      candidates.push({
        id: `c${candidates.length + 1}`,
        origin: "declared",
        captureIndex: -1,
        image,
        svg: null,
        srcUrl: d.url,
        bytes: fetched.buffer,
        note: d.note,
        sourceLabel: SOURCE_LABELS[d.source],
      });
    }
  }

  const visible = candidates.filter((c) => c.image);
  if (visible.length === 0) return null;

  if (visible.length === 1) {
    return materialize(visible[0], input, {
      adjudicated: false,
      rationale: null,
      examined: 1,
      usage: null,
    });
  }

  const vlmCandidates: LogoAdjudicationCandidate[] = visible.map((c) => ({
    id: c.id,
    image: c.image as string,
    note: `${c.note}（出所: ${c.sourceLabel}）`,
  }));
  const { adjudication, usage } = await adjudicateLogo({
    siteTitle: input.raw?.title ?? null,
    url: input.raw?.url ?? input.capture?.url ?? null,
    screenshot: input.capture?.screenshots.desktop ?? null,
    candidates: vlmCandidates,
  });

  if (!adjudication) {
    // Adjudicator unavailable/failed — fall back to the deterministic order:
    // capture pick #1 first, else the first declared candidate.
    return materialize(visible[0], input, {
      adjudicated: false,
      rationale: null,
      examined: visible.length,
      usage,
    });
  }
  if (!adjudication.choice) {
    return {
      kind: "none",
      rationale: adjudication.rationale,
      examined: visible.length,
      usage,
    };
  }
  const winner =
    visible.find((c) => c.id === adjudication.choice) ?? visible[0];
  return materialize(winner, input, {
    adjudicated: true,
    rationale: adjudication.rationale,
    examined: visible.length,
    usage,
  });
}

async function materialize(
  winner: InternalCandidate,
  input: { capture: SiteCapture | null },
  meta: {
    adjudicated: boolean;
    rationale: string | null;
    examined: number;
    usage: LlmUsage | null;
  },
): Promise<LogoResolution> {
  let svg = winner.svg;
  let image = winner.image;
  let bytes = winner.bytes;

  // The deterministic #1 capture pick already went through the natural-
  // resolution file upgrade inside captureSite — reuse those, they are
  // strictly better than the crop.
  if (winner.origin === "capture" && winner.captureIndex === 0 && input.capture) {
    svg = input.capture.logoSvg ?? svg;
    image = input.capture.logoImage ?? image;
  } else if (winner.origin === "capture" && winner.srcUrl && !svg) {
    // A runner-up <img> pick won: fetch its file for the vector/natural-res
    // master, same upgrade the #1 pick gets.
    const fetched = await fetchLogoFile(winner.srcUrl);
    if (fetched?.kind === "svg") svg = fetched.text;
    else if (fetched?.kind === "raster") {
      bytes = fetched.buffer;
      image = (await normalizeLogoPng(fetched.buffer)) ?? image;
    }
  }

  let colors: { hex: string; share: number }[] = [];
  try {
    const colorSource =
      bytes ??
      (svg
        ? Buffer.from(svg, "utf8")
        : image
          ? Buffer.from(image, "base64")
          : null);
    if (colorSource) colors = await imageDominantColors(colorSource);
  } catch {
    // colors stay empty — palette evidence just loses the logo hint
  }

  return {
    kind: "logo",
    svg,
    image,
    colors,
    sourceLabel: winner.sourceLabel,
    adjudicated: meta.adjudicated,
    rationale: meta.rationale,
    examined: meta.examined,
    usage: meta.usage,
  };
}
