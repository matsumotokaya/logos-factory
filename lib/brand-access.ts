import "server-only";

import { requireUser } from "@/lib/supabase/server";

/**
 * Protect a brand Route Handler: any signed-in, registered user.
 *
 * Brand management used to sit behind the Labs gate (a platform role, and
 * LABS_ENABLED in production), so a new user could open /brands but every API
 * behind it answered 404. Which brands a user sees is decided by RLS on the
 * user-scoped client each route already uses — workspace membership — not by a
 * platform role. Anonymous sessions stay out: a brand belongs to a workspace,
 * and a guest has no account to own one.
 */
export async function guardBrandRequest(req: Request): Promise<Response | null> {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.isAnonymous) {
    return Response.json(
      { error: "ブランドの管理には登録済みのアカウントが必要です。" },
      { status: 403 },
    );
  }
  return null;
}
