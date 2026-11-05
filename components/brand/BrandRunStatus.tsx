"use client";

// The brand's latest run — reading its site on creation or on 「サイトを読み
// 直す」 — as ONE line: when it was read, what it brought back, the log, and
// the button to read again. Reads brand_runs through GET /api/brands/[id]/runs;
// a reload picks a running run back up because the run lives in the database,
// not the page.
//
// It used to be two: this said 「読み取りました」 with the date, and the page
// said it again with the counts in a notice above. One run, one sentence.

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { refreshBrandTree } from "@/lib/brand-events";
import {
  ProcessLogLines,
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

function summary(result: BrandRunState["result"]): string {
  if (!result) return "";
  return [
    `${result.adopted}項目を採用`,
    `${result.claims}件を記録`,
    `画像${result.files}点`,
  ].join("・");
}

export default function BrandRunStatus({
  brandId,
  watch,
  onSettled,
  website,
  busy,
  onReimport,
}: {
  brandId: string;
  /** Bumped by the page when it starts a run, so polling resumes. */
  watch: number;
  /** Called once when a run this component saw running finishes. */
  onSettled: (run: BrandRunState) => void;
  /** The site to read; no site, no button. */
  website: string | null;
  busy: boolean;
  onReimport: () => void;
}) {
  const [run, setRun] = useState<BrandRunState | null>(null);
  const [logOpen, setLogOpen] = useState(false);
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

  if (!run && !website) return null;
  const running = run?.status === "running" || busy;

  const button = website ? (
    <button
      type="button"
      onClick={onReimport}
      disabled={running}
      className="shrink-0 rounded-full border border-ink px-4 py-1.5 text-xs font-semibold transition hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-50"
    >
      {running ? "読み取り中…" : run ? "サイトを読み直す" : "サイトから取り込む"}
    </button>
  ) : null;

  return (
    <section aria-label="サイトの読み取り" className="rounded-xl border border-hairline px-4 py-3 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {run?.status === "running" ? (
          <div>
            <p className="font-semibold text-ink">サイトを読み取って、このブランドに入れています（1〜2分）</p>
            <p className="mt-0.5 text-ink-muted">
              ページを離れても処理は続きます。終わると、このページに中身が入ります。
            </p>
          </div>
        ) : run?.status === "error" ? (
          <p className="text-red-700" role="alert">
            サイトの読み取りに失敗しました: {run.error ?? "原因不明のエラー"}
          </p>
        ) : run ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-ink-muted">
            <span>
              <span className="font-semibold text-ink">
                {new Date(run.createdAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}
              </span>{" "}
              にサイトを読み取りました
            </span>
            {run.result ? <span>— {summary(run.result)}</span> : null}
            {run.result?.note ? <span>{run.result.note}</span> : null}
            {run.steps.length > 0 ? (
              <button
                type="button"
                onClick={() => setLogOpen((open) => !open)}
                aria-expanded={logOpen}
                className="text-accent hover:underline"
              >
                {logOpen ? "処理ログを閉じる" : "処理ログ"}
              </button>
            ) : null}
          </p>
        ) : (
          <p className="text-ink-muted">
            このブランドはまだサイトを読み取っていません。読み取ると、ロゴ・配色・書体・構成・連絡先がここに入ります。
          </p>
        )}
        {button}
      </div>
      {run?.status === "running" && run.steps.length > 0 ? (
        <ProcessLogPopup steps={toStepEvents(run.steps)} title="処理ログ — サイトを読み取っています" />
      ) : null}
      {run && run.status !== "running" && logOpen ? (
        <div className="mt-3 max-h-64 overflow-y-auto border-t border-hairline pt-3">
          <ProcessLogLines steps={toStepEvents(run.steps)} working={false} />
        </div>
      ) : null}
    </section>
  );
}
