"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import AppHeader from "@/components/AppHeader";
import { authedFetch } from "@/lib/authed-fetch";
import type {
  BrandOrganizationSummary,
  BrandSummary,
} from "@/lib/brand-hierarchy";
import { cn } from "@/lib/cn";
import { BRAND_TREE_REFRESH_EVENT } from "@/lib/brand-events";
import { BRAND_KIND_LABEL, isBrandKind } from "@/lib/brand-kind";
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
import SetParentDialog from "./SetParentDialog";
import { MainMark } from "./MainMark";
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

// ---------------------------------------------------------------------------
// The tree, built the way a file explorer is (VS Code's Explorer, Finder's
// list view): one row height, a disclosure chevron, an icon that says what the
// row is, indent guides, the selected row filled edge to edge, and a row's
// menu shown on hover. Brands are folders; inside one are Assets (logos,
// materials, guidelines), Works (videos, LPs, banners) and then its nested
// brands, which repeat the shape. People already know how to read this,
// which is the whole point. The English folder names are deliberate: they
// are the same in every locale, so the structure reads the same everywhere.
// ---------------------------------------------------------------------------

/** Left padding of a depth-0 row, and the step per level. */
const ROW_BASE = 8;
const ROW_INDENT = 12;

type RowIconKind = "folder" | "logo" | "video";

function TreeIcon({ kind, open }: { kind: RowIconKind; open?: boolean }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    "aria-hidden": true,
    className: "size-4 shrink-0 text-ink-muted",
  } as const;
  const stroke = {
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  } as const;
  if (kind === "folder") {
    return open ? (
      <svg {...common}>
        <path d="M2.5 6V4.75c0-.41.34-.75.75-.75h4l1.5 1.75h7c.41 0 .75.34.75.75V8" {...stroke} />
        <path d="M2.5 16 4.6 8.5c.1-.3.38-.5.7-.5h12.1c.5 0 .86.48.72.96L16 16H2.5Z" {...stroke} />
      </svg>
    ) : (
      <svg {...common}>
        <path d="M2.5 15.25V4.75c0-.41.34-.75.75-.75h4l1.5 1.75h8c.41 0 .75.34.75.75v8.75c0 .41-.34.75-.75.75H3.25a.75.75 0 0 1-.75-.75Z" {...stroke} />
      </svg>
    );
  }
  if (kind === "logo") {
    return (
      <svg {...common}>
        <rect x="3" y="3.5" width="14" height="13" rx="1.5" {...stroke} />
        <circle cx="7.5" cy="8" r="1.5" {...stroke} />
        <path d="m3.5 14.5 4-4 3 3 2-2 4 4" {...stroke} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.5" y="4.5" width="11" height="11" rx="1.5" {...stroke} />
      <path d="m13.5 8.5 4-2.5v8l-4-2.5" {...stroke} />
    </svg>
  );
}

function TreeRow({
  depth,
  href,
  active,
  open,
  icon,
  label,
  meta,
  onToggle,
  onActivate,
  actions,
  rowProps,
  dropActive = false,
  mark,
}: {
  depth: number;
  href: string;
  active: boolean;
  /** null for a leaf: no chevron, the space is kept so icons line up. */
  open: boolean | null;
  icon: RowIconKind;
  /** A small sign on the icon's corner — the main brand's star. */
  mark?: ReactNode;
  label: string;
  /** Quiet text after the label: a brand's kind, a folder's count. */
  meta?: string;
  onToggle?: () => void;
  /** Following the row's link; folders also open. */
  onActivate: () => void;
  actions?: ReactNode;
  /** Drag-and-drop handlers, on brand rows. */
  rowProps?: HTMLAttributes<HTMLDivElement>;
  dropActive?: boolean;
}) {
  return (
    <div
      {...rowProps}
      className={cn(
        "group relative flex h-6 items-center pr-1 text-[13px] text-ink",
        active ? "bg-ink/10" : "hover:bg-ink/5",
        dropActive && "shadow-[inset_0_2px_0_0_var(--accent)]",
      )}
      style={{ paddingLeft: ROW_BASE + depth * ROW_INDENT }}
    >
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 border-l border-hairline"
          style={{ left: ROW_BASE + level * ROW_INDENT + 7 }}
        />
      ))}
      {open === null ? (
        <span aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${label}を${open ? "閉じる" : "開く"}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <ChevronIcon open={open} />
        </button>
      )}
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={onActivate}
        draggable={false}
        className="ml-1 flex h-full min-w-0 flex-1 items-center gap-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      >
        <span className="relative flex shrink-0">
          <TreeIcon kind={icon} open={open ?? false} />
          {mark ? <span className="absolute -right-1 -top-1">{mark}</span> : null}
        </span>
        <span className="truncate">{label}</span>
        {meta ? (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{meta}</span>
        ) : null}
      </Link>
      {actions ? (
        <span className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-popup-open]]:opacity-100">
          {actions}
        </span>
      ) : null}
    </div>
  );
}

/** The drag payload type: a brand row being moved, never a link or a file. */
const BRAND_DRAG_TYPE = "application/x-logos-brand";

/** Dragging a brand row REORDERS the flat list: dropping on a row puts the
 *  dragged brand before it. Inheritance is never set by dragging. */
type BrandDrag = {
  /** Can the dragged brand be dropped before this one? */
  canDropOn: (targetId: string) => boolean;
  /** The row currently under the pointer, for the highlight. */
  overId: string | null;
  onStart: (brandId: string) => void;
  onEnd: () => void;
  onOver: (targetId: string | null) => void;
  onDrop: (targetId: string) => void;
};

/**
 * Keys in the shell's expanded set: a brand by id, its folders by section.
 *
 * The folders are the two branches every brand has (docs/product.md §2.1) and
 * the kinds inside them:
 *
 *   assets   what the brand IS       → logos / materials / guidelines
 *   works    what was MADE from it   → video / lp / banner
 */
type TreeSection =
  | "assets"
  | "logos"
  | "materials"
  | "guidelines"
  | "works"
  | "video"
  | "lp"
  | "banner";

function sectionKey(section: TreeSection, brandId: string): string {
  return `${section}:${brandId}`;
}

/** The sections a pathname sits inside, for revealing the open file. */
export function sectionsForPath(pathname: string): TreeSection[] {
  const match = pathname.match(
    /^\/brands\/[^/]+\/(assets|works)(?:\/(logos|materials|guidelines|video|lp|banner))?(?:\/|$)/,
  );
  if (!match) return [];
  const sections: TreeSection[] = [match[1] as TreeSection];
  if (match[2]) sections.push(match[2] as TreeSection);
  return sections;
}

function BrandNode({
  brand,
  depth,
  pathname,
  expanded,
  onToggle,
  onOpen,
  onNavigate,
  onAction,
  drag,
}: {
  brand: BrandSummary;
  depth: number;
  pathname: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  /** Open without closing: following a folder's link opens it. */
  onOpen: (key: string) => void;
  onNavigate: () => void;
  onAction: (target: TreeTarget, action: TreeActionId) => void;
  drag: BrandDrag;
}) {
  const open = expanded.has(brand.id);
  const ownedLogos = brand.logos.filter((logo) => logo.subjectEntityId === brand.id);
  const videoAssets = brand.assets.filter((asset) => asset.kind === "video");
  const lpAssets = brand.assets.filter((asset) => asset.kind === "lp");
  const bannerAssets = brand.assets.filter((asset) => asset.kind === "banner");
  const kindLabel = isBrandKind(brand.kind) ? BRAND_KIND_LABEL[brand.kind] : "";
  const dropActive = drag.overId === brand.id;

  const base = `/brands/${brand.id}`;
  const assetsPath = `${base}/assets`;
  const worksPath = `${base}/works`;
  const logoPath = `${assetsPath}/logos`;
  const videoPath = `${worksPath}/video`;
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  /**
   * A folder row. `count` null means a branch whose children are folders (no
   * number, always openable); a number is shown and, with children, gates
   * the chevron. A folder with no children listed here (Materials, until a
   * file has a page of its own) only navigates.
   */
  const folder = (
    section: TreeSection,
    label: string,
    path: string,
    rowDepth: number,
    count: number | null,
    children: ReactNode,
  ) => {
    const key = sectionKey(section, brand.id);
    const openable = children !== null && (count === null || count > 0);
    const folderOpen = openable && expanded.has(key);
    return (
      <li>
        <TreeRow
          depth={rowDepth}
          href={path}
          active={pathname === path}
          open={openable ? folderOpen : null}
          icon="folder"
          label={label}
          meta={count === null ? undefined : String(count)}
          onToggle={() => onToggle(key)}
          onActivate={() => {
            if (openable) onOpen(key);
            onNavigate();
          }}
        />
        {folderOpen ? <ul>{children}</ul> : null}
      </li>
    );
  };

  return (
    <li>
      {/* The row is what moves: drag it above another brand to reorder the
          list. The star is the one sign a main brand carries here; the kit
          page says 「メインブランド」 / 「サブブランド」 in words. */}
      <TreeRow
        depth={depth}
        href={base}
        active={pathname === base}
        open={open}
        icon="folder"
        mark={brand.isMain ? <MainMark className="size-2.5" /> : undefined}
        label={brand.name}
        meta={kindLabel}
        onToggle={() => onToggle(brand.id)}
        onActivate={() => {
          onOpen(brand.id);
          onNavigate();
        }}
        dropActive={dropActive}
        rowProps={{
          draggable: true,
          onDragStart: (e) => {
            e.dataTransfer.setData(BRAND_DRAG_TYPE, brand.id);
            e.dataTransfer.effectAllowed = "move";
            drag.onStart(brand.id);
          },
          onDragEnd: drag.onEnd,
          onDragOver: (e) => {
            if (!drag.canDropOn(brand.id)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (!dropActive) drag.onOver(brand.id);
          },
          onDragLeave: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) drag.onOver(null);
          },
          onDrop: (e) => {
            if (!drag.canDropOn(brand.id)) return;
            e.preventDefault();
            drag.onDrop(brand.id);
          },
        }}
        actions={
          <RowActionsMenu
            label={brand.name}
            compact
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
        }
      />

      {open ? (
        <ul>
          {/* Assets: what the brand is. */}
          {folder(
            "assets",
            "Assets",
            assetsPath,
            depth + 1,
            null,
            <>
              {folder(
                "logos",
                "Logos",
                logoPath,
                depth + 2,
                ownedLogos.length,
                ownedLogos.map((logo) => (
                  <li key={logo.id}>
                    <TreeRow
                      depth={depth + 3}
                      href={`${logoPath}/${logo.id}`}
                      active={within(`${logoPath}/${logo.id}`)}
                      open={null}
                      icon="logo"
                      label={logo.title}
                      onActivate={onNavigate}
                      actions={
                        <RowActionsMenu
                          label={logo.title}
                          actions={logoActions()}
                          compact
                          onSelect={(action) =>
                            onAction(
                              { kind: "logo", id: logo.id, name: logo.title, brandId: brand.id },
                              action,
                            )
                          }
                        />
                      }
                    />
                  </li>
                )),
              )}
              {/* Materials have a list page and no page of their own yet, so
                  the folder carries its count and does not open. */}
              {folder("materials", "Materials", `${assetsPath}/materials`, depth + 2, brand.materialCount, null)}
              {folder("guidelines", "Guidelines", `${assetsPath}/guidelines`, depth + 2, 0, null)}
            </>,
          )}

          {/* Works: what was made from the kit. */}
          {folder(
            "works",
            "Works",
            worksPath,
            depth + 1,
            null,
            <>
              {folder(
                "video",
                "Videos",
                videoPath,
                depth + 2,
                videoAssets.length,
                videoAssets.map((asset) => (
                  <li key={`video-asset-${asset.id}`}>
                    <TreeRow
                      depth={depth + 3}
                      href={`${videoPath}/${asset.id}`}
                      active={within(`${videoPath}/${asset.id}`)}
                      open={null}
                      icon="video"
                      label={asset.title}
                      onActivate={onNavigate}
                      actions={
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
                              { kind: "video", id: asset.id, name: asset.title, brandId: brand.id },
                              action,
                            )
                          }
                        />
                      }
                    />
                  </li>
                )),
              )}
              {folder("lp", "LPs", `${worksPath}/lp`, depth + 2, lpAssets.length, null)}
              {folder("banner", "Banners", `${worksPath}/banner`, depth + 2, bannerAssets.length, null)}
            </>,
          )}

        </ul>
      ) : null}
    </li>
  );
}

function ManagementTree({
  organization,
  pathname,
  expanded,
  onToggle,
  onOpen,
  onNavigate,
  onAction,
  onReorder,
}: {
  organization: BrandOrganizationSummary;
  pathname: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onOpen: (key: string) => void;
  onNavigate: () => void;
  onAction: (target: TreeTarget, action: TreeActionId) => void;
  /** The brands in their new order, after a drop. */
  onReorder: (orderedIds: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // One workspace at a time: its name heads the pane, and what is listed is
  // its brands, flat, in the user's order (sort_order). A sub-brand is not
  // inside its parent — inheritance is a pointer the kit page shows — so the
  // list reads like a folder of folders.
  const brands = organization.brands;
  const ids = brands.map((brand) => brand.id);

  const endDrag = () => {
    setDraggingId(null);
    setOverId(null);
  };
  const reorder = (beforeId: string | null) => {
    if (!draggingId) return;
    const without = ids.filter((id) => id !== draggingId);
    const at = beforeId ? without.indexOf(beforeId) : without.length;
    const next = [...without.slice(0, at), draggingId, ...without.slice(at)];
    if (next.some((id, index) => id !== ids[index])) onReorder(next);
  };
  const drag: BrandDrag = {
    canDropOn: (targetId) => draggingId !== null && targetId !== draggingId,
    overId,
    onStart: setDraggingId,
    onEnd: endDrag,
    onOver: setOverId,
    onDrop: (targetId) => {
      reorder(targetId);
      endDrag();
    },
  };

  return (
    <nav aria-label="ブランドと成果物">
      <ul>
        {brands.map((brand) => (
          <BrandNode
            key={brand.id}
            brand={brand}
            depth={0}
            pathname={pathname}
            expanded={expanded}
            onToggle={onToggle}
            onOpen={onOpen}
            onNavigate={onNavigate}
            onAction={onAction}
            drag={drag}
          />
        ))}
      </ul>
      {/* Only while a brand is being dragged: the way to the end of the list. */}
      {draggingId ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (overId !== "end") setOverId("end");
          }}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => {
            e.preventDefault();
            reorder(null);
            endDrag();
          }}
          className={cn(
            "mx-2 mt-1 flex h-6 items-center justify-center rounded border border-dashed text-[11px] text-ink-muted",
            overId === "end" ? "border-ink bg-ink/10 text-ink" : "border-hairline",
          )}
        >
          一番下へ
        </div>
      ) : null}
      {brands.length === 0 ? (
        <p className="px-4 py-1.5 text-pretty text-xs text-ink-faint">
          このワークスペースにはまだブランドがありません。上の「＋」から、サイトのURLで追加できます。
        </p>
      ) : null}
    </nav>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
    >
      {children}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M16 10a6 6 0 1 1-1.76-4.24M16 4v3.5h-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseAllIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SidebarContent({
  organization,
  pathname,
  loading,
  error,
  expanded,
  onToggle,
  onOpen,
  onCollapseAll,
  onNavigate,
  onRetry,
  onAction,
  onAddBrand,
  onReorder,
}: {
  /** The workspace being viewed; null while loading or when the user has none. */
  organization: BrandOrganizationSummary | null;
  pathname: string;
  loading: boolean;
  error: string | null;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onOpen: (key: string) => void;
  onCollapseAll: () => void;
  onNavigate: () => void;
  onRetry: () => void;
  onAction: (target: TreeTarget, action: TreeActionId) => void;
  onAddBrand: () => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const workspaceName = organization?.name?.trim() || "名称未設定のワークスペース";
  return (
    // pb-28 keeps ~100px of breathing room below the last item so it never
    // sits flush against the bottom edge of the scroll area.
    <div className="pb-28">
      {/* The workspace heads the pane the way an explorer's root folder does:
          its name on the left, the actions on the right, ruled off from the
          tree because it is the container and not one of the brands. */}
      <div className="flex h-10 items-center gap-0.5 border-b border-hairline bg-ink/[0.04] pl-4 pr-2">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold" title={workspaceName}>
          {workspaceName}
        </h2>
        {organization ? (
          <>
            <ToolbarButton label="ブランドを追加" onClick={onAddBrand}>
              <PlusIcon />
            </ToolbarButton>
            <ToolbarButton label="再読み込み" onClick={onRetry}>
              <RefreshIcon />
            </ToolbarButton>
            <ToolbarButton label="すべて折りたたむ" onClick={onCollapseAll}>
              <CollapseAllIcon />
            </ToolbarButton>
          </>
        ) : null}
        <WorkspaceMenu
          name={organization?.name?.trim() || "ワークスペース"}
          workspaceId={organization?.id ?? null}
          onNavigate={onNavigate}
        />
      </div>

      <div className="pt-1">
        {loading ? (
          <div aria-label="ブランド一覧を読み込み中" aria-busy="true" className="space-y-1 px-2 pt-1">
            <div className="h-6 rounded bg-ink/5" />
            <div className="ml-3 h-6 rounded bg-ink/5" />
            <div className="ml-6 h-6 rounded bg-ink/5" />
          </div>
        ) : error ? (
          <div className="px-4 pt-3">
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
          <ManagementTree
            organization={organization}
            pathname={pathname}
            expanded={expanded}
            onToggle={onToggle}
            onOpen={onOpen}
            onNavigate={onNavigate}
            onAction={onAction}
            onReorder={onReorder}
          />
        ) : (
          <div className="px-4 pt-3">
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
  // The brand a new one goes under, when the menu asked for a sub-brand.
  const [addParent, setAddParent] = useState<{ id: string; name: string } | null>(null);
  // 「継承元を指定」 in progress for this brand.
  const [parentTarget, setParentTarget] = useState<BrandSummary | null>(null);
  const [parentSaving, setParentSaving] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  // Which world we are in. Read once on mount because localStorage is not
  // available while the server renders this component.
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null,
  );
  const [expandedBusinesses, setExpandedBusinesses] = useState<Set<string>>(
    () => new Set(),
  );
  // Rows the user closed although the page would reveal them.
  const [closedRows, setClosedRows] = useState<Set<string>>(() => new Set());

  // The tree is fetched once and on explicit refresh, never because the
  // pathname moved: a click inside the tree must not redraw the tree. The
  // skeleton shows only while there is nothing to show — a refetch keeps the
  // rows on screen and swaps them when the new ones land.
  const load = useCallback(async () => {
    setLoading((current) => current && organizations.length === 0);
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
      setOrganizations(body.organizations);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "事業一覧を取得できませんでした",
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- organizations is read only to decide whether a skeleton is warranted
  }, []);

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

  // Open the way to the page on screen: its brand, every brand above it, and
  // the folders it sits in — as an explorer reveals the open file. Derived
  // at render and unioned with what the user opened, so a navigation never
  // has to write state to show its own row.
  const revealed = (() => {
    const brandId = activeBrandId(pathname, organizations);
    if (!brandId) return new Set<string>();
    const keys: string[] = [brandId];
    for (const section of sectionsForPath(pathname)) {
      keys.push(sectionKey(section, brandId));
    }
    return new Set(keys);
  })();

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
      if (action === "set-parent") {
        if (target.kind !== "brand") return;
        const brand = organizations
          .flatMap((organization) => organization.brands)
          .find((row) => row.id === target.id);
        if (!brand) return;
        setParentError(null);
        setMobileOpen(false);
        setParentTarget(brand);
        return;
      }
      if (action === "add-child") {
        if (target.kind !== "brand") return;
        setAddParent({ id: target.id, name: target.name });
        setMobileOpen(false);
        setAddingBrand(true);
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
    [runDuplicate, router, organizations],
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

  // One set holds every open row: brands by id, their folders by
  // `${section}:${brandId}`.
  const expandedRows = new Set(
    [...expandedBusinesses, ...revealed].filter((key) => !closedRows.has(key)),
  );
  const toggleBusiness = (id: string) => {
    if (expandedRows.has(id)) {
      setExpandedBusinesses((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (revealed.has(id)) setClosedRows((current) => new Set([...current, id]));
    } else {
      setExpandedBusinesses((current) => new Set([...current, id]));
      setClosedRows((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };
  const openRow = (id: string) => {
    setExpandedBusinesses((current) =>
      current.has(id) ? current : new Set([...current, id]),
    );
    setClosedRows((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  // A stored id the user can no longer see falls back to the first workspace
  // rather than emptying the pane (resolveWorkspace).
  const workspace = resolveWorkspace(organizations, currentWorkspaceId);

  // A drop in the tree: every brand whose position changed is written, then
  // the tree is reloaded so the server's order is the one on screen.
  const reorderBrands = async (orderedIds: string[]) => {
    const brands = workspace?.brands ?? [];
    const current = new Map(brands.map((brand) => [brand.id, brand.sortOrder]));
    try {
      await Promise.all(
        orderedIds.map((id, index) => {
          if (current.get(id) === index + 1) return Promise.resolve();
          return authedFetch(`/api/brands/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: index + 1 }),
          }).then(async (response) => {
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(body?.error ?? "並び順を保存できませんでした");
            }
          });
        }),
      );
      await load();
    } catch (reorderError) {
      setNotice({
        tone: "error",
        text: reorderError instanceof Error ? reorderError.message : "並び順を保存できませんでした",
      });
    }
  };

  // 「継承元」 saved from the dialog. The server refuses cycles and brands from
  // another workspace; its sentence is shown in the dialog.
  const saveParent = async (parentBrandId: string | null) => {
    if (!parentTarget) return;
    setParentSaving(true);
    setParentError(null);
    try {
      const response = await authedFetch(`/api/brands/${parentTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentBrandId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "継承元を変更できませんでした");
      const parentName = parentBrandId
        ? (workspace?.brands.find((brand) => brand.id === parentBrandId)?.name ?? "ブランド")
        : null;
      setParentTarget(null);
      setNotice({
        tone: "ok",
        text: parentName
          ? `「${parentTarget.name}」は「${parentName}」を継承します`
          : `「${parentTarget.name}」は独立したブランドになりました`,
      });
      await load();
    } catch (parentSaveError) {
      setParentError(
        parentSaveError instanceof Error ? parentSaveError.message : "継承元を変更できませんでした",
      );
    } finally {
      setParentSaving(false);
    }
  };

  const sidebarProps = {
    organization: workspace,
    onReorder: (orderedIds: string[]) => void reorderBrands(orderedIds),
    pathname,
    loading,
    error,
    expanded: expandedRows,
    onToggle: toggleBusiness,
    onOpen: openRow,
    onCollapseAll: () => {
      setExpandedBusinesses(new Set());
      setClosedRows(new Set(revealed));
    },
    onRetry: () => void load(),
    onAction: handleAction,
    onAddBrand: () => {
      setMobileOpen(false);
      setAddParent(null);
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
          onOpenChange={(open) => {
            setAddingBrand(open);
            if (!open) setAddParent(null);
          }}
          organizationId={workspace.id}
          organizationName={workspace.name.trim() || "名称未設定のワークスペース"}
          parent={addParent}
        />
      ) : null}

      {parentTarget && workspace ? (
        <SetParentDialog
          open
          onOpenChange={(open) => {
            if (!open && !parentSaving) setParentTarget(null);
          }}
          brand={{ id: parentTarget.id, name: parentTarget.name, parentBrandId: parentTarget.parentBrandId }}
          brands={workspace.brands}
          saving={parentSaving}
          error={parentError}
          onSave={(parentBrandId) => void saveParent(parentBrandId)}
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
