import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";

// What is inside a PDF, taken out mechanically.
//
// docs/asset-normalization.md §9.4. A flyer arrives as one file and is handed
// to the model whole; the person who uploaded it cannot see what the model is
// looking at. This module opens the file the way pdf.js does — walking each
// page's drawing operators in order — and hands back every raster it finds, so
// the material stops being a black box.
//
// NOTHING IS THINNED. A Canva or InDesign export is full of fragments: a
// photograph sliced into strips, 2px slivers of a border, the same icon drawn
// on three pages. Those are what the model is given too, and hiding them would
// hide the reason a reading came out poorly. The one reduction is byte-identical
// duplicates: the same image object drawn twice is one image, and the pages it
// appears on are recorded instead.
//
// What this cannot reach is anything drawn as vectors — a wordmark set in
// paths, an icon built from shapes. Those are not images to pdf.js, and a page
// render (unpdf's renderPageAsImage over @napi-rs/canvas) is the route to them.
// Measured 2026-09-08 on a two-page Canva flyer: this module found 50 rasters in
// 1.6s, poppler's `pdfimages` agreed on every XObject and inline image, and the
// vectors it missed were a house icon and three ornaments.

export interface PdfImage {
  /** 1-based page the image first appears on. */
  page: number;
  /** Every page the same bytes are drawn on, ascending. */
  pages: number[];
  /** 1-based position among the images first drawn on `page`, in draw order. */
  index: number;
  width: number;
  height: number;
  /** Channels pdf.js decoded to: 1 grey, 3 RGB, 4 RGBA. */
  channels: 1 | 3 | 4;
  /** Drawn inline in the content stream rather than as a named XObject. */
  inline: boolean;
  /** Whether the encoded body keeps an alpha channel. */
  alpha: boolean;
  body: Buffer;
  mediaType: "image/png" | "image/jpeg";
  /** sha256 of `body` — the identity everything else is keyed on. */
  checksum: string;
}

export interface PdfContents {
  pages: number;
  images: PdfImage[];
  /** The text layer, one string per page. Empty strings for pages with none. */
  text: string[];
  /** Image draws pdf.js could not hand over as pixels. Counted, not hidden. */
  unreadable: number;
  ms: number;
}

export const isPdf = (mediaType: string | null | undefined): boolean =>
  mediaType === "application/pdf";

/**
 * Pixels above which an opaque image is stored as JPEG instead of PNG.
 *
 * A losslessly re-encoded 3277×2185 photograph is 6MB of PNG for something the
 * PDF held as a 1.6MB JPEG. Below this everything stays PNG, because a QR code
 * or a 12×256 sliver gains nothing from JPEG and loses its edges.
 */
export const JPEG_ABOVE_PIXELS = 1_000_000;
const JPEG_QUALITY = 90;

export const encodingFor = (
  width: number,
  height: number,
  channels: number,
): "image/png" | "image/jpeg" =>
  channels === 4 || width * height <= JPEG_ABOVE_PIXELS ? "image/png" : "image/jpeg";

/** What pdf.js hands over for one drawn image, before encoding. */
interface RawImage {
  width: number;
  height: number;
  /** Interleaved samples, or packed 1-bit rows when `kind` says so. */
  data: Uint8Array | Uint8ClampedArray;
  kind?: number;
}

/**
 * Normalise pdf.js's pixel buffer into something sharp can read.
 *
 * pdf.js decodes to grey, RGB or RGBA, and for 1-bit images keeps the packed
 * rows. Channel count is read off the length rather than trusted from `kind`,
 * the same way unpdf does it; a buffer that fits none of the shapes is a decode
 * this version of pdf.js did not finish, and is reported rather than guessed.
 */
function unpack(image: RawImage): { data: Buffer; channels: 1 | 3 | 4 } | null {
  const { width, height, data } = image;
  if (!width || !height || !data?.length) return null;
  const pixels = width * height;
  const perPixel = data.length / pixels;
  if (perPixel === 1 || perPixel === 3 || perPixel === 4) {
    return {
      data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      channels: perPixel,
    };
  }
  // GRAYSCALE_1BPP: rows padded to a byte boundary, high bit first, 1 = white.
  const stride = Math.ceil(width / 8);
  if (data.length === stride * height) {
    const out = Buffer.alloc(pixels);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (data[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
        out[y * width + x] = bit ? 255 : 0;
      }
    }
    return { data: out, channels: 1 };
  }
  return null;
}

async function encode(
  raw: { data: Buffer; channels: 1 | 3 | 4 },
  width: number,
  height: number,
): Promise<{ body: Buffer; mediaType: PdfImage["mediaType"] }> {
  const mediaType = encodingFor(width, height, raw.channels);
  const image = sharp(raw.data, { raw: { width, height, channels: raw.channels } });
  const body =
    mediaType === "image/png"
      ? await image.png().toBuffer()
      : await image.jpeg({ quality: JPEG_QUALITY }).toBuffer();
  return { body, mediaType };
}

/** Resolve a named image object the way pdf.js's own renderer does. */
function resolveObject(
  page: { objs: { get: (key: string, cb: (v: unknown) => void) => void }; commonObjs: { get: (key: string, cb: (v: unknown) => void) => void } },
  key: string,
): Promise<RawImage | null> {
  const store = key.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    try {
      store.get(key, (value) => resolve((value as RawImage | null) ?? null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Every raster image drawn in the document, in page and draw order.
 *
 * Throws only when the bytes are not a PDF pdf.js can open. A single image
 * that cannot be decoded is counted in `unreadable` and the rest still come
 * out — one broken object must not make the whole file opaque again.
 */
export async function extractPdfImages(bytes: Buffer): Promise<PdfContents> {
  const started = Date.now();
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { OPS } = await getResolvedPDFJS();

  const byChecksum = new Map<string, PdfImage>();
  // Named objects already encoded, so an icon drawn on three pages is decoded
  // once. `g_` keys are document-wide; page keys carry their page number.
  const byKey = new Map<string, string | null>();
  let unreadable = 0;

  const admit = async (
    raw: RawImage | null,
    page: number,
    inline: boolean,
    counter: { next: number },
  ): Promise<string | null> => {
    const unpacked = raw ? unpack(raw) : null;
    if (!raw || !unpacked) {
      unreadable += 1;
      return null;
    }
    const encoded = await encode(unpacked, raw.width, raw.height);
    const checksum = createHash("sha256").update(encoded.body).digest("hex");
    const seen = byChecksum.get(checksum);
    if (seen) {
      if (!seen.pages.includes(page)) seen.pages.push(page);
      return checksum;
    }
    counter.next += 1;
    byChecksum.set(checksum, {
      page,
      pages: [page],
      index: counter.next,
      width: raw.width,
      height: raw.height,
      channels: unpacked.channels,
      inline,
      alpha: unpacked.channels === 4,
      body: encoded.body,
      mediaType: encoded.mediaType,
      checksum,
    });
    return checksum;
  };

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const ops = await page.getOperatorList();
    const counter = { next: 0 };
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
        const key = args[0];
        if (typeof key !== "string") continue;
        if (byKey.has(key)) {
          const checksum = byKey.get(key);
          const seen = checksum ? byChecksum.get(checksum) : undefined;
          if (seen && !seen.pages.includes(pageNumber)) seen.pages.push(pageNumber);
          continue;
        }
        const raw = await resolveObject(page, key);
        byKey.set(key, await admit(raw, pageNumber, false, counter));
      } else if (fn === OPS.paintInlineImageXObject) {
        await admit((args[0] as RawImage | undefined) ?? null, pageNumber, true, counter);
      }
    }
    page.cleanup();
  }

  const text = await extractText(pdf, { mergePages: false });

  return {
    pages: pdf.numPages,
    images: [...byChecksum.values()].sort((a, b) => a.page - b.page || a.index - b.index),
    text: text.text.map((entry) => entry ?? ""),
    unreadable,
    ms: Date.now() - started,
  };
}
