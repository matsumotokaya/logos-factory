import { ensureSession, supabase } from "@/lib/supabase/client";

// A fetch that carries the signed-in session's bearer token, for the app's own
// API routes (they read the user from the Authorization header). Uncached by
// default: these routes are mutable read models, and a cached read after a
// save would show the state from before it.

/**
 * Thrown when a request has no session to authenticate with. Callers that own a
 * visible affordance should catch this and open the sign-in dialog: the
 * visitor's next step is signing in, not reading about it. The message is only a
 * fallback for callers that render `.message` straight into an error slot, so it
 * stays plain — never mention roles, Labs or anything else internal.
 */
export class AuthRequiredError extends Error {
  constructor() {
    super("サインインしてから、もう一度お試しください。");
    this.name = "AuthRequiredError";
  }
}

export async function authedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  // Guests browse on an anonymous session, established by AuthProvider on mount.
  // Establishing it here too keeps a fetch that fires before the provider
  // settles from failing on a token that is merely late, not missing.
  await ensureSession().catch(() => {});
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AuthRequiredError();
  return fetch(path, {
    ...init,
    cache: init?.cache ?? "no-store",
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
