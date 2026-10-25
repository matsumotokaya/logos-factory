import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// A re-import of a brand's site, as a run with a log.
//
// Re-import used to be one request that answered when everything was done, so
// for the minute it took the page showed only that it was busy. Like a
// generation, it now runs detached and writes each step here; the brand page
// polls and shows the steps in the same floating log. Stored the way campaign
// jobs are (one JSON file per run under var/), because the run is local
// progress, not brand data — what it learns goes to the database as it goes.

export type RecaptureStep = {
  ts: string;
  message: string;
  level: "info" | "success" | "warn";
};

export type RecaptureResult = {
  url: string;
  adopted: number;
  claims: number;
  files: number;
  note: string | null;
};

export type RecaptureRun = {
  id: string;
  userId: string;
  brandId: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "done" | "error";
  steps: RecaptureStep[];
  result: RecaptureResult | null;
  error: string | null;
};

const RUNS_DIR = path.join(process.cwd(), "var", "brand-recapture", "runs");
const SAFE_ID = /^[a-f0-9-]{36}$/;
/** A running run this quiet has lost its process (restart, timeout). */
const STALE_RUNNING_MS = 5 * 60 * 1000;

function runPath(id: string): string {
  return path.join(RUNS_DIR, `${id}.json`);
}

function writeRun(run: RecaptureRun): void {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  run.updatedAt = new Date().toISOString();
  fs.writeFileSync(runPath(run.id), JSON.stringify(run));
}

function readRun(id: string): RecaptureRun | null {
  if (!SAFE_ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(runPath(id), "utf8")) as RecaptureRun;
  } catch {
    return null;
  }
}

export function createRecaptureRun(userId: string, brandId: string): RecaptureRun {
  const now = new Date().toISOString();
  const run: RecaptureRun = {
    id: randomUUID(),
    userId,
    brandId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    steps: [],
    result: null,
    error: null,
  };
  writeRun(run);
  return run;
}

export function appendRecaptureStep(
  id: string,
  message: string,
  level: RecaptureStep["level"] = "info",
): void {
  const run = readRun(id);
  if (!run) return;
  run.steps.push({ ts: new Date().toISOString(), message, level });
  writeRun(run);
}

export function finishRecaptureRun(id: string, result: RecaptureResult): void {
  const run = readRun(id);
  if (!run) return;
  run.status = "done";
  run.result = result;
  writeRun(run);
}

export function failRecaptureRun(id: string, error: string): void {
  const run = readRun(id);
  if (!run) return;
  run.status = "error";
  run.error = error;
  run.steps.push({ ts: new Date().toISOString(), message: error, level: "warn" });
  writeRun(run);
}

function failIfStale(run: RecaptureRun): RecaptureRun {
  if (run.status !== "running") return run;
  if (Date.now() - new Date(run.updatedAt).getTime() < STALE_RUNNING_MS) return run;
  run.status = "error";
  run.error = "読み直しが途中で停止しました（サーバー再起動の可能性）。もう一度実行してください。";
  writeRun(run);
  return run;
}

/** One run, if it belongs to this user. */
export function getRecaptureRun(id: string, userId: string): RecaptureRun | null {
  const run = readRun(id);
  if (!run || run.userId !== userId) return null;
  return failIfStale(run);
}

/** The newest run of this user's on this brand. */
export function latestRecaptureRun(userId: string, brandId: string): RecaptureRun | null {
  let latest: RecaptureRun | null = null;
  try {
    for (const file of fs.readdirSync(RUNS_DIR)) {
      if (!file.endsWith(".json")) continue;
      const run = readRun(file.slice(0, -".json".length));
      if (!run || run.userId !== userId || run.brandId !== brandId) continue;
      if (!latest || run.createdAt > latest.createdAt) latest = run;
    }
  } catch {
    return null; // no run has been written yet
  }
  return latest ? failIfStale(latest) : null;
}
