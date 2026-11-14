import { createHash, randomUUID } from "node:crypto";
import { guardBrandRequest } from "@/lib/brand-access";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import { deleteR2Object, isR2Configured, putR2Object } from "@/lib/r2";
import { measureMaterial, measurementColumns } from "@/lib/materials/measure";
import { isPdf } from "@/lib/materials/pdf";
import { signedMaterialUrl } from "@/lib/materials/signed-url";
import { registerPdfChildren, type PdfExpansion } from "@/lib/materials/pdf-children";
import { inputOf } from "@/lib/brand/inputs";
import { scrapeUrl } from "@/lib/site/ingest";
import { normalizePublicHttpUrl } from "@/lib/public-url";

/**
 * Material a brand is built from: the PDF of a brand book, a guideline page,
 * a note somebody pasted. These join the site URL as things the pipeline reads
 * (deliverable-architecture §17.3) — output changes because the input did, not
 * because someone edited the output.
 *
 * Scope is always `brand` here: this is the library that everything the brand
 * produces can draw on. Narrower material belongs to a Work or a Take.
 */

const MAX_BYTES = 8_000_000;

const KIND_BY_MEDIA: Array<[RegExp, string]> = [
  [/^application\/pdf$/, "document"],
  [/^text\/plain$/, "document"],
  [/^image\/svg\+xml$/, "logo"],
  [/^image\//, "photo"],
  [/^font\//, "font"],
];

function kindFor(mediaType: string): string {
  for (const [pattern, kind] of KIND_BY_MEDIA) {
    if (pattern.test(mediaType)) return kind;
  }
  return "other";
}

const ACCEPTED = /^(application\/pdf|text\/plain|image\/(png|jpeg|webp|gif|svg\+xml))$/;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const result = await supabase
    .from("brand_materials")
    .select(
      "id, kind, label, media_type, bytes, width, height, r2_key, source_kind, source_url, derived_from_material_id, provenance, created_at",
    )
    .eq("brand_id", id)
    .eq("scope", "brand")
    .order("created_at", { ascending: false });
  if (result.error) {
    return Response.json({ error: "素材を取得できませんでした" }, { status: 500 });
  }
  // Every material is a container whose contents begin with its own file
  // (docs/asset-normalization.md §9.4), so the list hands over a URL its bytes
  // can be fetched through. Brand scope, so the brand delivery route signs it.
  type Row = {
    id: string;
    label: string;
    r2_key: string | null;
    source_kind: string;
    derived_from_material_id: string | null;
    provenance: Record<string, unknown> | null;
  };
  const materials = ((result.data ?? []) as unknown as Row[]).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept off the wire
    const { r2_key, provenance, ...rest } = row;
    // What the person fed in (a file, a page, a note) and when it was last
    // read into the brand — the pipeline's input list (lib/brand/inputs.ts).
    const input = inputOf(row);
    return {
      ...rest,
      input: input?.kind ?? null,
      read_at: input?.readAt ?? null,
      url: signedMaterialUrl(id, { ...row, r2_key }),
    };
  });
  return Response.json({ materials }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  try {
    if (!isR2Configured()) {
      throw new Error("素材の保存先が設定されていません");
    }
    const body = (await req.json()) as {
      label?: unknown;
      mediaType?: unknown;
      data?: unknown;
      text?: unknown;
      url?: unknown;
    };

    // A pasted note, an uploaded file and an added page are the same thing
    // once stored; only how they arrive differs.
    let buffer: Buffer;
    let mediaType: string;
    let input: "file" | "note" | "url" = "file";
    let sourceUrl: string | null = null;
    let pageTitle: string | null = null;
    if (typeof body.url === "string" && body.url.trim()) {
      // A page added as input: kept as the text it said when it was added, so
      // what the brand was read from stays on record after the page changes.
      const target = normalizePublicHttpUrl(body.url.trim()).href;
      const page = await scrapeUrl(target);
      const text = [
        `URL: ${page.url}`,
        page.title ? `タイトル: ${page.title}` : "",
        page.description ? `説明: ${page.description}` : "",
        page.headings.length ? `見出し:\n${page.headings.join("\n")}` : "",
        page.bodyText ? `本文:\n${page.bodyText}` : "",
        page.footerText ? `フッター:\n${page.footerText}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!page.bodyText.trim() && page.headings.length === 0) {
        throw new Error("このページから文章を読み取れませんでした（JavaScriptで描くページかもしれません）");
      }
      buffer = Buffer.from(text, "utf8");
      mediaType = "text/plain";
      input = "url";
      sourceUrl = page.url;
      pageTitle = page.title;
    } else if (typeof body.text === "string" && body.text.trim()) {
      input = "note";
      buffer = Buffer.from(body.text, "utf8");
      mediaType = "text/plain";
    } else if (typeof body.data === "string" && typeof body.mediaType === "string") {
      if (!ACCEPTED.test(body.mediaType)) {
        throw new Error("この形式は取り込めません");
      }
      buffer = Buffer.from(body.data, "base64");
      mediaType = body.mediaType;
    } else {
      throw new Error("素材が空です");
    }
    if (buffer.length === 0) throw new Error("素材が空です");
    if (buffer.length > MAX_BYTES) throw new Error("素材が大きすぎます（8MBまで）");

    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 200)
        : input === "url"
          ? (pageTitle?.trim() || sourceUrl || "ページ").slice(0, 200)
          : input === "note"
            ? "メモ"
            : "素材";
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const materialId = randomUUID();
    // Content hash in the key: the same bytes uploaded twice cannot produce
    // two different objects, and an object can never be silently replaced.
    const r2Key = `brands/${id}/materials/${checksum}`;

    await putR2Object(r2Key, buffer, mediaType, "private, max-age=0");

    // Measured while the bytes are in hand (docs/asset-normalization.md §6).
    const measurement = await measureMaterial(buffer, mediaType);

    const inserted = await supabase
      .from("brand_materials")
      .insert({
        id: materialId,
        scope: "brand",
        brand_id: id,
        kind: kindFor(mediaType),
        label,
        media_type: mediaType,
        r2_key: r2Key,
        bytes: buffer.length,
        checksum,
        ...measurementColumns(measurement),
        source_kind: "upload",
        source_url: sourceUrl,
        provenance: { source: "brand_pipeline_input", input, uploaded_by: user.id },
      })
      .select("id, kind, label, media_type, bytes, source_kind, source_url, created_at")
      .maybeSingle();

    if (inserted.error || !inserted.data) {
      // Registering failed, so the object has no owner. Removing it keeps R2
      // from accumulating bytes nothing points at.
      await deleteR2Object(r2Key).catch(() => undefined);
      throw new Error("素材を登録できませんでした");
    }

    // A PDF is taken apart in the same request (docs/asset-normalization.md
    // §9.4): its images become brand-scope rows derived from it, so a deck's
    // photographs and marks are visible and downloadable, not sealed in the
    // file. The PDF stays whole and is what the pipeline reads. Failing to list
    // the contents does not fail the upload — it is reported beside the row.
    let expansion: PdfExpansion | undefined;
    let expansionError: string | undefined;
    if (isPdf(mediaType)) {
      try {
        expansion = await registerPdfChildren(
          supabase,
          { id: materialId, brand_id: id, scope: "brand", take_id: null, label },
          buffer,
          user.id,
        );
      } catch (error) {
        expansionError =
          error instanceof Error && error.message ? error.message : "PDFの中身を取り出せませんでした";
      }
    }

    return Response.json(
      {
        material: inserted.data,
        ...(expansion ? { expansion } : {}),
        ...(expansionError ? { expansionError } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "素材を追加できませんでした" },
      { status: 400 },
    );
  }
}
