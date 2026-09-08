// The material one video is briefed from.
//
// This is the pipeline's actual input, and until now the video had none: the
// take was created with a seeded brief and the bar reported "brief registered"
// the moment it existed, which said the user had given us something when they
// had given us nothing.
//
// A pasted paragraph and an uploaded flyer are the same thing once stored —
// only how they arrive differs — so text is written out as a text/plain object
// and registered like any other file (the brand material route takes the same
// position).

import { createHash, randomUUID } from "node:crypto";
import { guardLabsRequest } from "@/lib/labs-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { deleteR2Object, isR2Configured, putR2Object } from "@/lib/r2";
import { measureMaterial, measurementColumns } from "@/lib/materials/measure";
import { isPdf } from "@/lib/materials/pdf";
import {
  PDF_IMAGE_ROLE,
  registerPdfChildren,
  type PdfChildProvenance,
  type PdfExpansion,
} from "@/lib/materials/pdf-children";
import {
  destroyFamily,
  heldByOtherTakes,
  resolveMaterialFamily,
  unpinFamily,
} from "@/lib/materials/delete";
import { signedLabsUrl } from "@/lib/labs-output-sign";
import { takeMaterialSignatureToken } from "@/lib/takes/material-uri";
import { seedEventCmFromBrand } from "@/lib/event-cm/seed-from-brand";
import { withdrawMaterials, type Withdrawal } from "@/lib/event-cm/withdraw";
import { validateBrief } from "@/lib/templates/brief-schemas";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** Pin role for anything supplied as briefing material. */
export const SOURCE_ROLE = "brief_source";

/**
 * One image taken out of a PDF pinned to this video (§9.4).
 *
 * Listed under the PDF's row so the person can see what the model was handed
 * and take any of it out. `url` is a signed same-origin URL good for an hour:
 * the thumbnail and the download are the same request.
 */
export interface PdfChild {
  id: string;
  /** The PDF's material id. */
  parentId: string;
  label: string;
  media_type: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  page: number;
  pages: number[];
  index: number;
  inline: boolean;
  url: string;
}

/**
 * Take a PDF apart into child materials, without letting that fail the upload.
 *
 * The PDF is material whether or not its contents can be listed; an unreadable
 * one is reported as such next to the row rather than refused.
 */
async function expandPdf(
  supabase: ReturnType<typeof createServerSupabaseForToken>,
  parent: { id: string; brand_id: string; take_id: string; label: string },
  buffer: Buffer,
  userId: string,
): Promise<{ expansion?: PdfExpansion; expansionError?: string }> {
  try {
    const expansion = await registerPdfChildren(
      supabase,
      { ...parent, scope: "take" },
      buffer,
      userId,
    );
    return { expansion };
  } catch (error) {
    return {
      expansionError:
        error instanceof Error && error.message ? error.message : "PDFの中身を取り出せませんでした",
    };
  }
}

/**
 * A signed same-origin URL for one of this take's pinned materials.
 *
 * The same route the preview player reads bytes through: the signature binds
 * the exact R2 key to this brand/take/material path and lasts an hour, which
 * is what lets an <img> and a download link work without an auth header.
 *
 * The last segment is the file's base name, never the whole label: a folder
 * upload stores names like `sake/photo.jpg`, and a slash in there would make
 * the URL address a path that does not exist. The extension is kept so media
 * players can still sniff the format; the saved filename comes from the
 * anchor's `download` attribute either way.
 */
const signedMaterialUrl = (
  brandId: string,
  takeId: string,
  materialId: string,
  label: string,
  r2Key: string,
): string => {
  const name = label.split("/").pop() || "asset";
  return signedLabsUrl(
    `/api/brands/${brandId}/takes/${takeId}/materials/${materialId}/${encodeURIComponent(name)}?key=${encodeURIComponent(r2Key)}`,
    takeMaterialSignatureToken(brandId, takeId, materialId, r2Key),
  );
};

const MAX_BYTES = 12_000_000;
const ACCEPTED =
  /^(application\/pdf|text\/plain|text\/markdown|image\/(png|jpeg|webp|gif|svg\+xml)|audio\/(mpeg|wav|mp4))$/;

const KIND_BY_MEDIA: Array<[RegExp, string]> = [
  [/^application\/pdf$/, "document"],
  [/^text\//, "document"],
  [/^image\/svg\+xml$/, "logo"],
  [/^image\//, "photo"],
  [/^audio\//, "audio"],
];

const kindFor = (mediaType: string): string =>
  KIND_BY_MEDIA.find(([pattern]) => pattern.test(mediaType))?.[1] ?? "other";

async function loadTake(
  supabase: ReturnType<typeof createServerSupabaseForToken>,
  brandId: string,
  videoId: string,
) {
  const { data, error } = await supabase
    .from("takes")
    .select("id, template_id, brief")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (error) return { error: "動画を確認できませんでした", status: 500 } as const;
  if (!data) return { error: "動画が見つかりません", status: 404 } as const;
  return { take: data } as const;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const loaded = await loadTake(supabase, brandId, videoId);
  if ("error" in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }

  const { data, error } = await supabase
    .from("take_inputs")
    .select(
      "role, pinned_at, brand_materials(id, kind, label, media_type, bytes, width, height, r2_key, created_at, provenance)",
    )
    .eq("take_id", loaded.take.id)
    .eq("role", SOURCE_ROLE);
  if (error) {
    return Response.json({ error: "素材を取得できませんでした" }, { status: 500 });
  }

  interface SourceMaterial {
    id: string;
    kind: string;
    label: string;
    media_type: string | null;
    bytes: number | null;
    width: number | null;
    height: number | null;
    r2_key: string | null;
    provenance: { upload_fingerprint?: unknown } | null;
  }
  type Row = {
    pinned_at: string;
    brand_materials: SourceMaterial | SourceMaterial[] | null;
  };
  const materials = ((data ?? []) as Row[])
    .map((row) => {
      const material = Array.isArray(row.brand_materials)
        ? row.brand_materials[0]
        : row.brand_materials;
      return material
        ? {
            id: material.id,
            kind: material.kind,
            label: material.label,
            media_type: material.media_type,
            bytes: material.bytes,
            width: material.width,
            height: material.height,
            // The document's own file, retrievable. Every material is a
            // container whose contents begin with itself (§9.4); without this
            // the original PDF and every uploaded photograph were unreachable,
            // while a PDF's extracted image was the one downloadable thing in
            // the application.
            url: material.r2_key
              ? signedMaterialUrl(brandId, loaded.take.id, material.id, material.label, material.r2_key)
              : null,
            pinnedAt: row.pinned_at,
            upload_fingerprint:
              typeof material.provenance?.upload_fingerprint === "string"
                ? material.provenance.upload_fingerprint
                : null,
          }
        : null;
    })
    .filter((material): material is NonNullable<typeof material> => material !== null);

  // What the PDFs among them contain. Pinned in their own role, so the list
  // above — and the staging list and the input stage's set comparison that read
  // it — never count a child as a document to read.
  const pinnedChildren = await supabase
    .from("take_inputs")
    .select(
      "material_id, brand_materials(id, label, media_type, bytes, width, height, r2_key, derived_from_material_id, provenance)",
    )
    .eq("take_id", loaded.take.id)
    .eq("role", PDF_IMAGE_ROLE);
  if (pinnedChildren.error) {
    return Response.json({ error: "PDFの中身を取得できませんでした" }, { status: 500 });
  }
  type ChildRow = {
    brand_materials:
      | {
          id: string;
          label: string;
          media_type: string | null;
          bytes: number | null;
          width: number | null;
          height: number | null;
          r2_key: string | null;
          derived_from_material_id: string | null;
          provenance: Partial<PdfChildProvenance> | null;
        }
      | Array<{
          id: string;
          label: string;
          media_type: string | null;
          bytes: number | null;
          width: number | null;
          height: number | null;
          r2_key: string | null;
          derived_from_material_id: string | null;
          provenance: Partial<PdfChildProvenance> | null;
        }>
      | null;
  };
  const children: PdfChild[] = ((pinnedChildren.data ?? []) as ChildRow[])
    .flatMap((row) => {
      const material = Array.isArray(row.brand_materials)
        ? row.brand_materials[0]
        : row.brand_materials;
      if (!material?.r2_key || !material.derived_from_material_id) return [];
      const where = material.provenance ?? {};
      return [
        {
          id: material.id,
          parentId: material.derived_from_material_id,
          label: material.label,
          media_type: material.media_type,
          bytes: material.bytes,
          width: material.width,
          height: material.height,
          page: typeof where.page === "number" ? where.page : 0,
          pages: Array.isArray(where.pages) ? where.pages : [],
          index: typeof where.index === "number" ? where.index : 0,
          inline: where.inline === true,
          url: signedMaterialUrl(
            brandId,
            loaded.take.id,
            material.id,
            material.label,
            material.r2_key,
          ),
        },
      ];
    })
    .sort((a, b) => a.parentId.localeCompare(b.parentId) || a.page - b.page || a.index - b.index);

  return Response.json({ materials, children }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const loaded = await loadTake(supabase, brandId, videoId);
  if ("error" in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }

  try {
    if (!isR2Configured()) throw new Error("素材の保存先が設定されていません");
    let buffer: Buffer;
    let mediaType: string;
    let requestedLabel: unknown;
    let lastModified: string | null = null;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
        throw new Error("素材が空です");
      }
      mediaType =
        typeof form.get("mediaType") === "string" ? String(form.get("mediaType")) : file.type;
      if (!ACCEPTED.test(mediaType)) throw new Error("この形式は取り込めません");
      if (file.size > MAX_BYTES) throw new Error("素材が大きすぎます（12MBまで）");
      buffer = Buffer.from(await file.arrayBuffer());
      requestedLabel = form.get("label") ?? file.name;
      const rawLastModified = form.get("lastModified");
      lastModified = typeof rawLastModified === "string" ? rawLastModified : null;
    } else {
      const body = (await req.json()) as {
        label?: unknown;
        mediaType?: unknown;
        data?: unknown;
        text?: unknown;
      };
      requestedLabel = body.label;
      if (typeof body.text === "string" && body.text.trim()) {
        buffer = Buffer.from(body.text, "utf8");
        mediaType = "text/plain";
      } else if (typeof body.data === "string" && typeof body.mediaType === "string") {
        if (!ACCEPTED.test(body.mediaType)) throw new Error("この形式は取り込めません");
        buffer = Buffer.from(body.data, "base64");
        mediaType = body.mediaType;
      } else {
        throw new Error("素材が空です");
      }
    }
    if (buffer.length === 0) throw new Error("素材が空です");
    if (buffer.length > MAX_BYTES) throw new Error("素材が大きすぎます（12MBまで）");

    const label =
      typeof requestedLabel === "string" && requestedLabel.trim()
        ? requestedLabel.trim().slice(0, 200)
        : mediaType === "text/plain"
          ? "貼り付けたテキスト"
          : "素材";
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const uploadFingerprint =
      lastModified && /^\d+$/.test(lastModified)
        ? `${label}:${buffer.length}:${lastModified}`
        : null;

    // A retry may arrive after the browser lost the connection. Reuse the
    // material already registered for this take instead of writing another
    // object and pin. The client also skips known fingerprints before sending.
    const existing = await supabase
      .from("brand_materials")
      .select("id, kind, label, media_type, bytes, created_at")
      .eq("take_id", loaded.take.id)
      .eq("checksum", checksum)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error("既存の素材を確認できませんでした");
    if (existing.data) {
      const pinned = await supabase
        .from("take_inputs")
        .select("material_id")
        .eq("take_id", loaded.take.id)
        .eq("material_id", existing.data.id)
        .eq("role", SOURCE_ROLE)
        .limit(1)
        .maybeSingle();
      if (pinned.error) throw new Error("素材の登録状態を確認できませんでした");
      if (!pinned.data) {
        const repinned = await supabase.from("take_inputs").insert({
          take_id: loaded.take.id,
          material_id: existing.data.id,
          role: SOURCE_ROLE,
          checksum,
        });
        if (repinned.error) throw new Error("素材を入力として固定できませんでした");
      }
      // A PDF registered before its contents were listed gets them now, while
      // the bytes are in hand. Idempotent: one that already has them writes none.
      const expanded = isPdf(mediaType)
        ? await expandPdf(
            supabase,
            { id: existing.data.id, brand_id: brandId, take_id: loaded.take.id, label },
            buffer,
            user.id,
          )
        : {};
      return Response.json(
        { material: existing.data, duplicate: true, ...expanded },
        { status: 200 },
      );
    }

    // Content hash in the key, as everywhere else: the same bytes uploaded
    // twice cannot become two objects.
    const r2Key = `brands/${brandId}/takes/${loaded.take.id}/materials/${checksum}`;
    await putR2Object(r2Key, buffer, mediaType, "private, max-age=0");

    // Measured while the bytes are in hand, and kept on the row. Doing it later
    // means fetching the object back out of R2; doing it per-run means the same
    // question gets a fresh answer every time, and a wrong one draws a mark as
    // a white rectangle (docs/asset-normalization.md §6).
    const measurement = await measureMaterial(buffer, mediaType);

    const materialId = randomUUID();
    const inserted = await supabase
      .from("brand_materials")
      .insert({
        id: materialId,
        scope: "take",
        brand_id: brandId,
        take_id: loaded.take.id,
        kind: kindFor(mediaType),
        label,
        media_type: mediaType,
        r2_key: r2Key,
        bytes: buffer.length,
        checksum,
        ...measurementColumns(measurement),
        source_kind: "upload",
        provenance: {
          source: "video_brief_input",
          uploaded_by: user.id,
          ...(uploadFingerprint ? { upload_fingerprint: uploadFingerprint } : {}),
        },
        created_by: user.id,
      })
      .select("id, kind, label, media_type, bytes, created_at")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      await deleteR2Object(r2Key).catch(() => undefined);
      throw new Error("素材を登録できませんでした");
    }

    // Pinning is what makes it an input of THIS take rather than a file that
    // happens to sit nearby.
    const pinned = await supabase.from("take_inputs").insert({
      take_id: loaded.take.id,
      material_id: materialId,
      role: SOURCE_ROLE,
      checksum,
    });
    if (pinned.error) {
      await supabase.from("brand_materials").delete().eq("id", materialId);
      await deleteR2Object(r2Key).catch(() => undefined);
      throw new Error("素材を入力として固定できませんでした");
    }

    // Taken apart in the same request (§9.4): the images inside become child
    // rows, pinned beside the PDF, listed under it, each one downloadable. The
    // PDF is still what the reading stage hands over, whole.
    const expanded = isPdf(mediaType)
      ? await expandPdf(
          supabase,
          { id: materialId, brand_id: brandId, take_id: loaded.take.id, label },
          buffer,
          user.id,
        )
      : {};

    return Response.json({ material: inserted.data, ...expanded }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "素材を追加できませんでした" },
      { status: 400 },
    );
  }
}

/**
 * Delete a material this video holds, and everything that came out of it.
 *
 * A real deletion, not an unpin (2026-09-08). Unpinning left the row in the
 * inventory for ever: a file uploaded by mistake could not be taken back, the
 * two lists disagreed about what the video had, and the bin icon promised
 * something the code did not do. One material, one lifetime, one bin.
 *
 * The order is deliberate. Pins go first because the schema forbids deleting a
 * pinned material at all; the brief is withdrawn next, while the rows still
 * exist, so a failure there leaves a recoverable state rather than pointers
 * into nothing; the rows and then the bytes go last.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const loaded = await loadTake(supabase, brandId, videoId);
  if ("error" in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }
  const url = new URL(req.url);
  const materialId = url.searchParams.get("materialId");
  if (!materialId) {
    return Response.json({ error: "素材IDが必要です" }, { status: 400 });
  }

  // The file and everything derived from it: a PDF leaves with its images,
  // because `derived_from_material_id` is ON DELETE SET NULL and orphans would
  // surface as parentless rows in the inventory.
  const resolved = await resolveMaterialFamily(supabase, {
    brandId,
    takeId: loaded.take.id,
    materialId,
  });
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const { family } = resolved;

  const shared = await heldByOtherTakes(supabase, loaded.take.id, family);
  if ("error" in shared) {
    return Response.json({ error: shared.error }, { status: shared.status });
  }
  if (shared.others > 0) {
    return Response.json(
      {
        error:
          "この素材は他の動画も入力として使っているため削除できません。この動画からだけ外すことはできません",
      },
      { status: 409 },
    );
  }

  const unpinned = await unpinFamily(supabase, loaded.take.id, family);
  if (unpinned) {
    return Response.json({ error: unpinned.error }, { status: unpinned.status });
  }

  // What the take still holds, in any role. A file pinned again as something
  // else — a normalised copy, the mark — is still here, and nothing of it leaves.
  const remaining = await supabase
    .from("take_inputs")
    .select("material_id")
    .eq("take_id", loaded.take.id);
  if (remaining.error) {
    return Response.json({ error: "素材の状態を確認できませんでした" }, { status: 500 });
  }
  const held = new Set((remaining.data ?? []).map((row) => row.material_id as string));

  // The values that rested on it go with it (lib/event-cm/withdraw.ts). Back to
  // the template's proposal for this brand, which is what the take opened with.
  let withdrawn: Withdrawal[] = [];
  const brief = (loaded.take.brief as EventCmBrief | null) ?? null;
  if (loaded.take.template_id === "event-cm" && brief) {
    const seeded = await seedEventCmFromBrand(supabase, {
      brandId,
      userId: user.id,
      ...(brief.artDirection ? { artDirection: brief.artDirection } : {}),
    });
    if (seeded.ok) {
      const result = withdrawMaterials(brief, held, seeded.seeded.brief);
      if (result.withdrawn.length > 0) {
        const validated = validateBrief("event-cm", result.brief);
        if (!validated.ok) {
          return Response.json(
            { error: `削除した資料の値を戻せませんでした: ${validated.issues.join(", ")}` },
            { status: 500 },
          );
        }
        const saved = await supabase
          .from("takes")
          .update({ brief: validated.brief, updated_at: new Date().toISOString() })
          .eq("id", loaded.take.id);
        if (saved.error) {
          return Response.json({ error: "削除した資料の値を戻せませんでした" }, { status: 500 });
        }
        withdrawn = result.withdrawn;
      }
    }
  }

  const destroyed = await destroyFamily(supabase, family);
  if ("error" in destroyed) {
    // The pins and the brief are already released, which is the recoverable
    // half. Saying so beats reporting success over a file still in the list.
    return Response.json({ error: destroyed.error, withdrawn }, { status: destroyed.status });
  }

  return Response.json({
    ok: true,
    withdrawn,
    deleted: destroyed.destroyed.deleted.map((row) => ({ id: row.id, label: row.label })),
  });
}
