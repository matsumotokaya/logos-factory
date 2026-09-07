import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FetchedSiteImage, SiteCapture } from "@/lib/campaign/capture";
import { deleteR2Object, isR2Configured, putR2Object } from "@/lib/r2";
import { measureMaterial, measurementColumns } from "@/lib/materials/measure";

/**
 * Keep the files a site capture produced.
 *
 * Until now a capture rendered the real page, looked at it, and threw the
 * pictures away: the screenshots lived in memory for the adjudicator, got
 * written into a local job JSON, and never reached R2 or brand_materials. The
 * product could say a great deal about a site it could not show you a single
 * frame of.
 *
 * Two kinds of file come home:
 *
 *   the screenshots  proof the page was actually rendered and read, and the
 *                    source image for every device mockup
 *   the site's own   the key visual, the hero photography, the tiling
 *   imagery          textures — the raw material a video, an LP and a banner
 *                    are built out of
 *
 * On the second: §17.6 originally limited URL intake to the logo, on the
 * grounds that photography is copyrighted. That limit is lifted deliberately
 * (依頼主判断 2026-09-03). The person importing a site into this product is
 * the site's own operator building marketing for that same site, so the files
 * are theirs; and a brand whose imagery we refuse to look at is a brand every
 * deliverable has to invent pictures for. Provenance is recorded on every row
 * (`source_kind='url_fetch'` plus the exact `source_url`), so a file can always
 * be traced back to the page it came from and deleted.
 *
 * Nothing here is destructive and nothing is adopted: these are files, and a
 * file being present is not a claim that anyone chose it. Promoting one to the
 * brand's key visual stays an explicit act.
 */

/** What the capture is allowed to leave behind, per run. */
const LIMITS = {
  /** screenshots + imagery, before de-duplication */
  files: 20,
  maxBytes: 8_000_000,
};

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export interface SavedSiteMaterial {
  id: string;
  kind: string;
  category: string | null;
  label: string;
  mediaType: string;
  bytes: number;
  role: string;
  sourceUrl: string | null;
}

export interface SiteMaterialsResult {
  saved: SavedSiteMaterial[];
  /** Files that were already stored from an earlier capture of the same bytes. */
  skipped: number;
  /** Why nothing was stored, when nothing was. */
  note: string | null;
}

type Candidate = {
  body: Buffer;
  mediaType: string;
  label: string;
  kind: string;
  category: string | null;
  role: string;
  sourceUrl: string | null;
  provenance: Record<string, unknown>;
};

/**
 * What a file IS, on the two axes the product keeps separate
 * (asset-normalization §5): `kind` is the medium and the slot it can fill,
 * `category` is what is depicted.
 *
 * `category` is left null for photography rather than guessed. A photo of a
 * meeting room is `place`, of a person is `person`, and only something that
 * looks at the pixels can tell — the inventory's classifier does that later and
 * writes `category_source='inferred'`. Writing "other" here would be a wrong
 * answer that looks like a right one; null means まだ分類していない (§6).
 */
function classify(image: FetchedSiteImage): { kind: string; category: string | null } {
  if (image.role === "keyvisual") return { kind: "keyvisual", category: null };
  if (image.role === "texture") return { kind: "photo", category: "texture" };
  if (image.mediaType === "image/svg+xml") return { kind: "illustration", category: "graphic" };
  return { kind: "photo", category: null };
}

/** A name for the row. Derived, never invented (§8.2): the site's own alt text
 *  or the file it was served as — nothing a model made up. */
function labelFor(image: FetchedSiteImage, index: number): string {
  if (image.alt) return image.alt.slice(0, 120);
  try {
    const name = decodeURIComponent(new URL(image.src).pathname.split("/").pop() ?? "");
    if (name && name.length <= 120) return name;
  } catch {
    // fall through to the positional name
  }
  const role =
    image.role === "keyvisual"
      ? "キービジュアル"
      : image.role === "texture"
        ? "地紋"
        : image.role === "hero"
          ? "ヒーロー画像"
          : "サイトの画像";
  return `${role}${index + 1}`;
}

function screenshotCandidates(capture: SiteCapture): Candidate[] {
  const shots: Array<[string | null, string, string]> = [
    [capture.screenshots.desktop, "サイトの画面（デスクトップ）", "screenshot_desktop"],
    [capture.screenshots.fullPage, "サイトの全景", "screenshot_full"],
    [capture.screenshots.mobile, "サイトの画面（モバイル）", "screenshot_mobile"],
  ];
  const out: Candidate[] = [];
  for (const [data, label, role] of shots) {
    if (!data) continue;
    const body = Buffer.from(data, "base64");
    if (body.length === 0) continue;
    out.push({
      body,
      // toJpegBase64 is what produced these; the media type is not a guess.
      mediaType: "image/jpeg",
      label,
      kind: "photo",
      category: "screen",
      role,
      sourceUrl: capture.url,
      provenance: { source: "site_capture", role, page_url: capture.url },
    });
  }
  return out;
}

function imageCandidates(capture: SiteCapture): Candidate[] {
  return capture.images.map((image, index) => {
    const { kind, category } = classify(image);
    return {
      body: Buffer.from(image.data, "base64"),
      mediaType: image.mediaType,
      label: labelFor(image, index),
      kind,
      category,
      role: image.role,
      sourceUrl: image.src,
      provenance: {
        source: "site_capture",
        role: image.role,
        page_url: capture.url,
        alt: image.alt,
        natural_width: image.naturalWidth,
        natural_height: image.naturalHeight,
        rendered_width: image.renderedWidth,
        rendered_height: image.renderedHeight,
        repeats: image.repeats,
      },
    };
  });
}

/**
 * Store a capture's files against one brand.
 *
 * Re-running is safe and expected: the R2 key is the content hash, so the same
 * bytes cannot become two objects, and a row already pointing at that key is
 * left alone rather than duplicated. A capture that finds a changed hero image
 * adds it; a capture that finds the same one adds nothing.
 */
export async function saveSiteMaterials({
  supabase,
  userId,
  brandId,
  capture,
}: {
  supabase: SupabaseClient;
  userId: string;
  brandId: string;
  capture: SiteCapture;
}): Promise<SiteMaterialsResult> {
  if (!isR2Configured()) {
    return { saved: [], skipped: 0, note: "R2が未設定のため、サイトの画像は保存していません" };
  }

  const candidates = [...screenshotCandidates(capture), ...imageCandidates(capture)]
    .filter((candidate) => candidate.body.length > 0 && candidate.body.length <= LIMITS.maxBytes)
    .slice(0, LIMITS.files);
  if (candidates.length === 0) {
    return { saved: [], skipped: 0, note: null };
  }

  // One read for every key this run would write: asking per file turns a
  // 20-file capture into 20 round trips before it has stored anything.
  const keyed = candidates.map((candidate) => {
    const checksum = createHash("sha256").update(candidate.body).digest("hex");
    const extension = EXTENSION[candidate.mediaType] ?? "bin";
    return {
      candidate,
      checksum,
      r2Key: `brands/${brandId}/materials/${checksum}/site.${extension}`,
    };
  });
  const existing = await supabase
    .from("brand_materials")
    .select("r2_key")
    .eq("brand_id", brandId)
    .in(
      "r2_key",
      keyed.map((entry) => entry.r2Key),
    );
  const alreadyStored = new Set(
    (existing.data ?? []).map((row) => row.r2_key as string),
  );

  const saved: SavedSiteMaterial[] = [];
  let skipped = 0;
  const seenThisRun = new Set<string>();

  for (const { candidate, checksum, r2Key } of keyed) {
    if (alreadyStored.has(r2Key) || seenThisRun.has(r2Key)) {
      skipped += 1;
      continue;
    }
    seenThisRun.add(r2Key);

    try {
      await putR2Object(r2Key, candidate.body, candidate.mediaType, "private, max-age=0");
    } catch {
      continue; // storage failing for one file is not the capture failing
    }

    // Measured while the bytes are in hand, unconditionally
    // (asset-normalization §11.1). Non-images come back UNMEASURED.
    const measurement = await measureMaterial(candidate.body, candidate.mediaType);

    const inserted = await supabase
      .from("brand_materials")
      .insert({
        id: randomUUID(),
        scope: "brand",
        brand_id: brandId,
        kind: candidate.kind,
        ...(candidate.category
          ? { category: candidate.category, category_source: "inferred" }
          : {}),
        label: candidate.label,
        media_type: candidate.mediaType,
        r2_key: r2Key,
        bytes: candidate.body.length,
        checksum,
        ...measurementColumns(measurement),
        source_kind: "url_fetch",
        source_url: candidate.sourceUrl,
        provenance: candidate.provenance,
        created_by: userId,
      })
      .select("id, kind, category, label, media_type, bytes, source_url")
      .maybeSingle();

    if (inserted.error || !inserted.data) {
      // Nothing points at the object now, so it is bytes nobody can reach.
      await deleteR2Object(r2Key).catch(() => undefined);
      continue;
    }
    saved.push({
      id: inserted.data.id as string,
      kind: inserted.data.kind as string,
      category: (inserted.data.category as string | null) ?? null,
      label: inserted.data.label as string,
      mediaType: (inserted.data.media_type as string | null) ?? candidate.mediaType,
      bytes: Number(inserted.data.bytes ?? candidate.body.length),
      role: candidate.role,
      sourceUrl: (inserted.data.source_url as string | null) ?? null,
    });
  }

  return { saved, skipped, note: null };
}
