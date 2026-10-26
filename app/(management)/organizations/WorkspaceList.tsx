"use client";

// The list of worlds.
//
// An Organization is a workspace and nothing spans two (§19.2), so the app
// shows one at a time and this is where you leave one for another. It is also
// the only screen that says out loud how many there are — the sidebar shows
// the current one and gives no hint that others exist.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ORG_ROLE_LABELS, listMyOrgs, type Organization } from "@/lib/org";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOrganizationSummary } from "@/lib/brand-hierarchy";
import {
  readCurrentWorkspaceId,
  resolveWorkspace,
  writeCurrentWorkspaceId,
} from "@/lib/workspace";

export default function WorkspaceList() {
  const [workspaces, setWorkspaces] = useState<Organization[] | null>(null);
  const [brandCounts, setBrandCounts] = useState<Map<string, number>>(new Map());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mine = await listMyOrgs();
        if (cancelled) return;
        setWorkspaces(mine);
        setCurrentId(resolveWorkspace(mine, readCurrentWorkspaceId())?.id ?? null);

        // Brand counts come from the tree endpoint the sidebar already uses,
        // so the number here and the number there cannot disagree.
        const response = await authedFetch("/api/brands");
        const body = (await response.json().catch(() => null)) as {
          organizations?: BrandOrganizationSummary[];
        } | null;
        if (cancelled || !body?.organizations) return;
        setBrandCounts(
          new Map(
            body.organizations.map((organization) => [
              organization.id,
              organization.brands.length,
            ]),
          ),
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "ワークスペースを読み込めませんでした",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (id: string) => {
    writeCurrentWorkspaceId(id);
    setCurrentId(id);
    // A full load, not a client transition: the sidebar reads the choice on
    // mount, and every open brand page belongs to the workspace being left.
    window.location.assign("/brands");
  };

  if (error) {
    return (
      <p role="alert" className="text-pretty text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!workspaces) {
    return (
      <div aria-busy="true" aria-label="読み込み中" className="space-y-3">
        <div className="h-20 rounded-2xl bg-ink/5" />
        <div className="h-20 rounded-2xl bg-ink/5" />
      </div>
    );
  }
  if (workspaces.length === 0) {
    return (
      <p className="text-pretty text-sm text-ink-muted">
        所属しているワークスペースがありません。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {workspaces.map((workspace) => {
        const isCurrent = workspace.id === currentId;
        const count = brandCounts.get(workspace.id);
        return (
          <li
            key={workspace.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline p-5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/organizations/${workspace.id}`}
                  className="text-balance font-display text-lg font-semibold underline-offset-4 hover:underline"
                >
                  {workspace.name.trim() || "名称未設定のワークスペース"}
                </Link>
                {isCurrent ? (
                  <span className="rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    表示中
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {ORG_ROLE_LABELS[workspace.myRole]}
                {count === undefined ? "" : ` ・ ${count}ブランド`}
              </p>
            </div>
            {isCurrent ? (
              <Link
                href="/brands"
                className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                ブランドを見る
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => choose(workspace.id)}
                className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                このワークスペースに切り替える
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
