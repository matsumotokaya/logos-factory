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

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** Pin role for anything supplied as briefing material. */
export const SOURCE_ROLE = "brief_source";

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
    .select("id, template_id")
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
      "role, pinned_at, brand_materials(id, kind, label, media_type, bytes, created_at, provenance)",
    )
    .eq("take_id", loaded.take.id)
    .eq("role", SOURCE_ROLE);
  if (error) {
    return Response.json({ error: "素材を取得できませんでした" }, { status: 500 });
  }

  type Row = {
    pinned_at: string;
    brand_materials:
      | {
          id: string;
          kind: string;
          label: string;
          media_type: string | null;
          bytes: number | null;
          provenance: { upload_fingerprint?: unknown } | null;
        }
      | Array<{
          id: string;
          kind: string;
          label: string;
          media_type: string | null;
          bytes: number | null;
          provenance: { upload_fingerprint?: unknown } | null;
        }>
      | null;
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
            pinnedAt: row.pinned_at,
            upload_fingerprint:
              typeof material.provenance?.upload_fingerprint === "string"
                ? material.provenance.upload_fingerprint
                : null,
          }
        : null;
    })
    .filter((material): material is NonNullable<typeof material> => material !== null);

  return Response.json({ materials }, { headers: { "Cache-Control": "no-store" } });
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
      return Response.json({ material: existing.data, duplicate: true }, { status: 200 });
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

    return Response.json({ material: inserted.data }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "素材を追加できませんでした" },
      { status: 400 },
    );
  }
}

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

  const { error } = await supabase
    .from("take_inputs")
    .delete()
    .eq("take_id", loaded.take.id)
    .eq("material_id", materialId)
    .eq("role", SOURCE_ROLE);
  if (error) {
    return Response.json({ error: "素材を外せませんでした" }, { status: 500 });
  }
  // The material row and its bytes stay: another take may pin the same file,
  // and content-addressed objects are cheap to keep and impossible to recreate.
  return Response.json({ ok: true });
}
