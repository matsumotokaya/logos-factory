"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import { authedFetch } from "@/app/campaigns/campaign-ui";
import type {
  BrandOrganizationSummary,
  BrandSummary,
} from "@/lib/brand-hierarchy";
import { cn } from "@/lib/cn";
import { BRAND_TREE_REFRESH_EVENT } from "@/lib/brand-events";
import { readCurrentWorkspaceId, resolveWorkspace } from "@/lib/workspace";
import {
  brandActions,
  logoActions,
  takeActions,
  type TreeActionId,
} from "@/lib/brand-tree-actions";
import RowActionsMenu from "./RowActionsMenu";
import WorkspaceMenu from "./WorkspaceMenu";
import AddBrandDialog from "./AddBrandDialog";
import TreeDeleteDialog, {
  type AtRiskMaterial,
  type MaterialChoice,
} from "./TreeDeleteDialog";
import {
  deleteTreeNode,
  duplicateTreeNode,
  infoPath,
  pathAfterDelete,
  pathAfterDuplicate,
  viewingTarget,
  type TreeTarget,
} from "./tree-row-actions";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("size-4", open && "rotate-90")}
    >
      <path
        d="m7.5 5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function activeBrandId(
  pathname: string,
  organizations: BrandOrganizationSummary[],
): string | null {
  const directMatch = pathname.match(/^\/(?:brands|businesses)\/([^/]+)/);
  if (directMatch) return directMatch[1];

  const campaignMatch = pathname.match(/^\/campaigns\/([^/]+)/);
  const campaignId = campaignMatch?.[1];
  if (campaignId) {
    for (const organization of organizations) {
      const brand = organization.brands.find((candidate) =>
        candidate.campaigns.some((campaign) => campaign.id === campaignId),
      );
      if (brand) return brand.id;
    }
  }

  const logoMatch = pathname.match(/^\/logos\/([^/]+)/);
  const logoId = logoMatch?.[1];
  if (logoId) {
    for (const organization of organizations) {
      const brand = organization.brands.find((candidate) =>
        candidate.logos.some(
          (logo) => logo.id === logoId && logo.subjectEntityId === candidate.id,
        ),
      );
      if (brand) return brand.id;
    }
  }

  return null;
}

function TreeLink({
  href,
  active,
  children,
  depth = 0,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  depth?: 0 | 1 | 2;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "block min-w-0 truncate rounded-lg py-1.5 pr-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        depth === 0 && "pl-2 text-sm font-semibold",
        depth === 1 && "pl-7",
        depth === 2 && "pl-10 text-[11px]",
        active ? "bg-ink text-white" : "text-ink hover:bg-ink/5",
      )}
    >
      {children}
    </Link>
  );
}

function BrandTree({
  brand,
  pathname,
  open,
  prefix,
  onToggle,
  onNavigate,
  onAction,
}: {
  brand: BrandSummary;
  pathname: string;
  open: boolean;
  prefix: string;
  onToggle: () => void;
  onNavigate: () => void;
  onAction: (target: TreeTarget, action: TreeActionId) => void;
}) {
const regionId = `${prefix}-brand-${brand.id}`;
  const brandActive = pathname === `/brands/${brand.id}`;
  const ownedLogos = brand.logos.filter(
    (logo) => logo.subjectEntityId === brand.id,
  );
  const lpAssets = brand.assets.filter(
    (asset) => asset.kind === "lp" && asset.jobId,
  );
  // Videos are their own assets now. The campaign-derived entries stay
  // alongside them for brands whose product CM was generated before videos
  // became rows — the detail route resolves either id (see
  // app/api/brands/[id]/videos/[videoId]).
  const videoAssets = brand.assets.filter((asset) => asset.kind === "video");
  const videoCampaigns = brand.campaigns.filter(
    (campaign) => campaign.videoStatus !== "not_created",
  );
  const kindLabel =
    brand.kind === "corporate"
      ? "企業"
      : brand.kind === "audience"
        ? "対象別"
        : "事業";

  const logoSectionPath = `/brands/${brand.id}/logos`;
  const videoSectionPath = `/brands/${brand.id}/video`;
  const lpSectionPath = `/brands/${brand.id}/lp`;
  const logoSectionActive = pathname === logoSectionPath || pathname.startsWith(`${logoSectionPath}/`);
  const videoSectionActive = pathname === videoSectionPath || pathname.startsWith(`${videoSectionPath}/`);
  const lpSectionActive = pathname === lpSectionPath || pathname.startsWith(`${lpSectionPath}/`);

  return (
    <li className="py-2 first:pt-1 last:pb-1">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={`${brand.name}の項目を${open ? "閉じる" : "開く"}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ChevronIcon open={open} />
        </button>
        <div className="min-w-0 flex-1">
          <TreeLink
            href={`/brands/${brand.id}`}
            active={brandActive}
            onNavigate={onNavigate}
          >
            {brand.name}
            <span className="ml-1 text-[10px] font-normal opacity-60">
              {kindLabel}
            </span>
          </TreeLink>
        </div>
        <RowActionsMenu
          label={brand.name}
          actions={brandActions({
            logoCount: ownedLogos.length,
            videoCount: videoAssets.length,
            lpCount: lpAssets.length,
          })}
          onSelect={(action) =>
            onAction(
              {
                kind: "brand",
                id: brand.id,
                name: brand.name,
                organizationId: brand.organizationId,
              },
              action,
            )
          }
        />
      </div>

      <ul id={regionId} hidden={!open} className="mt-1 space-y-1">
        {/* Logos */}
        <li>
          <TreeLink
            href={logoSectionPath}
            active={logoSectionActive}
            depth={1}
            onNavigate={onNavigate}
          >
            ロゴ
            <span className="ml-1 text-[10px] font-normal opacity-60">
              {ownedLogos.length}件
            </span>
          </TreeLink>
          {ownedLogos.length > 0 ? (
            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-hairline pl-2">
              {ownedLogos.map((logo) => (
                <li key={logo.id} className="flex min-w-0 items-center gap-0.5">
                  <div className="min-w-0 flex-1">
                    <TreeLink
                      href={`/brands/${brand.id}/logos/${logo.id}`}
                      active={pathname.startsWith(`/brands/${brand.id}/logos/${logo.id}`)}
                      depth={2}
                      onNavigate={onNavigate}
                    >
                      {logo.title}
                    </TreeLink>
                  </div>
                  <RowActionsMenu
                    label={logo.title}
                    actions={logoActions()}
                    compact
                    onSelect={(action) =>
                      onAction(
                        {
                          kind: "logo",
                          id: logo.id,
                          name: logo.title,
                          brandId: brand.id,
                        },
                        action,
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </li>

        {/* Videos */}
        <li>
          <TreeLink
            href={videoSectionPath}
            active={videoSectionActive}
            depth={1}
            onNavigate={onNavigate}
          >
            動画
            <span className="ml-1 text-[10px] font-normal opacity-60">
              {videoAssets.length + videoCampaigns.length}件
            </span>
          </TreeLink>
          {(videoAssets.length + videoCampaigns.length) > 0 ? (
            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-hairline pl-2">
              {videoAssets.map((asset) => {
                const videoPath = `/brands/${brand.id}/video/${asset.id}`;
                return (
                  <li
                    key={`video-asset-${asset.id}`}
                    className="flex min-w-0 items-center gap-0.5"
                  >
                    <div className="min-w-0 flex-1">
                      <TreeLink
                        href={videoPath}
                        active={pathname.startsWith(videoPath)}
                        depth={2}
                        onNavigate={onNavigate}
                      >
                        {asset.title}
                      </TreeLink>
                    </div>
                    <RowActionsMenu
                      label={asset.title}
                      actions={takeActions("video", {
                        // publicPath is set only by a live canonical
                        // publication, which is exactly what delete_take
                        // refuses on.
                        published: asset.publicPath !== null,
                      })}
                      compact
                      onSelect={(action) =>
                        onAction(
                          {
                            kind: "video",
                            id: asset.id,
                            name: asset.title,
                            brandId: brand.id,
                          },
                          action,
                        )
                      }
                    />
                  </li>
                );
              })}
              {videoCampaigns.map((campaign) => {
                const videoPath = `/brands/${brand.id}/video/${campaign.id}`;
                return (
                  <li key={`video-${campaign.id}`}>
                    <TreeLink
                      href={videoPath}
                      active={pathname === videoPath}
                      depth={2}
                      onNavigate={onNavigate}
                    >
                      {campaign.name}
                    </TreeLink>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>

        {/* LPs */}
        <li>
          <TreeLink
            href={lpSectionPath}
            active={lpSectionActive}
            depth={1}
            onNavigate={onNavigate}
          >
            LP
            <span className="ml-1 text-[10px] font-normal opacity-60">
              {lpAssets.length}件
            </span>
          </TreeLink>
          {lpAssets.length > 0 ? (
            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-hairline pl-2">
              {lpAssets.map((asset) => {
                const lpPath = `/brands/${brand.id}/lp/${asset.id}`;
                const lpTitle = asset.title.replace(/\s+LP$/, "");
                return (
                  <li key={asset.id} className="flex min-w-0 items-center gap-0.5">
                    <div className="min-w-0 flex-1">
                      <TreeLink
                        href={lpPath}
                        active={pathname.startsWith(lpPath)}
                        depth={2}
                        onNavigate={onNavigate}
                      >
                        {lpTitle}
                      </TreeLink>
                    </div>
                    <RowActionsMenu
                      label={lpTitle}
                      actions={takeActions("lp", {
                        published: asset.publicPath !== null,
                      })}
                      compact
                      onSelect={(action) =>
                        onAction(
                          {
                            kind: "lp",
                            id: asset.id,
                            name: lpTitle,
                            brandId: brand.id,
                          },
                          action,
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>
      </ul>
    </li>
  );
}

function ManagementTree({
  organization,
  pathname,
  expandedBusinesses,
  prefix,
  onToggleBusiness,
  onNavigate,
  onAction,
}: {
  organization: BrandOrganizationSummary;
  pathname: string;
  expandedBusinesses: Set<string>;
  prefix: string;
  onToggleBusiness: (id: string) => void;
  onNavigate: () => void;
  onAction: (target: TreeTarget, action: TreeActionId) => void;
}) {
  // One workspace at a time: the organization names the pane above this tree
  // (§19.2), so what is listed here is brands, and inside each of them the
  // logos, videos and LPs. The organization level used to be the tree's root,
  // which put every world on screen at once and cost a level of nesting for a
  // choice that is really a switch.
  return (
    <nav aria-label="ブランドと成果物">
      {/* Rules between the brands: without them the flattened tree reads as a
          single run of links. */}
      <ul className="divide-y divide-hairline">
        {organization.brands.map((brand) => (
          <BrandTree
            key={brand.id}
            brand={brand}
            pathname={pathname}
            open={expandedBusinesses.has(brand.id)}
            prefix={prefix}
            onToggle={() => onToggleBusiness(brand.id)}
            onNavigate={onNavigate}
            onAction={onAction}
          />
        ))}
      </ul>
      {organization.brands.length === 0 ? (
        <p className="px-2 py-1.5 text-pretty text-xs text-ink-faint">
          このワークスペースにはまだブランドがありません。
        </p>
      ) : null}
    </nav>
  );
}

function SidebarContent({
  organization,
  pathname,
  loading,
  error,
  expandedBusinesses,
  prefix,
  onToggleBusiness,
  onNavigate,
  onRetry,
  onAction,
  onAddBrand,
}: {
  /** The workspace being viewed; null while loading or when the user has none. */
  organization: BrandOrganizationSummary | null;
  pathname: string;
  loading: boolean;
  error: string | null;
  expandedBusinesses: Set<string>;
  prefix: string;
  onToggleBusiness: (id: string) => void;
  onNavigate: () => void;
  onRetry: () => void;
  onAction: (target: TreeTarget, action: TreeActionId) => void;
  onAddBrand: () => void;
}) {
  return (
    // pb-28 keeps ~100px of breathing room below the last item so it never
    // sits flush against the bottom edge of the scroll area.
    <div className="p-5 pb-28">
      {/* The workspace names the pane. "ブランド管理" said what the screen
          was for; the organization says which world you are in, which is
          the thing that changes and the thing you can get wrong. The label,
          the brand count and the menu share one row so the name below gets
          the full width of the pane. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          Workspace
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {!loading && !error && organization ? (
            <span className="tabular-nums text-xs text-ink-faint">
              {organization.brands.length}ブランド
            </span>
          ) : null}
          <WorkspaceMenu
            name={organization?.name?.trim() || "ワークスペース"}
            workspaceId={organization?.id ?? null}
            onNavigate={onNavigate}
          />
        </div>
      </div>
      {/* Same size as a brand row: the name is a heading for the tree, not a
          title for the page. */}
      <h2 className="mt-2 truncate px-2 text-sm font-semibold">
        {organization?.name?.trim() || "名称未設定のワークスペース"}
      </h2>

      <div className="mt-5">
        {loading ? (
          <div
            aria-label="ブランド一覧を読み込み中"
            aria-busy="true"
            className="space-y-3"
          >
            <div className="h-9 rounded-lg bg-ink/5" />
            <div className="ml-5 h-8 rounded-lg bg-ink/5" />
            <div className="ml-10 h-7 rounded-lg bg-ink/5" />
          </div>
        ) : error ? (
          <div>
            <p className="text-pretty text-xs text-red-700" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-full border border-ink px-4 py-2 text-xs font-semibold hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              もう一度読み込む
            </button>
          </div>
        ) : organization ? (
          <>
            <ManagementTree
              organization={organization}
              pathname={pathname}
              expandedBusinesses={expandedBusinesses}
              prefix={prefix}
              onToggleBusiness={onToggleBusiness}
              onNavigate={onNavigate}
              onAction={onAction}
            />
            {/* Adding sits under the list it adds to. It opens the same URL
                intake as the top page, scoped to this workspace. */}
            <button
              type="button"
              onClick={onAddBrand}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline px-3 py-2 text-xs font-semibold text-ink-muted hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <PlusIcon />
              ブランドを追加
            </button>
          </>
        ) : (
          <div>
            <p className="text-pretty text-xs text-ink-muted">
              所属しているワークスペースがありません。
            </p>
            <Link
              href="/"
              onClick={onNavigate}
              className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              最初のブランドを登録
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManagementShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<
    BrandOrganizationSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Row actions. The tree is rendered twice (desktop aside, mobile drawer), so
  // the pending target and its dialog live here — once — rather than inside the
  // menu that opened them.
  const [pendingDelete, setPendingDelete] = useState<TreeTarget | null>(null);
  const [atRiskMaterials, setAtRiskMaterials] = useState<AtRiskMaterial[] | null>(
    null,
  );
  const [materialChoice, setMaterialChoice] = useState<MaterialChoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const [addingBrand, setAddingBrand] = useState(false);
  // Which world we are in. Read once on mount because localStorage is not
  // available while the server renders this component.
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null,
  );
  const [expandedBusinesses, setExpandedBusinesses] = useState<Set<string>>(
    () => new Set(),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch("/api/brands");
      const body = (await response.json().catch(() => null)) as {
        organizations?: BrandOrganizationSummary[];
        error?: string;
      } | null;
      if (!response.ok || !body?.organizations) {
        throw new Error(body?.error ?? "事業一覧を取得できませんでした");
      }
      const nextOrganizations = body.organizations;
      setOrganizations(nextOrganizations);
      const brandId = activeBrandId(pathname, nextOrganizations);
      if (brandId) {
        setExpandedBusinesses((current) => new Set([...current, brandId]));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "事業一覧を取得できませんでした",
      );
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(BRAND_TREE_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(BRAND_TREE_REFRESH_EVENT, refresh);
  }, [load]);

  // localStorage is unreadable during the server render, so the choice arrives
  // one paint late. Until it does the first workspace shows, which is also the
  // fallback for a stored id that no longer resolves. The listener keeps a
  // second tab in step after a switch.
  useEffect(() => {
    const sync = () => setCurrentWorkspaceId(readCurrentWorkspaceId());
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // A success notice is not worth a permanent place on screen; an error is not
  // worth losing before it has been read. Both go after the same delay because
  // the tree behind them already shows the outcome.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runDuplicate = useCallback(
    async (target: TreeTarget) => {
      setNotice({ tone: "ok", text: `「${target.name}」を複製しています…` });
      const result = await duplicateTreeNode(target);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      await load();
      setNotice({ tone: "ok", text: "複製しました" });
      // Opening the copy is the point: a duplicate you have to go find is a
      // duplicate you cannot tell apart from the original.
      setMobileOpen(false);
      router.push(pathAfterDuplicate(target, result.id));
    },
    [load, router],
  );

  const handleAction = useCallback(
    (target: TreeTarget, action: TreeActionId) => {
      if (action === "info") {
        const path = infoPath(target);
        if (path) {
          setMobileOpen(false);
          router.push(path);
        }
        return;
      }
      if (action === "delete") {
        setPendingDelete(target);
        setAtRiskMaterials(null);
        setMaterialChoice(null);
        setDeleteError(null);
        return;
      }
      void runDuplicate(target);
    },
    [runDuplicate, router],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteTreeNode(pendingDelete, materialChoice);
    setDeleting(false);
    if (!result.ok) {
      // The server asked what happens to the material. Staying open turns this
      // dialog into that question instead of making the user start over — and
      // the question is not an error, so it does not also appear in red.
      if (result.atRisk) {
        setAtRiskMaterials(result.atRisk);
        setDeleteError(null);
      } else {
        setDeleteError(result.error);
      }
      return;
    }
    const target = pendingDelete;
    setPendingDelete(null);
    setAtRiskMaterials(null);
    setMaterialChoice(null);
    await load();
    setNotice({ tone: "ok", text: `「${target.name}」を削除しました` });
    if (viewingTarget(pathname, target)) {
      setMobileOpen(false);
      router.push(pathAfterDelete(target));
    }
  }, [pendingDelete, materialChoice, load, pathname, router]);

  const toggleBusiness = (id: string) => {
    setExpandedBusinesses((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // A stored id the user can no longer see falls back to the first workspace
  // rather than emptying the pane (resolveWorkspace).
  const workspace = resolveWorkspace(organizations, currentWorkspaceId);

  const sidebarProps = {
    organization: workspace,
    pathname,
    loading,
    error,
    expandedBusinesses,
    onToggleBusiness: toggleBusiness,
    onRetry: () => void load(),
    onAction: handleAction,
    onAddBrand: () => {
      setMobileOpen(false);
      setAddingBrand(true);
    },
  };

  return (
    <div className="min-h-dvh flex-1 bg-paper text-ink">
      <AppHeader section="ブランド管理" />

      <div className="grid min-h-[calc(100dvh-7rem)] lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-hairline bg-ink/[0.02] lg:block">
          {/* Cap to the viewport minus the header (matching the grid's 7rem
              allowance) so the scroll area's bottom stays on-screen and the
              last item is always reachable, even when the page itself can't
              scroll. */}
          <div className="sticky top-0 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain">
            <SidebarContent
              {...sidebarProps}
              prefix="desktop"
              onNavigate={() => undefined}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="border-b border-hairline bg-ink/[0.02] px-4 py-3 lg:hidden">
            <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
              <Dialog.Trigger className="inline-flex items-center gap-2 rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                <MenuIcon />
                ブランド管理を開く
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45" />
                <Dialog.Viewport className="fixed inset-0 z-50 overflow-hidden">
                  <Dialog.Popup
                    className="h-dvh w-[min(88vw,22rem)] overflow-y-auto overscroll-contain bg-paper shadow-xl focus:outline-none"
                    style={{
                      paddingTop: "env(safe-area-inset-top)",
                      paddingBottom: "env(safe-area-inset-bottom)",
                      paddingLeft: "env(safe-area-inset-left)",
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
                      <Dialog.Title className="text-balance text-sm font-semibold">
                        ブランド管理
                      </Dialog.Title>
                      <Dialog.Close
                        aria-label="ブランド管理を閉じる"
                        className="flex size-8 items-center justify-center rounded-full text-xl text-ink-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <span aria-hidden="true">×</span>
                      </Dialog.Close>
                    </div>
                    <Dialog.Description className="sr-only">
                      Organization、ブランド、ロゴ、LP、動画を選択します。
                    </Dialog.Description>
                    <SidebarContent
                      {...sidebarProps}
                      prefix="mobile"
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </Dialog.Popup>
                </Dialog.Viewport>
              </Dialog.Portal>
            </Dialog.Root>
          </div>

          {children}
        </div>
      </div>

      {workspace ? (
        <AddBrandDialog
          open={addingBrand}
          onOpenChange={setAddingBrand}
          organizationId={workspace.id}
          organizationName={workspace.name.trim() || "名称未設定のワークスペース"}
        />
      ) : null}

      {pendingDelete ? (
        <TreeDeleteDialog
          open
          kind={pendingDelete.kind}
          name={pendingDelete.name}
          atRiskMaterials={atRiskMaterials}
          materialChoice={materialChoice}
          deleting={deleting}
          error={deleteError}
          onMaterialChoice={setMaterialChoice}
          onCancel={() => {
            setPendingDelete(null);
            setAtRiskMaterials(null);
            setMaterialChoice(null);
            setDeleteError(null);
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed inset-x-4 bottom-4 z-30 mx-auto w-fit max-w-[min(28rem,calc(100vw-2rem))] rounded-full border px-5 py-2.5 text-pretty text-xs shadow-lg",
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-hairline bg-ink text-white",
          )}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}
