import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// A run on the brand itself (brand_runs, migration 0059): reading its site on
// creation or on demand. The runner keeps the log in memory and writes the
// whole array on each step — there is one writer per run, so there is
// nothing to merge — and the brand page polls the row.

export type BrandRunStep = {
  ts: string;
  message: string;
  level: "info" | "success" | "warn";
};

export type BrandRunResult = {
  url: string;
  adopted: number;
  claims: number;
  files: number;
  note: string | null;
};

export type BrandRun = {
  id: string;
  brandId: string;
  kind: "import";
  status: "running" | "done" | "error";
  steps: BrandRunStep[];
  result: BrandRunResult | null;
  error: string | null;
  createdAt: string;
};

/** A run silent this long has lost its process (restart, timeout). */
const STALE_RUNNING_MS = 5 * 60 * 1000;

type Row = {
  id: string;
  brand_id: string;
  kind: "import";
  status: BrandRun["status"];
  steps: BrandRunStep[];
  result: BrandRunResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, brand_id, kind, status, steps, result, error, created_at, updated_at";

function fromRow(row: Row): BrandRun {
  const stale =
    row.status === "running" &&
    Date.now() - new Date(row.updated_at).getTime() > STALE_RUNNING_MS;
  return {
    id: row.id,
    brandId: row.brand_id,
    kind: row.kind,
    status: stale ? "error" : row.status,
    steps: row.steps,
    result: row.result,
    error: stale ? "途中で停止しました（サーバー再起動の可能性）。もう一度実行してください。" : row.error,
    createdAt: row.created_at,
  };
}

/** The writer a detached run holds. Failing to write the log never fails the run. */
export type BrandRunLog = {
  id: string;
  step: (message: string, level?: BrandRunStep["level"]) => Promise<void>;
  finish: (result: BrandRunResult) => Promise<void>;
  fail: (error: string) => Promise<void>;
};

export async function startBrandRun(
  supabase: SupabaseClient,
  input: { brandId: string; userId: string },
): Promise<BrandRunLog> {
  const inserted = await supabase
    .from("brand_runs")
    .insert({ brand_id: input.brandId, kind: "import", created_by: input.userId })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message ?? "実行を記録できませんでした");
  }
  const id = inserted.data.id as string;
  const steps: BrandRunStep[] = [];

  const write = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("brand_runs")
      .update({ ...patch, steps, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("brand_runs write failed:", error.message);
  };

  return {
    id,
    step: async (message, level = "info") => {
      steps.push({ ts: new Date().toISOString(), message, level });
      await write({});
    },
    finish: async (result) => {
      await write({ status: "done", result });
    },
    fail: async (error) => {
      steps.push({ ts: new Date().toISOString(), message: error, level: "warn" });
      await write({ status: "error", error });
    },
  };
}

export async function getBrandRun(
  supabase: SupabaseClient,
  brandId: string,
  runId: string,
): Promise<BrandRun | null> {
  const { data, error } = await supabase
    .from("brand_runs")
    .select(COLUMNS)
    .eq("id", runId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as Row) : null;
}

export async function latestBrandRun(
  supabase: SupabaseClient,
  brandId: string,
): Promise<BrandRun | null> {
  const { data, error } = await supabase
    .from("brand_runs")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as Row) : null;
}
