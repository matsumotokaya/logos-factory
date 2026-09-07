// Stream one of a brand's own files out of private R2 storage.
//
// The take-scope twin of this route
// (app/api/brands/[id]/takes/[takeId]/materials/[materialId]/[name]) serves the
// files a video pinned. This one serves the files the brand itself holds: the
// screenshots of its site, its key visual, the textures the capture brought
// home. Both exist because an <img> cannot attach an Authorization header, so
// the caller's access is checked once — while the API route still holds their
// token — and the browser is handed a URL that carries its own proof.
//
// Like its twin, this performs no database lookup. The signed request arrives
// without a user token and brand_materials is closed by RLS; everything this
// route is allowed to serve is already bound into the signature.

import { labsDisabledResponse, labsEnabled } from "@/lib/labs-access";
import { verifyLabsSignature } from "@/lib/labs-output-sign";
import { brandMaterialSignatureToken } from "@/lib/takes/material-uri";
import { parseByteRange } from "@/lib/video/byte-range";
import { getR2ObjectRange, headR2Object } from "@/lib/video/storage";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; materialId: string }> },
) {
  if (!labsEnabled()) return labsDisabledResponse();

  const { id: brandId, materialId } = await ctx.params;
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  // Every scope's objects live under the brand prefix, which is the one bound
  // property the signature can also check structurally.
  if (!key || !key.startsWith(`brands/${brandId}/`)) {
    return new Response("Not found", { status: 404 });
  }
  if (
    !verifyLabsSignature(
      brandMaterialSignatureToken(brandId, materialId, key),
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const stat = await headR2Object(key);
  if (!stat) return new Response("Not found", { status: 404 });

  // Stored with its media type on upload; fall back to bytes rather than
  // guessing a type the browser would then mis-decode.
  const contentType = stat.contentType ?? "application/octet-stream";
  const range = parseByteRange(req.headers.get("range"), stat.size);

  if (range.kind === "invalid") {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }

  if (range.kind === "none") {
    const body = await getR2ObjectRange(key, 0, stat.size - 1);
    if (!body) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const { start, end } = range;
  const chunk = await getR2ObjectRange(key, start, end);
  if (!chunk) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(chunk), {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
