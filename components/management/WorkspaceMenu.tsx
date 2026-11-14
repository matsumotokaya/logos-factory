"use client";

import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { cn } from "@/lib/cn";

// The workspace's name at the top of the sidebar, as the switch between
// workspaces.
//
// Workspaces are parallel worlds (lib/workspace.ts): one is shown at a time,
// and the others are a click away. The name used to be plain text with a
// three-dot menu that led to a separate list page, so nothing on screen said
// there WERE others. Making the name itself the dropdown says it: this is one
// of several, and the rest are here (owner's request, 2026-11-14). The list
// page stays, reached from the bottom of the menu.

const ITEM =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none data-[highlighted]:bg-ink/5";

export type WorkspaceChoice = {
  id: string;
  name: string;
  brandCount: number;
};

const label = (name: string) => name.trim() || "名称未設定のワークスペース";

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted">
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={cn("size-4 shrink-0", visible ? "text-ink" : "invisible")}>
      <path d="m5 10.5 3.5 3.5L15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function WorkspaceMenu({
  current,
  workspaces,
  onSwitch,
  onNavigate,
}: {
  /** null while the tree is still loading: the menu still offers the list page. */
  current: WorkspaceChoice | null;
  workspaces: WorkspaceChoice[];
  onSwitch: (id: string) => void;
  onNavigate: () => void;
}) {
  const name = current ? label(current.name) : "ワークスペース";
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`ワークスペース: ${name}。押すと切り替えられます`}
        title="ワークスペースを切り替える"
        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-ink data-[popup-open]:bg-ink/10"
      >
        <span className="min-w-0 truncate text-xs font-semibold">{name}</span>
        <Chevron />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50 outline-none">
          <Menu.Popup className="max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-hairline bg-paper p-1.5 shadow-lg outline-none">
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              ワークスペース
            </p>
            {workspaces.map((workspace) => {
              const selected = workspace.id === current?.id;
              return (
                <Menu.Item
                  key={workspace.id}
                  onClick={() => {
                    if (!selected) onSwitch(workspace.id);
                  }}
                  className={ITEM}
                  aria-current={selected ? "true" : undefined}
                >
                  <Check visible={selected} />
                  <span className={cn("min-w-0 flex-1 truncate", !workspace.name.trim() && "text-ink-muted")}>
                    {label(workspace.name)}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">
                    {workspace.brandCount}
                  </span>
                </Menu.Item>
              );
            })}
            <div role="separator" className="my-1.5 h-px bg-hairline" />
            {current ? (
              <Menu.Item render={<Link href={`/organizations/${current.id}`} onClick={onNavigate} />} className={ITEM}>
                <Check visible={false} />
                このワークスペースの詳細
              </Menu.Item>
            ) : null}
            <Menu.Item render={<Link href="/organizations" onClick={onNavigate} />} className={ITEM}>
              <Check visible={false} />
              ワークスペースの一覧
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
