"use client";

// The brand's latest run — reading its site on creation or on 「サイトを読み
// 直す」. Reads brand_runs through GET /api/brands/[id]/runs; a reload picks
// a running run back up because the run lives in the database, not the page.
//
// On the page it takes one line among the facts: 「更新  2026/11/06 9:46」.
// That line opens a drawer with the rest — what the read brought back, the
// log, and the button to read again. While a run is going, the floating log
// shows the steps. The page used to give this a box of its own above the
// name, which is a lot of room for a date.

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { refreshBrandTree } from "@/lib/brand-events";
import {
  ProcessLogLines,
  ProcessLogPopup,
  toStepEvents,
  type StepLevel,
} from "@/components/pipeline/ProcessLogPopup";
import StageDrawer from "@/components/pipeline/StageDrawer";

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

const when = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });

function summary(result: BrandRunState["result"]): string {
  if (!result) return "";
  return [`${result.adopted}項目を採用`, `${result.claims}件を記録`, `画像${result.files}点`].join("・");
}

/** The fact-row value: the date, or the state, as the drawer's trigger. */
export function BrandRunFact({
  run,
  busy,
  onOpen,
}: {
  run: BrandRunState | null;
  busy: boolean;
  onOpen: () => void;
}) {
  const text =
    run?.status === "running" || busy
      ? "読み取り中…"
      : run?.status === "error"
        ? "読み取りに失敗"
        : run
          ? when(run.createdAt)
          : "まだ読み取っていません";
  return (
    <button
      type="button"
      onClick={onOpen}
      title="サイトの読み取り — 詳細・処理ログ・読み直し"
      className={
        run?.status === "error"
          ? "rounded-sm text-red-700 underline decoration-dotted underline-offset-4 hover:decoration-solid"
          : "rounded-sm text-ink underline decoration-dotted decoration-ink-faint underline-offset-4 hover:decoration-solid"
      }
    >
      {text}
    </button>
  );
}

/** The floating log while a run is going; nothing otherwise. */
export function BrandRunLive({ run }: { run: BrandRunState | null }) {
  if (run?.status !== "running" || run.steps.length === 0) return null;
  return <ProcessLogPopup steps={toStepEvents(run.steps)} title="処理ログ — サイトを読み取っています" />;
}

/** The drawer: when, what came back, the log, and 「サイトを読み直す」. */
export function BrandRunDrawer({
  run,
  website,
  busy,
  onReimport,
  onClose,
}: {
  run: BrandRunState | null;
  website: string | null;
  busy: boolean;
  onReimport: () => void;
  onClose: () => void;
}) {
  const running = run?.status === "running" || busy;
  return (
    <StageDrawer
      title="サイトの読み取り"
      description="サイトを読み、色・書体・構成・連絡先・ロゴ・画像をこのブランドに入れます。人が確定した値は触りません。"
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 text-[12px]">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="text-ink-faint">サイト</dt>
          <dd className="min-w-0 truncate text-ink">{website ?? "—"}</dd>
          <dt className="text-ink-faint">最後の読み取り</dt>
          <dd className="text-ink">
            {run?.status === "running"
              ? "読み取っています（1〜2分）。ページを離れても処理は続きます"
              : run
                ? when(run.createdAt)
                : "まだ読み取っていません"}
          </dd>
          {run?.status === "done" && run.result ? (
            <>
              <dt className="text-ink-faint">結果</dt>
              <dd className="text-ink">
                {summary(run.result)}
                {run.result.note ? <span className="ml-1 text-ink-muted">{run.result.note}</span> : null}
              </dd>
            </>
          ) : null}
          {run?.status === "error" ? (
            <>
              <dt className="text-ink-faint">エラー</dt>
              <dd className="text-red-700" role="alert">
                {run.error ?? "原因不明のエラー"}
              </dd>
            </>
          ) : null}
        </dl>

        {website ? (
          <div>
            <button
              type="button"
              onClick={onReimport}
              disabled={running}
              className="rounded-full border border-ink px-4 py-1.5 text-xs font-semibold transition hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-50"
            >
              {running ? "読み取り中…" : run ? "サイトを読み直す" : "サイトから取り込む"}
            </button>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              測り直した表現（色・書体・形）は採用し直します。名前や説明など人が確定した値はそのままです。
            </p>
          </div>
        ) : (
          <p className="text-ink-muted">サイトの URL が無いので読み取れません。</p>
        )}

        {run && run.steps.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">処理ログ</p>
            <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-hairline p-3">
              <ProcessLogLines steps={toStepEvents(run.steps)} working={run.status === "running"} />
            </div>
          </div>
        ) : null}
      </div>
    </StageDrawer>
  );
}
