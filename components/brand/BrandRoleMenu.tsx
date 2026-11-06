"use client";

// The line above the brand's name — 「メインブランド」, 「Funds › サブブランド」
// or 「ブランド」 — as a menu. What it says is the brand's standing in the
// workspace, so the same choices the tree's row menu offers are here too:
// make it the main, put it under another brand, make it independent, add a
// sub-brand beneath it. The page does what the row does, in the same words.

import { Menu } from "@base-ui/react/menu";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOrganizationSummary, BrandSummary } from "@/lib/brand-hierarchy";
import { refreshBrandTree } from "@/lib/brand-events";
import { cn } from "@/lib/cn";
import AddBrandDialog from "@/components/management/AddBrandDialog";
import { MainMark } from "@/components/management/MainMark";
import SetParentDialog from "@/components/management/SetParentDialog";

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-3.5">
      <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const [workspace, setWorkspace] = useState<BrandOrganizationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosingParent, setChoosingParent] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);

  // The workspace's brands, for the sub-brand dialog's list and the main's
  // name. Read once; the dialogs are the only readers.
  useEffect(() => {
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
  }, [brand.organizationId, brand.parent?.id, brand.isMain]);

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

  const label: ReactNode = brand.isMain ? (
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

  const items: { id: string; label: string; blocked: string | null; run: () => void }[] = [
    {
      id: "make-main",
      label: "メインブランドにする",
      blocked: brand.isMain ? "すでにメインブランドです" : null,
      run: () => void patch({ main: true }, "メインブランドを変更できませんでした"),
    },
    {
      id: "set-parent",
      label: "サブブランドにする…",
      blocked: null,
      run: () => {
        setParentError(null);
        setChoosingParent(true);
      },
    },
    {
      id: "detach",
      label: "独立したブランドにする",
      blocked: brand.parent ? null : "どのブランドにも属していません",
      run: () => void patch({ parentBrandId: null }, "独立したブランドにできませんでした"),
    },
    {
      id: "add-child",
      label: "サブブランドを追加",
      blocked: null,
      run: () => setAddingChild(true),
    },
  ];

  const brands: BrandSummary[] = workspace?.brands ?? [];

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          disabled={busy}
          className={cn(
            "flex items-center gap-1 rounded-full py-0.5 pl-1 pr-1.5 text-xs font-semibold text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink data-[popup-open]:bg-ink/5 data-[popup-open]:text-ink disabled:opacity-50",
          )}
          title="このブランドの位置づけを変える"
        >
          {label}
          <ChevronDown />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50 outline-none">
            <Menu.Popup className="w-64 rounded-xl border border-hairline bg-paper p-1.5 shadow-lg outline-none">
              {items.map((item) => (
                <Menu.Item
                  key={item.id}
                  disabled={item.blocked !== null}
                  onClick={item.run}
                  className={cn(
                    "cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-ink/5",
                    item.blocked !== null && "cursor-default text-ink-faint data-[highlighted]:bg-transparent",
                  )}
                >
                  {item.label}
                  {item.blocked ? (
                    <span className="mt-0.5 block text-pretty text-[11px] leading-snug text-ink-faint">
                      {item.blocked}
                    </span>
                  ) : null}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {choosingParent ? (
        <SetParentDialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setChoosingParent(false);
          }}
          brand={{ id: brand.id, name: brand.name, parentBrandId: brand.parent?.id ?? null }}
          brands={brands}
          mainBrandId={brands.find((row) => row.isMain)?.id ?? null}
          saving={busy}
          error={parentError}
          onSave={(parentBrandId) =>
            void (async () => {
              setParentError(null);
              const ok = await patch({ parentBrandId }, "サブブランドにできませんでした");
              if (ok) setChoosingParent(false);
            })()
          }
        />
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
