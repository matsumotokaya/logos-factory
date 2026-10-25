import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CampaignBrandKit, CampaignPartial } from "./schema";
import type { CampaignCmState, CmVoiceTrack } from "./cm-types";
import type { PipelineProgress, LlmUsageSummary } from "./pipeline";
import type { BrandMatchJudgment } from "./creative";
import type { CampaignCatalogLink } from "./catalog";
import type { UrlRegistrationScope } from "@/lib/brand-registration";
import { renderLandingPage } from "./render-lp";

// Campaign job store — generation runs server-side detached from the HTTP
// request, so closing the tab or losing the connection never loses the run:
// the UI re-attaches by polling the persisted record. Lab phase persists to
// var/campaign-lab/ on the local disk; Phase 1 moves this to a `campaigns`
// table + R2 (see labs/campaign/README.md roadmap).

export interface CampaignJobMeta {
  captured: boolean;
  adjudicated: boolean;
  verification: (BrandMatchJudgment & { retried: boolean }) | null;
  /** LLM API cost of this run (absent on records from before cost tracking). */
  usage?: LlmUsageSummary | null;
}

export interface CampaignJobStep extends PipelineProgress {
  ts: string; // ISO timestamp
}

export interface CampaignJob {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "done" | "error";
  input: {
    url: string | null;
    name: string | null;
    files: number;
    fileKinds?: Array<"pdf" | "image">;
    hasText: boolean;
    /** Existing business/audience selected from the brand catalog. */
    brandEntityId?: string | null;
    /** The workspace the new Brand belongs in, as chosen on the entry form. */
    organizationId?: string | null;
    /** Create a workspace for the new Brand, named after the company the
     *  source names. Set when the user picked 「新しいワークスペース」 or had
     *  no workspace yet. Jobs with neither field predate the choice and fall
     *  back to ensure_my_workspace(). */
    newWorkspace?: boolean;
    /** Where a newly supplied URL should contribute its inferred brand data. */
    registrationScope?: UrlRegistrationScope;
  };
  steps: CampaignJobStep[];
  kit: CampaignBrandKit | null;
  meta: CampaignJobMeta | null;
  error: string | null;
  /** CM voice/video assets (Phase 0b). Absent before the first voice run. */
  cm?: CampaignCmState | null;
  /** Stage-by-stage artifacts while running — the UI fills the result layout
   *  progressively from these. Cleared when the final kit lands. */
  partial?: CampaignPartial | null;
  /** Links into the canonical organization/business/logo catalog. Absent on
   * jobs created before the brand hierarchy migration. */
  catalog?: CampaignCatalogLink | null;
  catalogError?: string | null;
}

export function saveCampaignCatalog(
  id: string,
  result: CampaignCatalogLink | { error: string }
): void {
  const job = getCampaignJob(id);
  if (!job) return;
  if ("error" in result) {
    job.catalogError = result.error;
  } else {
    job.catalog = result;
    job.catalogError = null;
  }
  writeJob(job);
}

const JOBS_DIR = path.join(process.cwd(), "var", "campaign-lab", "jobs");

function jobPath(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}
function writeJob(job: CampaignJob): void {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(jobPath(job.id), JSON.stringify(job));
}

const SAFE_ID = /^[a-f0-9-]{36}$/;

export function createCampaignJob(
  userId: string,
  input: CampaignJob["input"]
): CampaignJob {
  const now = new Date().toISOString();
  const job: CampaignJob = {
    id: randomUUID(),
    userId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    input,
    steps: [],
    kit: null,
    meta: null,
    error: null,
  };
  writeJob(job);
  return job;
}

export function appendCampaignStep(id: string, step: PipelineProgress): void {
  const job = getCampaignJob(id);
  if (!job) return;
  job.steps.push({ ...step, ts: new Date().toISOString() });
  writeJob(job);
}

// A detached generation run lives in the Node process, not the HTTP request.
// If that process is restarted (or an LLM call hangs past its timeout) while a
// run is in flight, the job is left "running" with no writer ever finishing
// it — the UI would poll forever. A run that hasn't written a step in this
// long is treated as dead and auto-failed on the next read.
const STALE_RUNNING_MS = 6 * 60 * 1000; // > the 2-min LLM timeout, with margin

/** Fail a job that's been "running" with no progress past the stale window.
 *  Returns the (possibly updated) job so callers can respond with fresh state. */
export function failStaleCampaignJob(job: CampaignJob): CampaignJob {
  if (job.status !== "running") return job;
  const age = Date.now() - new Date(job.updatedAt).getTime();
  if (age < STALE_RUNNING_MS) return job;
  job.status = "error";
  job.error =
    "生成が途中で停止しました（サーバー再起動、または応答タイムアウトの可能性）。もう一度作成してください。";
  writeJob(job);
  return job;
}

/** Merge stage artifacts into the running job (progressive UI). */
export function updateCampaignPartial(id: string, patch: CampaignPartial): void {
  const job = getCampaignJob(id);
  if (!job || job.status !== "running") return;
  job.partial = { ...job.partial, ...patch };
  writeJob(job);
}

/** Creative stage done, verify still running: publish the kit early so the
 *  digest fills while the self-verification loop finishes. Storing the kit
 *  stores the LP — readCampaignJobHtml derives it. */
export function saveCampaignJobDraft(
  id: string,
  result: { kit: CampaignBrandKit }
): void {
  const job = getCampaignJob(id);
  if (!job || job.status !== "running") return;
  job.kit = result.kit;
  writeJob(job);
}

export function completeCampaignJob(
  id: string,
  result: { kit: CampaignBrandKit; meta: CampaignJobMeta }
): void {
  const job = getCampaignJob(id);
  if (!job) return;
  job.status = "done";
  job.kit = result.kit;
  job.meta = result.meta;
  job.partial = null; // superseded by the kit
  writeJob(job);
}

export function failCampaignJob(id: string, error: string): void {
  const job = getCampaignJob(id);
  if (!job) return;
  job.status = "error";
  job.error = error;
  writeJob(job);
}

// ---------- CM voice/video assets (Phase 0b) ----------

function cmWavPath(id: string): string {
  return path.join(JOBS_DIR, `${id}.cm.wav`);
}
function cmMp4Path(id: string): string {
  return path.join(JOBS_DIR, `${id}.cm.mp4`);
}

export function startCampaignCm(id: string): void {
  const job = getCampaignJob(id);
  if (!job) return;
  job.cm = { status: "running", error: null, track: null, mp4: false };
  writeJob(job);
}

/** Voice stage finished: the Player can start while the MP4 still renders. */
export function saveCampaignCmVoice(
  id: string,
  result: { wav: Buffer; track: CmVoiceTrack }
): void {
  const job = getCampaignJob(id);
  if (!job) return;
  fs.writeFileSync(cmWavPath(id), result.wav);
  job.cm = { status: "running", error: null, track: result.track, mp4: false };
  writeJob(job);
}

/** Start an explicit MP4 export without replacing the playable voice track. */
export function startCampaignCmRender(id: string): void {
  const job = getCampaignJob(id);
  if (!job?.cm?.track) return;
  job.cm = {
    status: "running",
    error: null,
    track: job.cm.track,
    mp4: false,
  };
  writeJob(job);
}

export function finishCampaignCm(id: string, result: { mp4: boolean }): void {
  const job = getCampaignJob(id);
  if (!job) return;
  job.cm = {
    status: "done",
    error: null,
    track: job.cm?.track ?? null,
    mp4: result.mp4,
  };
  writeJob(job);
}

export function failCampaignCm(id: string, error: string): void {
  const job = getCampaignJob(id);
  if (!job) return;
  job.cm = {
    status: "error",
    error,
    track: job.cm?.track ?? null,
    mp4: job.cm?.mp4 ?? false,
  };
  writeJob(job);
}

export function readCampaignCmWav(id: string): Buffer | null {
  if (!SAFE_ID.test(id)) return null;
  try {
    return fs.readFileSync(cmWavPath(id));
  } catch {
    return null;
  }
}

export function readCampaignCmMp4(id: string): Buffer | null {
  if (!SAFE_ID.test(id)) return null;
  try {
    return fs.readFileSync(cmMp4Path(id));
  } catch {
    return null;
  }
}

export function campaignCmMp4Exists(id: string): boolean {
  return SAFE_ID.test(id) && fs.existsSync(cmMp4Path(id));
}

export function getCampaignJob(id: string): CampaignJob | null {
  if (!SAFE_ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(jobPath(id), "utf8")) as CampaignJob;
  } catch {
    return null;
  }
}

/**
 * The LP of a job, derived from its kit on every read.
 *
 * The kit is the single source of truth; the HTML is a pure function of it
 * (`renderLandingPage`). Freezing that output to disk at generation time is
 * what let one job's page drift: every renderer fix reached only pages
 * generated afterwards, so an LP served today could still carry markup the
 * codebase had already removed — and the management preview and /c/[id],
 * reading that same frozen file, could render it two different ways.
 *
 * Deriving here costs a string template per request and can never go stale.
 */
export function readCampaignJobHtml(id: string): string | null {
  if (!SAFE_ID.test(id)) return null;
  const job = getCampaignJob(id);
  if (!job?.kit) return null;
  return renderLandingPage(job.kit);
}

/** Most recent job for a user (reload/reconnect recovery). */
export function latestCampaignJobForUser(userId: string): CampaignJob | null {
  const jobs = listCampaignJobsForUser(userId);
  return jobs[0] ?? null;
}

/** All jobs of a user, newest first — the card list on /campaigns. */
export function listCampaignJobsForUser(userId: string): CampaignJob[] {
  const jobs: CampaignJob[] = [];
  try {
    for (const f of fs.readdirSync(JOBS_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const job = JSON.parse(
          fs.readFileSync(path.join(JOBS_DIR, f), "utf8")
        ) as CampaignJob;
        if (job.userId === userId) jobs.push(job);
      } catch {
        // skip unreadable records
      }
    }
  } catch {
    return []; // dir doesn't exist yet
  }
  return jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
