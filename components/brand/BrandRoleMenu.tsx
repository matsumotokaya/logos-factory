"use client";

// The line above the brand's name — 「メインブランド」, 「Funds › サブブランド」
// or 「ブランド」 — opens a drawer about the brand's standing in the
// workspace. Each choice is explained before it is offered, because the
// two 「メインブランド」 sentences mean different things: making THIS brand
// the workspace's main, and naming the brand this one sits under.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOrganizationSummary, BrandSummary } from "@/lib/brand-hierarchy";
import { refreshBrandTree } from "@/lib/brand-events";
import AddBrandDialog from "@/components/management/AddBrandDialog";
import { MainMark } from "@/components/management/MainMark";
import StageDrawer from "@/components/pipeline/StageDrawer";

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-3.5">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const buttonClass =
  "rounded-full border border-ink px-4 py-1.5 text-xs font-semibold transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink";

export default function BrandRoleMenu({
  brand,
  onChanged,
  onError,
}: {
  brand: {
    id: string;
    name: string;
    organizationId: string;
    parent: { id: string; name: string } | null;
    isMain: boolean;
  };
  /** The standing changed; the page re-reads itself. */
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<BrandOrganizationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [parentChoice, setParentChoice] = useState<string>(brand.parent?.id ?? "");

  // The workspace's brands, for the list of possible parents.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await authedFetch("/api/brands").catch(() => null);
      const body = res && res.ok
        ? ((await res.json().catch(() => null)) as { organizations?: BrandOrganizationSummary[] } | null)
        : null;
      if (cancelled) return;
      setWorkspace(body?.organizations?.find((org) => org.id === brand.organizationId) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, brand.organizationId, brand.parent?.id, brand.isMain]);

  const patch = useCallback(
    async (body: Record<string, unknown>, failure: string) => {
      setBusy(true);
      try {
        const res = await authedFetch(`/api/brands/${brand.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(json?.error ?? failure);
        refreshBrandTree();
        await onChanged();
        return true;
      } catch (e) {
        onError(e instanceof Error ? e.message : failure);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [brand.id, onChanged, onError],
  );

  const brands: BrandSummary[] = workspace?.brands ?? [];
  const mainBrand = brands.find((row) => row.isMain) ?? null;
  // A brand cannot sit under itself or under anything that sits under it.
  const parentOf = new Map(brands.map((row) => [row.id, row.parentBrandId]));
  const descendsFrom = (candidate: string, ancestor: string) => {
    for (let cursor = parentOf.get(candidate) ?? null; cursor; cursor = parentOf.get(cursor) ?? null) {
      if (cursor === ancestor) return true;
    }
    return false;
  };
  const parentOptions = brands.filter((row) => row.id !== brand.id && !descendsFrom(row.id, brand.id));
  const effectiveChoice =
    parentChoice || (mainBrand && mainBrand.id !== brand.id ? mainBrand.id : "");

  const standing = brand.isMain ? (
    <span className="flex items-center gap-1.5">
      <MainMark />
      メインブランド
    </span>
  ) : brand.parent ? (
    <span className="flex items-center gap-1.5">
      <Link
        href={`/brands/${brand.parent.id}`}
        onClick={(event) => event.stopPropagation()}
        className="hover:text-ink hover:underline"
      >
        {brand.parent.name}
      </Link>
      <span aria-hidden="true" className="text-ink-faint">›</span>
      <span>サブブランド</span>
    </span>
  ) : (
    "ブランド"
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="このブランドの位置づけ（メイン／サブ）を変える"
        className="flex items-center gap-1.5 rounded-full border border-hairline py-0.5 pl-2 pr-2.5 text-xs font-semibold text-ink-muted transition hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {standing}
        <GearIcon />
      </button>

      {open ? (
        <StageDrawer
          title="このブランドの位置づけ"
          description="ワークスペースの中でこのブランドがどこに立つかを決めます。メインは1つ、サブブランドは別のブランドの下に置かれ、自分に無い色・書体・ロゴをそのブランドから受け取ります。"
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-6 text-[12px]">
            <section className="rounded-xl border border-hairline px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">いま</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {brand.isMain
                  ? "ワークスペースのメインブランド"
                  : brand.parent
                    ? `「${brand.parent.name}」のサブブランド`
                    : "独立したブランド（どのブランドにも属していません）"}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">ワークスペースのメインブランドにする</h3>
              <p className="text-pretty text-ink-muted">
                ワークスペースの顔になるブランドです。1つだけ選べて、ツリーに ★ が付きます。
                {mainBrand && mainBrand.id !== brand.id ? ` いまは「${mainBrand.name}」です。` : ""}
                付け替えても、どのブランドの値も動きません。
              </p>
              <div>
                <button
                  type="button"
                  disabled={busy || brand.isMain}
                  onClick={() => void patch({ main: true }, "メインブランドを変更できませんでした")}
                  className={buttonClass}
                >
                  {brand.isMain ? "すでにメインブランドです" : "メインブランドにする"}
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">メインブランドを指定</h3>
              <p className="text-pretty text-ink-muted">
                このブランドをどのブランドの下に置くかを決めます。指定すると、このブランドはそのブランドのサブブランドになり、自分で決めていない項目だけ、そのブランドの値がそのまま使われます。自分で決めた項目はそのまま残ります。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={effectiveChoice}
                  onChange={(event) => setParentChoice(event.target.value)}
                  disabled={busy || !workspace}
                  className="min-w-56 rounded-xl border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                >
                  {parentOptions.length === 0 ? <option value="">（他のブランドがありません）</option> : null}
                  {parentOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.isMain ? "（ワークスペースのメイン）" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !effectiveChoice || effectiveChoice === brand.parent?.id}
                  onClick={() =>
                    void patch({ parentBrandId: effectiveChoice }, "メインブランドを指定できませんでした")
                  }
                  className={buttonClass}
                >
                  {effectiveChoice === brand.parent?.id ? "指定済み" : "指定する"}
                </button>
              </div>
              {brand.parent ? (
                <div className="mt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patch({ parentBrandId: null }, "独立したブランドにできませんでした")}
                    className="text-xs text-ink-muted underline decoration-dotted underline-offset-4 hover:text-ink hover:decoration-solid"
                  >
                    「{brand.parent.name}」から外して、独立したブランドにする
                  </button>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    外しても、このブランド自身の値は何も消えません。受け取っていた項目が見えなくなるだけです。
                  </p>
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">サブブランドを追加</h3>
              <p className="text-pretty text-ink-muted">
                このブランドの下に、新しいブランドをサイトの URL から作ります。子会社や製品シリーズに。
              </p>
              <div>
                <button type="button" disabled={busy || !workspace} onClick={() => setAddingChild(true)} className={buttonClass}>
                  サブブランドを追加…
                </button>
              </div>
            </section>
          </div>
        </StageDrawer>
      ) : null}

      {workspace ? (
        <AddBrandDialog
          open={addingChild}
          onOpenChange={setAddingChild}
          organizationId={workspace.id}
          organizationName={workspace.name.trim() || "名称未設定のワークスペース"}
          parent={{ id: brand.id, name: brand.name }}
        />
      ) : null}
    </>
  );
}
