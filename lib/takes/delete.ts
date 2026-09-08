import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object } from "@/lib/r2";
import { createAdminSupabase } from "@/lib/supabase/server";

// Deleting one take — the TypeScript side of `delete_take` (migration 0031).
//
// The RPC does everything that must happen in one transaction: authorise at the
// admin rung, refuse while a publication is live, decide what happens to
// materials that exist nowhere else, and queue the R2 keys whose reference count
// reached zero. What it cannot do is talk to R2. So this module drains the keys
// it hands back and then tells the queue which ones actually went.
//
// Two failures are treated very differently:
//
//   - A key that fails to delete stays in the queue with its error. The rows are
//     already gone; the object is garbage that `npm run v2:prune-r2` collects.
//     Reporting this as a failed deletion would be a lie — the take is deleted.
//   - A key that does not belong to this brand is never sent to R2 at all. The
//     RPC derives keys from rows the caller can admin, so this should be
//     impossible; it is checked because "delete this object key" is the one
//     operation in the app with no undo.

export type MaterialDisposition = "require_decision" | "promote" | "discard";

export interface AtRiskMaterial {
  id: string;
  label: string | null;
  kind: string | null;
}

export type DeleteTakeOutcome =
  | {
      ok: true;
      /** Keys still queued for a later sweep (R2 unreachable, or no service key). */
      cleanupPending: number;
      promotedMaterials: AtRiskMaterial[];
    }
  | {
      ok: false;
      status: number;
      error: string;
      /** Present when the caller must choose promote / discard and retry. */
      needsMaterialDecision?: AtRiskMaterial[];
    };

const DISPOSITIONS: MaterialDisposition[] = ["require_decision", "promote", "discard"];

/**
 * Absent means `discard`. Since 2026-09-08 a take's materials are copies that
 * belong to it alone (docs/asset-normalization.md §12), so there is nothing to
 * decide: deleting the take deletes its files. `promote` and
 * `require_decision` stay accepted for the RPC's sake and for callers that
 * still send them.
 */
export function parseMaterialDisposition(value: unknown): MaterialDisposition | null {
  if (value === undefined || value === null || value === "") return "discard";
  return typeof value === "string" && (DISPOSITIONS as string[]).includes(value)
    ? (value as MaterialDisposition)
    : null;
}

/** The RPC puts the at-risk list in the exception's DETAIL, which PostgREST
 *  forwards verbatim. A shape we cannot read must not become "delete failed for
 *  an unknown reason" — the message is still accurate without the list. */
function atRiskFrom(error: PostgrestError): AtRiskMaterial[] {
  const raw = error.details;
  if (typeof raw !== "string") return [];
  const start = raw.indexOf("[");
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(raw.slice(start)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.id !== "string") return [];
      return [
        {
          id: row.id,
          label: typeof row.label === "string" ? row.label : null,
          kind: typeof row.kind === "string" ? row.kind : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

function failureFor(error: PostgrestError): DeleteTakeOutcome {
  const message = error.message ?? "";
  if (message.includes("TAKE_NOT_FOUND")) {
    return { ok: false, status: 404, error: "動画が見つかりません" };
  }
  if (message.includes("TAKE_DELETE_FORBIDDEN")) {
    return { ok: false, status: 403, error: "これを削除する権限がありません" };
  }
  if (message.includes("TAKE_DELETE_BLOCKED_PUBLISHED")) {
    return {
      ok: false,
      status: 409,
      error: "公開中です。先に公開を終了してから削除してください",
    };
  }
  if (message.includes("TAKE_DELETE_NEEDS_MATERIAL_DECISION")) {
    return {
      ok: false,
      status: 409,
      error: "この成果物だけが持っている素材があります。扱いを選んでください",
      needsMaterialDecision: atRiskFrom(error),
    };
  }
  // canonical_slots.take_id is `on delete restrict`: a logo presentation is
  // reached through its slot, so removing the take would orphan /p/<id>.
  if (error.code === "23503") {
    return {
      ok: false,
      status: 409,
      error: "他の画面がこの成果物を代表として参照しているため削除できません",
    };
  }
  return { ok: false, status: 500, error: message || "削除できませんでした" };
}

async function drainKeys(
  brandId: string,
  keys: string[],
): Promise<{ failed: string[]; foreign: string[] }> {
  const foreign = keys.filter((key) => !key.startsWith(`brands/${brandId}/`));
  const mine = keys.filter((key) => key.startsWith(`brands/${brandId}/`));
  const failed: string[] = [];
  const batchSize = 10;
  for (let start = 0; start < mine.length; start += batchSize) {
    const batch = mine.slice(start, start + batchSize);
    const results = await Promise.allSettled(batch.map((key) => deleteR2Object(key)));
    results.forEach((result, index) => {
      if (result.status === "rejected") failed.push(batch[index]);
    });
  }
  return { failed, foreign };
}

export async function deleteTake(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    takeId: string;
    disposition: MaterialDisposition;
  },
): Promise<DeleteTakeOutcome> {
  const { data, error } = await supabase.rpc("delete_take", {
    p_take_id: input.takeId,
    p_material_disposition: input.disposition,
  });
  if (error) return failureFor(error);

  const result = (data ?? {}) as {
    deletionId?: string;
    objectKeys?: unknown;
    promotedMaterials?: unknown;
  };
  const objectKeys = Array.isArray(result.objectKeys)
    ? result.objectKeys.filter((key): key is string => typeof key === "string")
    : [];
  const promotedMaterials = Array.isArray(result.promotedMaterials)
    ? (result.promotedMaterials as AtRiskMaterial[])
    : [];

  if (objectKeys.length === 0 || !result.deletionId) {
    return { ok: true, cleanupPending: 0, promotedMaterials };
  }

  const { failed, foreign } = await drainKeys(input.brandId, objectKeys);
  const stillQueued = [...failed, ...foreign];

  // Emptying the queue needs service_role (0031 revokes it from authenticated).
  // A deployment without the key still deletes the objects; the rows simply wait
  // for the sweep. That is a strictly better outcome than refusing the delete.
  try {
    const admin = createAdminSupabase();
    const { data: remaining } = await admin.rpc("complete_r2_cleanup", {
      p_deletion_id: result.deletionId,
      p_failed_keys: stillQueued,
      p_error:
        foreign.length > 0
          ? `${foreign.length} key(s) outside brands/${input.brandId}/; ${failed.length} R2 deletion failure(s).`
          : failed.length > 0
            ? `${failed.length} R2 deletion failure(s).`
            : null,
    });
    return {
      ok: true,
      cleanupPending: Number(remaining ?? stillQueued.length),
      promotedMaterials,
    };
  } catch {
    return { ok: true, cleanupPending: objectKeys.length, promotedMaterials };
  }
}
