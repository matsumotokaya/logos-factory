// Every stage run this video has had.
//
// The overlay card is transient — a success takes itself off screen after ten
// seconds. This is where the same information keeps living, so "what did I do
// to this video, and what did it change" has an answer tomorrow.

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

export interface TakeRunRecord {
  id: string;
  stage: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** What the run was given. Recorded because "what did it read" is half of
   *  "why did it produce that". */
  input: unknown;
  /** What the run produced, as the run itself recorded it. */
  steps: unknown;
  usage: unknown;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const { data: take, error: takeError } = await supabase
    .from("takes")
    .select("id")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (takeError) {
    return Response.json({ error: "動画を確認できませんでした" }, { status: 500 });
  }
  if (!take) return Response.json({ error: "動画が見つかりません" }, { status: 404 });

  const { data, error } = await supabase
    .from("take_runs")
    .select("id, stage, status, started_at, finished_at, error_message, input, steps, usage")
    .eq("take_id", take.id)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) {
    return Response.json({ error: "実行ログを取得できませんでした" }, { status: 500 });
  }

  const runs: TakeRunRecord[] = (data ?? []).map((row) => ({
    id: row.id as string,
    stage: row.stage as string,
    status: row.status as string,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    error: (row.error_message as string | null) ?? null,
    input: row.input,
    steps: row.steps,
    usage: row.usage,
  }));

  return Response.json({ runs }, { headers: { "Cache-Control": "no-store" } });
}
