"use client";

// The generation that fills this brand, said in plain text on the brand page.
//
// A generation used to have a page of its own (/campaigns/[id]) that held the
// result; the brand is that place now (template contract: CM Maker folds into
// the brand). What is left of the run is its state — still going, failed, or
// done with a log — and the way to make its product video, which is still
// tied to the run's local job record.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { videoFetch } from "@/lib/video/client";
import { refreshBrandTree } from "@/lib/brand-events";
import { ProcessLogPopup } from "@/app/campaigns/ProcessLogPopup";
import { toStepEvents } from "@/app/campaigns/campaign-ui";

type Step = { message: string; level?: string; ts: string };

type JobState = {
  id: string;
  status: "running" | "done" | "error";
  createdAt: string;
  error: string | null;
  steps: Step[];
  catalogError?: string | null;
};

// Short enough that the log reads as live; each poll is one small JSON read.
const POLL_MS = 2000;

export default function BrandGenerationStatus({
  brandId,
  onSettled,
}: {
  brandId: string;
  /** Called once when a run that was going finishes, to reload the page. */
  onSettled: () => void;
}) {
  const [job, setJob] = useState<JobState | null>(null);
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
        const res = await videoFetch(
          `/api/labs/campaign/jobs?brandId=${encodeURIComponent(brandId)}`,
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { job: JobState | null };
        if (cancelled) return;
        setJob(body.job);
        const running = body.job?.status === "running";
        if (wasRunning.current && !running) {
          // The name, the kind and the workspace name change when the run
          // lands, so the tree reloads with the page.
          refreshBrandTree();
          settledRef.current();
        }
        wasRunning.current = running;
        if (running) timer = window.setTimeout(poll, POLL_MS);
      } catch {
        // No session or the job store is unreachable: say nothing rather
        // than block the page.
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [brandId]);

  if (!job) return null;

  const events = toStepEvents(
    job.steps.map((step) => ({
      ts: step.ts,
      message: step.message,
      level: step.level === "success" || step.level === "warn" ? step.level : "info",
    })),
  );
  const catalogError = job.catalogError ?? null;

  return (
    <section
      aria-label="生成の状態"
      className="rounded-xl border border-hairline px-4 py-3 text-[12px]"
    >
      {job.status === "running" ? (
        <>
          <p className="font-semibold text-ink">
            URLを読み取って、このブランドを作っています（2〜4分）
          </p>
          <p className="mt-1 text-ink-muted">
            ページを離れても処理は続きます。終わると、このページに中身が入ります。
          </p>
          {/* What the AI is doing, line by line, while it does it: the same
              floating window the job page had. It goes when the run settles;
              the log stays below as 処理ログ. */}
          {job.steps.length > 0 ? <ProcessLogPopup steps={events} /> : null}
        </>
      ) : job.status === "error" ? (
        <p className="text-red-700" role="alert">
          生成に失敗しました: {job.error ?? "原因不明のエラー"}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-muted">
            {new Date(job.createdAt).toLocaleString("ja-JP")} の生成から作られました
            {catalogError ? (
              <span className="ml-2 text-amber-700">
                （ブランドへの登録の一部に失敗: {catalogError}）
              </span>
            ) : null}
          </p>
          <Link
            href={`/brands/${brandId}/video/${job.id}`}
            className="font-semibold text-ink underline-offset-4 hover:underline"
          >
            この生成から製品紹介動画を作る
          </Link>
        </div>
      )}
      {job.steps.length > 0 && job.status !== "running" ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-muted">処理ログ</summary>
          <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto text-ink-muted">
            {job.steps.map((step, index) => (
              <li key={`${step.ts}-${index}`}>{step.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
