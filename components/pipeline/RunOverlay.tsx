"use client";

// The bottom-right card that says what a stage run is doing.
//
// Modelled on slide-factory's JobOverlay, and for the same reason: pressing a
// button that takes thirty seconds and shows nothing is indistinguishable from
// pressing a button that does nothing.
//
// The dismissal rule carries the meaning. A success takes itself off the
// screen after ten seconds — it worked, the result is already visible in the
// stage — while a failure stays until it is closed, because an error nobody
// read is an error that will be hit again. Either way the full record stays in
// the run log at the bottom of the drawer.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStageId } from "@/lib/pipeline/stages";

export type RunStatus = "running" | "succeeded" | "failed";

export interface RunCard {
  id: string;
  label: string;
  status: RunStatus;
  lines: string[];
  error?: string | null;
  startedAt: number;
  endedAt: number | null;
  /** Where the result opens. A finished card with one stays until closed:
   *  the user moved on, and this is how they get back to what they made. */
  link?: { href: string; label: string } | null;
  /** The pipeline stage the run is in, when the run reports one. The card
   *  then shows the five stages above its log — the pipeline and the log
   *  are one set wherever something is being made. */
  stage?: PipelineStageId | null;
}

const SUCCESS_DISMISS_MS = 10_000;

/** The workspace's run column (components/pipeline/RunDock.tsx). */
export const RUN_DOCK_ID = "run-dock";
export const RUN_COLUMN_CLASS =
  "fixed bottom-4 right-4 z-50 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 empty:hidden";

function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`;
}

/** Ticks while running so a long job visibly keeps moving; freezes when done. */
function useElapsed(startedAt: number, endedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endedAt !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endedAt]);
  return elapsedLabel((endedAt ?? now) - startedAt);
}

/** The five stages, in a line: done, the one running, the ones to come. */
function StageStrip({ stage, status }: { stage: PipelineStageId; status: RunStatus }) {
  const at = PIPELINE_STAGES.indexOf(stage);
  return (
    <ol aria-label="パイプライン" className="grid grid-cols-5 gap-1 border-b border-hairline px-3 py-2">
      {PIPELINE_STAGES.map((id, index) => {
        const done = status === "succeeded" || index < at;
        const current = index === at && status !== "succeeded";
        return (
          <li key={id} className="flex min-w-0 flex-col gap-1">
            <span
              className={cn(
                "h-1 rounded-full",
                done
                  ? "bg-emerald-500"
                  : current
                    ? status === "failed"
                      ? "bg-red-500"
                      : "animate-pulse bg-accent"
                    : "bg-hairline",
              )}
            />
            <span
              className={cn(
                "truncate text-[10px]",
                current ? "font-semibold text-ink" : done ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              {STAGE_LABELS[id]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RunCardView({ run, onDismiss }: { run: RunCard; onDismiss: () => void }) {
  const logRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsed(run.startedAt, run.endedAt);
  const running = run.status === "running";

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run.lines.length]);

  useEffect(() => {
    if (run.status !== "succeeded" || run.link) return;
    const timer = setTimeout(onDismiss, SUCCESS_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [run.status, run.link, onDismiss]);

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-white shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b border-hairline bg-ink/[0.03] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {running ? (
            <span className="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
          ) : null}
          <span className="truncate text-xs font-semibold text-ink">{run.label}</span>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs font-semibold",
              running
                ? "text-ink-muted"
                : run.status === "succeeded"
                  ? "text-emerald-700"
                  : "text-red-700",
            )}
          >
            {running ? "実行中" : run.status === "succeeded" ? "完了" : "失敗"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums text-[11px] text-ink-muted">{elapsed}</span>
          {run.status === "succeeded" && run.link ? (
            <Link
              href={run.link.href}
              onClick={onDismiss}
              className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper hover:bg-accent"
            >
              {run.link.label}
            </Link>
          ) : null}
          {!running ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="この実行の表示を閉じる"
              className="rounded px-1.5 py-0.5 text-xs leading-none text-ink-faint hover:bg-ink/5 hover:text-ink"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {run.stage ? <StageStrip stage={run.stage} status={run.status} /> : null}

      {run.status === "failed" && run.error ? (
        <div className="border-b border-hairline bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          エラー: {run.error}
        </div>
      ) : null}

      <div
        ref={logRef}
        className="max-h-40 space-y-0.5 overflow-y-auto bg-[#0b0d13] px-3 py-2 font-mono text-[11px] leading-relaxed text-white/80"
      >
        {run.lines.length === 0 && running ? (
          <div className="text-white/40">開始しています…</div>
        ) : null}
        {run.lines.map((line, i) => (
          <div key={`${line}-${i}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}

export default function RunOverlay({
  runs,
  onDismiss,
}: {
  runs: RunCard[];
  onDismiss: (id: string) => void;
}) {
  // The workspace draws one column for every run (RunDock). A page's own
  // cards join it, so two stacks never sit on top of each other.
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const found = document.getElementById(RUN_DOCK_ID);
    const timer = window.setTimeout(() => setDock(found), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (runs.length === 0) return null;
  const cards = runs.map((run) => (
    <RunCardView key={run.id} run={run} onDismiss={() => onDismiss(run.id)} />
  ));
  if (dock) return createPortal(cards, dock);
  return (
    // Above the stage drawer, so a run stays readable while a stage is open.
    <div className={RUN_COLUMN_CLASS}>{cards}</div>
  );
}
