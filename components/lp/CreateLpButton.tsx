"use client";

// The one button that makes an LP from the brand as it stands.
//
// The run is handed to the workspace's run store (lib/runs/store.ts), so its
// card stays on screen wherever the user goes until the LP is made. The new
// page opens by itself only if the user is still where they pressed the
// button; anywhere else the card offers 「開く」.

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { authedFetch } from "@/lib/authed-fetch";
import { refreshBrandTree } from "@/lib/brand-events";
import { cn } from "@/lib/cn";
import { getRuns, startStreamRun, subscribeRuns } from "@/lib/runs/store";

export default function CreateLpButton({
  brandId,
  label = "LPを作る",
  variant = "solid",
  className,
}: {
  brandId: string;
  label?: string;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const key = `lp:${brandId}`;
  // Every copy of the button for this brand knows a run is in flight, even
  // one on a page opened after it started.
  const running = useSyncExternalStore(
    subscribeRuns,
    () => getRuns().some((run) => run.key === key && run.status === "running"),
    () => false,
  );

  async function create() {
    const created = await startStreamRun({
      key,
      label: "LPを作成しています",
      request: () => authedFetch(`/api/brands/${brandId}/lps`, { method: "POST" }),
      resultHref: (id) => `/brands/${brandId}/works/lp/${id}`,
      onDone: (id) => router.push(`/brands/${brandId}/works/lp/${id}`),
    });
    if (created) refreshBrandTree();
  }

  return (
    <button
      type="button"
      onClick={() => void create()}
      disabled={running}
      className={cn(
        "rounded-full px-5 py-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        variant === "solid"
          ? "bg-ink text-paper hover:bg-accent"
          : "border border-ink text-ink hover:bg-ink hover:text-paper",
        className,
      )}
    >
      {running ? "作成中…" : label}
    </button>
  );
}
