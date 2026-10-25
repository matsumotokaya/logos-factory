"use client";

import { Menu } from "@base-ui/react/menu";
import Link from "next/link";

// The three dots next to the workspace name at the top of the sidebar.
//
// Separate from RowActionsMenu because the actions are a different kind: a
// tree row's menu duplicates and deletes the thing it names, while this one
// only navigates — into this workspace's own page, or out to the list of the
// others. Reusing the row menu would have meant widening TreeActionId with
// two ids that no tree row can perform.

const ITEM =
  "block cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-ink/5";

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
      <circle cx="4" cy="10" r="1.25" />
      <circle cx="10" cy="10" r="1.25" />
      <circle cx="16" cy="10" r="1.25" />
    </svg>
  );
}

export default function WorkspaceMenu({
  name,
  workspaceId,
  onNavigate,
}: {
  name: string;
  /** null while the tree is still loading: the menu still offers the list. */
  workspaceId: string | null;
  onNavigate: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`${name}のメニュー`}
        title={`${name}のメニュー`}
        className="flex size-6 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink data-[popup-open]:bg-ink/10 data-[popup-open]:text-ink"
      >
        <MoreIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Menu.Popup className="w-60 rounded-xl border border-hairline bg-paper p-1.5 shadow-lg outline-none">
            {workspaceId ? (
              <Menu.Item
                render={
                  <Link href={`/organizations/${workspaceId}`} onClick={onNavigate} />
                }
                className={ITEM}
              >
                このワークスペースの詳細
              </Menu.Item>
            ) : null}
            <Menu.Item
              render={<Link href="/organizations" onClick={onNavigate} />}
              className={ITEM}
            >
              ワークスペースを切り替える
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
