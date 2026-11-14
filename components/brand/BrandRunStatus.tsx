"use client";

// The brand's latest run — reading its site on creation or on 「すべてやり
// 直す」. Reads brand_runs through GET /api/brands/[id]/runs; a reload picks
// a running run back up because the run lives in the database, not the page.
//
// This is only the follower. The page shows the run as one line under the
// name (「最終更新 …」), its log lives in the workspace's run column
// (lib/runs/store.ts `watchBrandRun`), and the rest — result, log, the
// control that runs it again — is the head of the pipeline drawer.

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { refreshBrandTree } from "@/lib/brand-events";
import type { PipelineStageId } from "@/lib/pipeline/stages";
import type { StepLevel } from "@/components/pipeline/ProcessLogPopup";

export type BrandRunState = {
  id: string;
  status: "running" | "done" | "error";
  steps: { ts: string; message: string; level: StepLevel; stage?: PipelineStageId }[];
  result: { url?: string; adopted: number; claims: number; files: number; note: string | null } | null;
  error: string | null;
  createdAt: string;
};

/** Short enough that the log reads as live; each poll is one small row. */
const POLL_MS = 2000;

/** Follows the brand's latest run; `watch` restarts polling after the page starts one. */
export function useBrandRun(
  brandId: string,
  watch: number,
  onSettled: (run: BrandRunState) => void,
): BrandRunState | null {
  const [run, setRun] = useState<BrandRunState | null>(null);
  const wasRunning = useRef(false);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await authedFetch(`/api/brands/${brandId}/runs`);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { run: BrandRunState | null };
        if (cancelled) return;
        setRun(body.run);
        const running = body.run?.status === "running";
        if (wasRunning.current && !running && body.run) {
          // A run renames the brand and its workspace on creation, so the
          // tree reloads with the page.
          refreshBrandTree();
          settledRef.current(body.run);
        }
        wasRunning.current = running;
        if (running) timer = window.setTimeout(poll, POLL_MS);
      } catch {
        // No session, or the run is unreadable: say nothing rather than
        // block the page.
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [brandId, watch]);

  return run;
}
