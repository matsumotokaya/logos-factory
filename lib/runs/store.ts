"use client";

// The runs the workspace is waiting on, held above every page.
//
// Making an LP or a video takes twenty seconds to a minute, and the account of
// it (the run card) used to belong to the page whose button started it. Leave
// that page and the card went with it — the work carried on, and nothing said
// so. This store is module state, read by the dock the management shell
// draws once (components/pipeline/RunDock.tsx), so the card stays wherever
// the user goes for as long as the work runs.
//
// The stream is read here too, not in the component that pressed the button:
// a component that unmounts stops caring about its fetch, and the last lines —
// the ones that say it finished — would land nowhere.
//
// It lives as long as the tab. A reload ends the request; the server finishes
// the work regardless (the routes never let a closed stream stop it) and the
// result appears in the lists, but the card does not come back.

import type { RunCard } from "@/components/pipeline/RunOverlay";
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStageId } from "@/lib/pipeline/stages";

export type DockRun = RunCard & {
  /** What the run is making, so a button can tell its own run is in flight. */
  key: string;
  /** Where the result opens, once there is one. */
  href: string | null;
  /** The page the run was started from. */
  startedOn: string;
};

/** One line of a creation stream (NDJSON), as the create routes write it. */
export type StreamEvent =
  | { type: "step"; label: string; index: number; total: number; stage?: PipelineStageId }
  | { type: "done"; id: string; note?: string | null }
  | { type: "error"; message: string };

let runs: DockRun[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function update(id: string, patch: (run: DockRun) => DockRun) {
  runs = runs.map((run) => (run.id === id ? patch(run) : run));
  emit();
}

export function subscribeRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getRuns = (): DockRun[] => runs;
const EMPTY: DockRun[] = [];
export const getServerRuns = (): DockRun[] => EMPTY;

export function dismissRun(id: string) {
  runs = runs.filter((run) => run.id !== id);
  emit();
}

export const isRunning = (key: string): boolean =>
  runs.some((run) => run.key === key && run.status === "running");

/**
 * Start a creation and follow its stream.
 *
 * Resolves with the created id, or null when it failed (the card says why).
 * `onDone` runs only while the user is still on the page that started it —
 * opening the result is right there and wrong anywhere else, where the card's
 * 「開く」 does it instead.
 */
export async function startStreamRun(input: {
  key: string;
  label: string;
  request: () => Promise<Response>;
  resultHref: (id: string) => string;
  onDone?: (id: string) => void;
}): Promise<string | null> {
  const id = `${input.key}-${Date.now()}`;
  const startedOn = typeof window === "undefined" ? "" : window.location.pathname;
  runs = [
    ...runs,
    {
      id,
      key: input.key,
      label: input.label,
      status: "running",
      lines: [],
      startedAt: Date.now(),
      endedAt: null,
      href: null,
      startedOn,
    },
  ];
  emit();
  const push = (line: string) => update(id, (run) => ({ ...run, lines: [...run.lines, line] }));

  try {
    const res = await input.request();
    // A refusal before the work began is ordinary JSON with a status.
    if (!res.ok || !res.body) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error ?? "開始できませんでした");
    }
    let created: string | null = null;
    let failed: string | null = null;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let event: StreamEvent;
        try {
          event = JSON.parse(line) as StreamEvent;
        } catch {
          continue;
        }
        if (event.type === "step") {
          const stage = event.stage && (PIPELINE_STAGES as readonly string[]).includes(event.stage) ? event.stage : null;
          push(`${event.index}/${event.total} ${stage ? `${STAGE_LABELS[stage]} — ` : ""}${event.label}`);
          if (stage) update(id, (run) => ({ ...run, stage }));
        }
        else if (event.type === "done") {
          created = event.id;
          if (event.note) push(event.note);
        } else if (event.type === "error") failed = event.message;
      }
    }
    if (failed || !created) throw new Error(failed ?? "完了を確認できませんでした");

    const href = input.resultHref(created);
    const stillThere = typeof window !== "undefined" && window.location.pathname === startedOn;
    push("できました");
    update(id, (run) => ({ ...run, status: "succeeded", endedAt: Date.now(), href }));
    if (stillThere) input.onDone?.(created);
    return created;
  } catch (error) {
    update(id, (run) => ({
      ...run,
      status: "failed",
      endedAt: Date.now(),
      error: error instanceof Error ? error.message : "失敗しました",
    }));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Runs that live in the database

type BrandRunView = {
  status: "running" | "done" | "error";
  steps: { message: string; stage?: PipelineStageId }[];
  error: string | null;
  createdAt: string;
};

const BRAND_RUN_POLL_MS = 2000;

/**
 * Follow a brand's site read (brand_runs) in the dock.
 *
 * Unlike a creation stream, this run belongs to the server: it was started by
 * a request that already returned, and it is read back by polling. So the
 * card can be picked up by any page that notices the run — the brand page
 * calls this when it starts a read and when it finds one in flight — and it
 * stays in the dock after that page is left. Calling it twice for the same
 * brand is a no-op while the first is still following.
 */
export function watchBrandRun(input: {
  brandId: string;
  brandName: string;
  read: () => Promise<BrandRunView | null>;
}): void {
  const key = `brand:${input.brandId}`;
  if (isRunning(key)) return;
  const id = `${key}-${Date.now()}`;
  const page = `/brands/${input.brandId}`;
  runs = [
    ...runs,
    {
      id,
      key,
      label: `${input.brandName || "ブランド"} の情報を更新しています`,
      status: "running",
      lines: [],
      startedAt: Date.now(),
      endedAt: null,
      href: null,
      startedOn: typeof window === "undefined" ? "" : window.location.pathname,
    },
  ];
  emit();

  let seenRunning = false;
  const poll = async () => {
    if (!runs.some((run) => run.id === id)) return; // dismissed
    let view: BrandRunView | null = null;
    try {
      view = await input.read();
    } catch {
      // A failed poll is not a failed run; ask again.
    }
    if (view) {
      const lines = view.steps.map((step) => step.message);
      const stage = [...view.steps].reverse().find((step) => step.stage)?.stage ?? null;
      const startedAt = new Date(view.createdAt).getTime() || Date.now();
      if (view.status === "running") {
        seenRunning = true;
        update(id, (run) => ({ ...run, lines, stage, startedAt }));
      } else if (!seenRunning) {
        // Nothing was running after all (the page was a moment late).
        dismissRun(id);
        return;
      } else {
        // Offer the way back only to someone who has gone elsewhere.
        const away = typeof window !== "undefined" && window.location.pathname !== page;
        update(id, (run) => ({
          ...run,
          lines,
          stage,
          status: view.status === "done" ? "succeeded" : "failed",
          error: view.status === "error" ? (view.error ?? "読み取りに失敗しました") : null,
          endedAt: Date.now(),
          href: view.status === "done" && away ? page : null,
        }));
        return;
      }
    }
    window.setTimeout(() => void poll(), BRAND_RUN_POLL_MS);
  };
  void poll();
}
