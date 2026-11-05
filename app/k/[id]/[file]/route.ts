// The kit's files, at stable addresses under /k/<brandId>/:
//
//   brand.md       the kit as an agent reads it
//   tokens.json    the adopted values, by role
//   tokens.css     the same as custom properties on :root
//   logo.svg       the first logo's vector master (logo-2.png … for the rest)
//   keyvisual.jpg  the key visual
//
// All derived from the live take's brief on read, so republishing moves every
// file at once and nothing is ever half-updated. Anonymous, like /v/[id].

import { kitFileExtension, kitMarkdown } from "@/lib/brand/kit/markdown";
import { resolveLiveKit } from "@/lib/brand/kit/resolve";
import { kitTokensCss, kitTokensJson } from "@/lib/brand/kit/tokens";
import { getR2Object } from "@/lib/r2";

const CACHE = "public, max-age=300";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  const kit = await resolveLiveKit(id);
  if (!kit) return notFound();
  const { brief } = kit;

  if (file === "brand.md") {
    const kitUrl = `${new URL(req.url).origin}/k/${id}`;
    return new Response(kitMarkdown(brief, { kitUrl, publishedAt: kit.publishedAt }), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": CACHE },
    });
  }
  if (file === "tokens.json") {
    return new Response(kitTokensJson(brief), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": CACHE },
    });
  }
  if (file === "tokens.css") {
    return new Response(kitTokensCss(brief), {
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": CACHE },
    });
  }

  const logoMatch = /^logo(?:-(\d+))?\.([a-z0-9]+)$/.exec(file);
  if (logoMatch) {
    const index = logoMatch[1] ? Number(logoMatch[1]) - 1 : 0;
    const logo = brief.logos[index];
    if (!logo) return notFound();
    const extension = logo.svg ? "svg" : kitFileExtension(logo.mediaType);
    if (logoMatch[2] !== extension) return notFound();
    if (logo.svg) {
      return new Response(logo.svg, {
        headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
      });
    }
    if (!logo.r2Key) return notFound();
    const bytes = await getR2Object(logo.r2Key);
    if (!bytes) return notFound();
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": logo.mediaType ?? "image/png", "Cache-Control": CACHE },
    });
  }

  const keyVisualMatch = /^keyvisual\.([a-z0-9]+)$/.exec(file);
  if (keyVisualMatch && brief.keyVisual) {
    if (keyVisualMatch[1] !== kitFileExtension(brief.keyVisual.mediaType)) return notFound();
    const bytes = await getR2Object(brief.keyVisual.r2Key);
    if (!bytes) return notFound();
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": brief.keyVisual.mediaType, "Cache-Control": CACHE },
    });
  }

  return notFound();
}
