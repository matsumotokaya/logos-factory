"use client";

// The front door: a site's URL in, a brand out. Everything the product makes
// — LPs, videos, logo presentations — is made from a brand afterwards, so
// this page asks for nothing else. It asks which workspace only when there is
// something to choose; a first visitor sees a URL field and one button.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { authedFetch, AuthRequiredError } from "@/lib/authed-fetch";
import { requestAuthDialog, useAuth } from "@/lib/auth";
import { readCurrentWorkspaceId, writeCurrentWorkspaceId } from "@/lib/workspace";

/** The workspace menu's 「新しいワークスペース」 entry; never a real org_id. */
const NEW_WORKSPACE = "new";

type Workspace = { id: string; name: string };

export default function TopPage() {
  const router = useRouter();
  const { enabled, isSignedIn, loading: authLoading } = useAuth();
  const [url, setUrl] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [workspaceChoice, setWorkspaceChoice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only a signed-in account has workspaces to offer.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authedFetch("/api/brands");
        const body = res.ok
          ? ((await res.json()) as { organizations?: Workspace[] })
          : null;
        if (!cancelled) setWorkspaces(body?.organizations ?? []);
      } catch {
        if (!cancelled) setWorkspaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Asked only when there is something to ask. The last workspace opened in
  // brand management is the starting point while it is still one of these.
  const options = isSignedIn ? (workspaces ?? []) : [];
  const askWorkspace = options.length > 0;
  const remembered = askWorkspace ? readCurrentWorkspaceId() : null;
  const effectiveWorkspace =
    workspaceChoice ??
    (options.some((option) => option.id === remembered)
      ? remembered
      : options.length === 1
        ? options[0].id
        : null);

  const create = async () => {
    setError(null);
    if (!isSignedIn) {
      requestAuthDialog("create");
      return;
    }
    setStarting(true);
    try {
      const res = await authedFetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          ...(askWorkspace && effectiveWorkspace === NEW_WORKSPACE
            ? { newWorkspace: true }
            : askWorkspace && effectiveWorkspace
              ? { organizationId: effectiveWorkspace }
              : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        brandId?: string;
        organizationId?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.brandId) {
        throw new Error(body?.error ?? `ブランドを作成できませんでした (HTTP ${res.status})`);
      }
      // The brand page shows the workspace it is in, which may be new.
      if (body.organizationId) writeCurrentWorkspaceId(body.organizationId);
      router.push(`/brands/${body.brandId}`);
    } catch (e) {
      setStarting(false);
      if (e instanceof AuthRequiredError) {
        requestAuthDialog("create");
        return;
      }
      setError(e instanceof Error ? e.message : "ブランドを作成できませんでした");
    }
  };

  const workspaceMissing = askWorkspace && !effectiveWorkspace;

  return (
    <>
      <main className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center px-6 py-24">
        <h1 className="text-balance font-display text-4xl font-semibold text-ink">
          ブランドを、サイトから。
        </h1>
        <p className="mt-4 text-pretty text-sm text-ink-muted">
          サイトのURLを入れると、名前・種別・色・書体・ロゴ・画像を読み取って、ブランドとして登録します。
          LPや動画などの制作物は、そのブランドから作ります。
        </p>

        <form
          className="mt-8 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && !starting && !workspaceMissing) void create();
          }}
        >
          <label htmlFor="top-url" className="sr-only">
            サイトのURL
          </label>
          <input
            id="top-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={starting}
            className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />

          {askWorkspace ? (
            <div>
              <label htmlFor="top-workspace" className="text-[12px] text-ink-muted">
                登録先のワークスペース
              </label>
              <select
                id="top-workspace"
                value={effectiveWorkspace ?? ""}
                onChange={(e) => setWorkspaceChoice(e.target.value || null)}
                disabled={starting}
                className="mt-1 w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-ink outline-none focus:border-ink"
              >
                {effectiveWorkspace ? null : <option value="">選んでください</option>}
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name.trim() || "名称未設定のワークスペース"}
                  </option>
                ))}
                <option value={NEW_WORKSPACE}>新しいワークスペース（サイトの会社名で作成）</option>
              </select>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              // Held while the session resolves, so a press always does
              // something visible: create, or open the sign-in dialog.
              disabled={!url.trim() || starting || authLoading || workspaceMissing}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {starting ? "作成しています…" : "ブランドを作る"}
            </button>
            {enabled && isSignedIn ? (
              <Link
                href="/brands"
                className="rounded-full border border-ink px-5 py-2.5 text-sm font-semibold text-ink hover:bg-ink hover:text-white"
              >
                ブランド管理を開く
              </Link>
            ) : null}
          </div>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
