"use client";

// The brand's latest run — reading its site on creation or on 「サイトを読み
// 直す」 — said in plain text, with the steps in the floating log while it
// goes. Reads brand_runs through GET /api/brands/[id]/runs; a reload picks a
// running run back up because the run lives in the database, not the page.

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { refreshBrandTree } from "@/lib/brand-events";
import {
  ProcessLogPopup,
  toStepEvents,
  type StepLevel,
} from "@/components/pipeline/ProcessLogPopup";

export type BrandRunState = {
  id: string;
  status: "running" | "done" | "error";
  steps: { ts: string; message: string; level: StepLevel }[];
  result: { adopted: number; claims: number; files: number; note: string | null } | null;
  error: string | null;
  createdAt: string;
};

/** Short enough that the log reads as live; each poll is one small row. */
const POLL_MS = 2000;

export default function BrandRunStatus({
  brandId,
  watch,
  onSettled,
}: {
  brandId: string;
  /** Bumped by the page when it starts a run, so polling resumes. */
  watch: number;
  /** Called once when a run this component saw running finishes. */
  onSettled: (run: BrandRunState) => void;
}) {
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

  if (!run) return null;

  return (
    <section aria-label="サイトの読み取り" className="rounded-xl border border-hairline px-4 py-3 text-[12px]">
      {run.status === "running" ? (
        <>
          <p className="font-semibold text-ink">サイトを読み取って、このブランドに入れています（1〜2分）</p>
          <p className="mt-1 text-ink-muted">
            ページを離れても処理は続きます。終わると、このページに中身が入ります。
          </p>
          {run.steps.length > 0 ? (
            <ProcessLogPopup
              steps={toStepEvents(run.steps)}
              title="処理ログ — サイトを読み取っています"
            />
          ) : null}
        </>
      ) : run.status === "error" ? (
        <p className="text-red-700" role="alert">
          サイトの読み取りに失敗しました: {run.error ?? "原因不明のエラー"}
        </p>
      ) : (
        <p className="text-ink-muted">
          {new Date(run.createdAt).toLocaleString("ja-JP")} にサイトを読み取りました
        </p>
      )}
      {run.status !== "running" && run.steps.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-muted">処理ログ</summary>
          <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto text-ink-muted">
            {run.steps.map((step, index) => (
              <li key={`${step.ts}-${index}`}>{step.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
