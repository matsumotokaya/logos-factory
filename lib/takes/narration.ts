import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object, headR2Object, putR2Object } from "@/lib/r2";
import type { VoiceTrackOf } from "@/lib/voice/track";

// Pin a spoken narration to its take.
//
// The bytes go to R2 first, then one RPC does the database half — material
// registration, take_inputs pin, and the brief's voice slot — as a single
// transaction. A half-attached voice would leave a take whose brief promises
// audio no renderer can find.
//
// Content-addressed: the same WAV attached twice reuses the same material, so
// a retry after a dropped connection is safe rather than duplicating.

export async function attachTakeNarration<Scene>(
  supabase: SupabaseClient,
  input: {
    takeId: string;
    brandId: string;
    userId: string;
    wav: Buffer;
    track: VoiceTrackOf<Scene>;
    /** take_inputs role. One per narration slot a template has. */
    role: string;
    label: string;
    sourceRef?: Record<string, unknown>;
  },
): Promise<{ materialId: string; checksum: string; created: boolean }> {
  const checksum = createHash("sha256").update(input.wav).digest("hex");
  const r2Key =
    `brands/${input.brandId}/takes/${input.takeId}/materials/` +
    `${input.role}-${checksum.slice(0, 16)}.wav`;

  const existed = await headR2Object(r2Key);
  if (!existed) {
    await putR2Object(
      r2Key,
      input.wav,
      "audio/wav",
      "private, max-age=31536000, immutable",
    );
  } else if (existed.size !== input.wav.byteLength) {
    throw new Error("同じ音声キーに異なるサイズのR2オブジェクトがあります");
  }

  const materialId = randomUUID();
  const { data, error } = await supabase.rpc("attach_take_narration", {
    p_take_id: input.takeId,
    p_material_id: materialId,
    p_r2_key: r2Key,
    p_bytes: input.wav.byteLength,
    p_checksum: checksum,
    p_duration_ms: Math.round(input.track.totalMs),
    p_track: input.track,
    p_created_by: input.userId,
    p_role: input.role,
    p_label: input.label,
    p_source_ref: input.sourceRef ?? {},
  });
  if (error) {
    // Registering failed, so the object has no owner. Removing it keeps R2
    // from accumulating bytes nothing points at.
    if (!existed) {
      try {
        await deleteR2Object(r2Key);
      } catch (cleanupError) {
        throw new Error(
          `${error.message}; R2補償削除にも失敗しました: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
    }
    throw new Error(`ナレーションを固定できませんでした: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const adoptedId = (row as { material_id?: string } | null)?.material_id;
  if (!adoptedId) throw new Error("固定したナレーションを解決できませんでした");
  return {
    materialId: adoptedId,
    checksum,
    created: (row as { created?: boolean } | null)?.created === true,
  };
}
