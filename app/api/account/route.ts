import { deleteR2Object, isR2Configured } from "@/lib/r2";
import {
  createAdminSupabase,
  requireUser,
  type VerifiedUser,
} from "@/lib/supabase/server";

export const maxDuration = 60;

type DeletionPreview = {
  personalLogoCount: number;
  deletedOrganizationCount: number;
  deletedOrganizationLogoCount: number;
  retainedOrganizationCount: number;
  r2ObjectCount: number;
  blockingOrganizations: Array<{ id: string; name: string }>;
};

type DeleteResult = {
  deletionId: string;
  objectKeys: string[];
  preview: DeletionPreview;
};

const R2_LOGO_MOCKUP_RE =
  /^logos\/[A-Za-z0-9]{8,24}\/candidates\/[0-9a-f-]{36}\/mockups\/[a-z0-9][a-z0-9-]{0,79}\.png$/;
// A brand's files (brand_materials, render_artifacts): brands/{id}/materials/…
// or brands/{id}/takes/{id}/{materials|renders|output}/…. Without this the
// RPC's brand keys were all filed as invalid and left in the bucket.
const R2_BRAND_OBJECT_RE =
  /^brands\/[0-9a-f-]{36}\/(?:materials|takes\/[0-9a-f-]{36}\/(?:materials|renders|output))\/[A-Za-z0-9._/-]+$/;

function isAccountObjectKey(key: string): boolean {
  if (key.includes("..")) return false;
  return R2_LOGO_MOCKUP_RE.test(key) || R2_BRAND_OBJECT_RE.test(key);
}

function registeredUser(user: VerifiedUser): boolean {
  return !user.isAnonymous;
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Account request failed.";
  if (message === "Unauthorized") {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return Response.json(
      { error: "アカウント削除のサーバー設定が未完了です。" },
      { status: 503 },
    );
  }
  // The body stays generic; the cause goes to the server log, where it was
  // missing when a foreign-key violation blocked every deletion (0058).
  console.error("Account request failed:", message);
  return Response.json({ error: "アカウント処理に失敗しました。" }, { status: 500 });
}

async function loadPreview(userId: string): Promise<DeletionPreview> {
  const { data, error } = await createAdminSupabase().rpc(
    "account_deletion_preview",
    { p_user_id: userId },
  );
  if (error || !data) {
    throw new Error(error?.message || "Deletion preview is unavailable.");
  }
  return data as DeletionPreview;
}

async function deleteR2Key(key: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await deleteR2Object(key);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("R2 deletion failed.");
}

async function deleteR2Keys(keys: string[]): Promise<string[]> {
  const failed: string[] = [];
  const batchSize = 10;
  for (let start = 0; start < keys.length; start += batchSize) {
    const batch = keys.slice(start, start + batchSize);
    const results = await Promise.allSettled(batch.map(deleteR2Key));
    results.forEach((result, index) => {
      if (result.status === "rejected") failed.push(batch[index]);
    });
  }
  return failed;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!registeredUser(user)) {
      return Response.json(
        { error: "登録アカウントのみ退会できます。" },
        { status: 403 },
      );
    }
    return Response.json(await loadPreview(user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    if (!registeredUser(user)) {
      return Response.json(
        { error: "登録アカウントのみ退会できます。" },
        { status: 403 },
      );
    }

    let body: { confirmation?: unknown };
    try {
      body = (await req.json()) as { confirmation?: unknown };
    } catch {
      return Response.json({ error: "確認入力が必要です。" }, { status: 400 });
    }

    const expected = user.email?.trim().toLowerCase() || "delete";
    const confirmation =
      typeof body.confirmation === "string"
        ? body.confirmation.trim().toLowerCase()
        : "";
    if (confirmation !== expected) {
      return Response.json({ error: "確認入力が一致しません。" }, { status: 400 });
    }

    // Fail before deleting DB/Auth data when the account has R2 objects but
    // this deployment cannot reach R2. The RPC repeats all authorization and
    // last-owner checks inside the deletion transaction.
    const preview = await loadPreview(user.id);
    if (preview.blockingOrganizations.length > 0) {
      return Response.json(
        {
          error: "別のメンバーを組織オーナーにしてから退会してください。",
          blockingOrganizations: preview.blockingOrganizations,
        },
        { status: 409 },
      );
    }
    if (preview.r2ObjectCount > 0 && !isR2Configured()) {
      return Response.json(
        { error: "R2接続が未設定のため、安全にアカウントを削除できません。" },
        { status: 503 },
      );
    }

    const admin = createAdminSupabase();
    const { data, error } = await admin.rpc("delete_user_account", {
      p_user_id: user.id,
    });
    if (error || !data) {
      throw new Error(error?.message || "Account deletion failed.");
    }
    const result = data as DeleteResult;
    const queuedKeys = Array.isArray(result.objectKeys) ? result.objectKeys : [];
    const objectKeys = queuedKeys.filter(
      (key): key is string =>
        typeof key === "string" && isAccountObjectKey(key),
    );
    const invalidKeys = queuedKeys.filter(
      (key): key is string =>
        typeof key === "string" && !isAccountObjectKey(key),
    );
    const failedKeys = await deleteR2Keys(objectKeys);
    const queuedFailures = [...invalidKeys, ...failedKeys];
    const cleanupError =
      invalidKeys.length > 0
        ? `${invalidKeys.length} invalid queued object key(s); ${failedKeys.length} R2 deletion failure(s).`
        : failedKeys.length > 0
          ? `${failedKeys.length} R2 deletion failure(s).`
          : null;

    const { data: remaining, error: cleanupRpcError } = await admin.rpc(
      "complete_account_r2_cleanup",
      {
        p_deletion_id: result.deletionId,
        p_failed_keys: queuedFailures,
        p_error: cleanupError,
      },
    );
    const cleanupPending = cleanupRpcError
      ? queuedKeys.length
      : Number(remaining ?? 0);

    return Response.json(
      {
        ok: true,
        cleanupPending,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
