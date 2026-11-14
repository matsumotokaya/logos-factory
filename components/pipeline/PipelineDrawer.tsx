"use client";

// The pipeline, opened from the thing it made.
//
// A page shows what was made — a brand kit, an LP — and nothing of how. When
// the user wants it changed, the way is not to type over a value but to
// change what went IN and run it again (owner's direction, 2026-11-14). So
// the page carries one button, and the button opens this: the stages from
// input to output, top to bottom, each one opening in place to show what it
// took and what it produced, with the control that runs them all above.
//
// Stages open inside the drawer, never as a second drawer over it. One at a
// time, so the column stays a column.
//
// Shared by every deliverable. A page supplies its stages (lib/pipeline/*),
// what each one shows, and the block that runs it again.

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { PipelineStage, PipelineStageStatus } from "@/lib/pipeline/stages";
import StageDrawer from "./StageDrawer";

const STATUS_DOT: Record<PipelineStageStatus, string> = {
  empty: "border-hairline bg-paper",
  ready: "border-emerald-500 bg-emerald-500",
  stale: "border-amber-500 bg-amber-500",
};

const STATUS_LABEL: Record<PipelineStageStatus, string> = {
  empty: "未実行",
  ready: "最新",
  stale: "要更新",
};

export const UPSTREAM_STAGE = "upstream";

export type PipelineUpstreamView = {
  label: string;
  summary: string;
  status: PipelineStageStatus;
};

export default function PipelineDrawer({
  title,
  description,
  lead,
  upstream,
  stages,
  activeStage,
  initialStage = null,
  renderStage,
  footer,
  onClose,
}: {
  title: string;
  description: string;
  /** Above the stages: when it last ran, and the control that runs it again. */
  lead: ReactNode;
  /** What this was made from (an LP's kit), shown before the first stage. */
  upstream?: PipelineUpstreamView | null;
  stages: PipelineStage[];
  /** The stage a run is in right now. */
  activeStage?: string | null;
  initialStage?: string | null;
  /** The inside of a stage (`UPSTREAM_STAGE` for the upstream row). */
  renderStage: (id: string) => ReactNode;
  /** Pinned to the drawer's foot however long the column grows: what goes in,
   *  and the one press that runs it (Slide Factory's upload stage). */
  footer?: ReactNode;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(initialStage);

  // While a run goes, the rail follows the run, not the last record: the
  // stages it has passed are done, the one it is in turns, the rest wait.
  // The stored state (often 要更新 — that is why it is being run) would
  // otherwise stay orange behind a run that has already redone it, and only
  // turn green when the whole run lands.
  const activeIndex = activeStage ? stages.findIndex((stage) => stage.id === activeStage) : -1;
  const during = (index: number | null): "done" | "waiting" | null => {
    if (activeIndex < 0 || index === null) return null;
    if (index < activeIndex) return "done";
    if (index > activeIndex) return "waiting";
    return null;
  };

  const rows = [
    ...(upstream
      ? [{ id: UPSTREAM_STAGE, label: upstream.label, summary: upstream.summary, status: upstream.status, index: null as number | null }]
      : []),
    ...stages.map((stage, index) => ({ id: stage.id as string, label: stage.label, summary: stage.summary, status: stage.status, index })),
  ];

  return (
    <StageDrawer title={title} description={description} onClose={onClose}>
      {lead}
      <ol aria-label="パイプライン" className="flex flex-col">
        {rows.map((row, position) => {
          const expanded = open === row.id;
          const running = activeStage === row.id;
          const progress = during(row.index);
          const status: PipelineStageStatus = progress === "done" ? "ready" : progress === "waiting" ? "empty" : row.status;
          const last = position === rows.length - 1;
          return (
            <li key={row.id} className="relative pl-9">
              {/* The rail: one line down the column, a node at each stage. */}
              {!last ? <span aria-hidden="true" className="absolute bottom-0 left-[11px] top-6 w-px bg-hairline" /> : null}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[5px] top-[18px] size-[13px] rounded-full border-2",
                  running ? "animate-spin border-accent/30 border-t-accent bg-paper" : STATUS_DOT[status],
                )}
              />
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : row.id)}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                  expanded ? "bg-ink/[0.04]" : "hover:bg-ink/[0.03]",
                )}
              >
                {row.index !== null ? (
                  <span className="font-mono text-[10px] text-ink-faint">{String(row.index + 1).padStart(2, "0")}</span>
                ) : null}
                <span className="shrink-0 text-sm font-semibold text-ink">{row.label}</span>
                <span className={cn("min-w-0 flex-1 truncate text-xs", progress === "waiting" ? "text-ink-faint" : "text-ink-muted")}>
                  {running ? "実行中…" : progress === "done" ? "今回の実行で完了" : progress === "waiting" ? "待機中" : row.summary}
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">
                  {running || progress ? "" : STATUS_LABEL[row.status]}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className={cn("size-4 shrink-0 text-ink-muted transition-transform", expanded && "rotate-180")}
                >
                  <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {expanded ? <div className="flex flex-col gap-5 px-3 pb-6 pt-3">{renderStage(row.id)}</div> : null}
            </li>
          );
        })}
      </ol>
      {footer ? (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-5 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-paper px-6 py-3">
          {footer}
        </div>
      ) : null}
    </StageDrawer>
  );
}
