"use client";

// One workspace: who is in it and what it holds.
//
// This is not the v2 organization screen brought back. That one edited a
// real-world company — legal name, industry, parent company — and v3 has no
// such entity: those facts belong to a Brand's knowledge claims now (§19.2).
// What is left is the container itself, which has members and contents.

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOrganizationSummary } from "@/lib/brand-hierarchy";
import {
  ORG_ROLE_LABELS,
  listMembers,
  listMyOrgs,
  type OrgMember,
  type Organization,
} from "@/lib/org";
import {
  readCurrentWorkspaceId,
  resolveWorkspace,
  writeCurrentWorkspaceId,
} from "@/lib/workspace";

const KIND_LABELS: Record<string, string> = {
  organization: "組織",
  corporate: "企業",
  business: "事業",
  service: "サービス",
  product: "製品",
  media: "メディア",
  event: "イベント",
};

export default function WorkspaceDetail({ id }: { id: string }) {
  const [workspace, setWorkspace] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [brands, setBrands] = useState<BrandOrganizationSummary["brands"]>([]);
  const [isCurrent, setIsCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mine = await listMyOrgs();
        if (cancelled) return;
        const found = mine.find((candidate) => candidate.id === id) ?? null;
        if (!found) {
          setNotFound(true);
          return;
        }
        setWorkspace(found);
        setIsCurrent(resolveWorkspace(mine, readCurrentWorkspaceId())?.id === id);

        const [memberRows, response] = await Promise.all([
          listMembers(id),
          authedFetch("/api/brands"),
        ]);
        if (cancelled) return;
        setMembers(memberRows);
        const body = (await response.json().catch(() => null)) as {
          organizations?: BrandOrganizationSummary[];
        } | null;
        if (cancelled) return;
        setBrands(
          body?.organizations?.find((organization) => organization.id === id)
            ?.brands ?? [],
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
  }, [id]);

  const switchHere = () => {
    writeCurrentWorkspaceId(id);
    window.location.assign("/brands");
  };

  if (notFound) {
    return (
      <main className="w-full px-6 py-10 md:px-10">
        <p className="text-pretty text-sm text-ink-muted">
          このワークスペースは見つかりませんでした。所属していないか、削除された可能性があります。
        </p>
        <Link
          href="/organizations"
          className="mt-5 inline-block rounded-full border border-hairline px-4 py-2 text-xs font-semibold hover:border-ink"
        >
          ワークスペース一覧へ
        </Link>
      </main>
    );
  }
  if (error) {
    return (
      <main className="w-full px-6 py-10 md:px-10">
        <p role="alert" className="text-pretty text-sm text-red-700">
          {error}
        </p>
      </main>
    );
  }

  return (
    <main className="w-full px-6 py-10 md:px-10">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Link href="/organizations" className="underline underline-offset-4 hover:text-ink">
          ワークスペース
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-ink">
          {workspace?.name?.trim() || "…"}
        </span>
      </nav>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <h1 className="text-balance font-display text-3xl font-semibold">
            {workspace?.name?.trim() || "名称未設定のワークスペース"}
          </h1>
          <p className="mt-2 text-xs text-ink-muted">
            {workspace ? `あなたの権限: ${ORG_ROLE_LABELS[workspace.myRole]}` : ""}
            {isCurrent ? " ・ 表示中" : ""}
          </p>
        </div>
        {isCurrent ? (
          <Link
            href="/brands"
            className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold hover:border-ink"
          >
            ブランドを見る
          </Link>
        ) : (
          <button
            type="button"
            onClick={switchHere}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-ink/85"
          >
            このワークスペースに切り替える
          </button>
        )}
      </header>

      <section className="mt-8">
        <h2 className="text-balance text-lg font-semibold">
          ブランド
          <span className="ml-2 tabular-nums text-xs font-normal text-ink-faint">
            {brands.length}件
          </span>
        </h2>
        {brands.length === 0 ? (
          <p className="mt-3 text-pretty text-sm text-ink-muted">
            まだブランドがありません。トップページでURLを入れると作られます。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline rounded-2xl border border-hairline">
            {brands.map((brand) => (
              <li key={brand.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link
                  href={`/brands/${brand.id}`}
                  className="min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {brand.name}
                </Link>
                <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-0.5 text-[10px] text-ink-muted">
                  {KIND_LABELS[brand.kind] ?? brand.kind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-balance text-lg font-semibold">
          メンバー
          {members ? (
            <span className="ml-2 tabular-nums text-xs font-normal text-ink-faint">
              {members.length}人
            </span>
          ) : null}
        </h2>
        {members === null ? (
          <div aria-busy="true" className="mt-3 h-16 rounded-2xl bg-ink/5" />
        ) : (
          <ul className="mt-3 divide-y divide-hairline rounded-2xl border border-hairline">
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <span className="min-w-0 truncate text-sm">
                  {member.email ?? "（メール未登録）"}
                  {member.isMe ? (
                    <span className="ml-2 text-[10px] text-ink-faint">あなた</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {ORG_ROLE_LABELS[member.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-pretty text-xs text-ink-faint">
          招待と権限の変更は{" "}
          <Link href="/brand" className="underline underline-offset-2 hover:text-ink">
            ワークスペース設定
          </Link>{" "}
          で行います。
        </p>
      </section>
    </main>
  );
}
