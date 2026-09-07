import { guardLabsRequest } from "@/lib/labs-access";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import { videoPipeline } from "@/lib/pipeline/video";
import { bakeChanges } from "@/lib/event-cm/bake";
import { VIDEO_TEMPLATES } from "@/lib/video/templates";
import type { EventCmBrief } from "@/remotion/event-cm/types";

/**
 * The video pipeline for one V2 Take. Mirrors the brand-asset pipeline: the
 * stage state is derived from rows that already exist (`takes`,
 * `take_renders`, `render_artifacts`), so it cannot drift.
 *
 * Read-only: this route never writes. Adding material or swapping a template
 * happens on its own screen and shows up next time the user opens this bar.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const takeResult = await supabase
    .from("takes")
    .select("id, brand_id, template_id, title, brief, baked_brief, baked_at, updated_at")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (takeResult.error) {
    return Response.json(
      { error: "動画を取得できませんでした" },
      { status: 500 },
    );
  }
  if (!takeResult.data) {
    return Response.json({ error: "動画が見つかりません" }, { status: 404 });
  }

  const take = takeResult.data;

  const renderResult = await supabase
    .from("take_renders")
    .select("id, status, latest_artifact_id, updated_at")
    .eq("take_id", take.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (renderResult.error) {
    return Response.json(
      { error: "Renderを取得できませんでした" },
      { status: 500 },
    );
  }

  const render = renderResult.data;
  const artifactResult = render?.latest_artifact_id
    ? await supabase
        .from("render_artifacts")
        .select("id, created_at")
        .eq("id", render.latest_artifact_id)
        .maybeSingle()
    : { data: null, error: null };
  if (artifactResult.error) {
    return Response.json(
      { error: "成果物を取得できませんでした" },
      { status: 500 },
    );
  }

  const renderStatus =
    !render
      ? "empty"
      : render.status === "running"
        ? "running"
        : render.status === "ready"
          ? "ready"
          : render.status === "failed"
            ? "failed"
            : "empty";

  // The input stage is about what the user supplied, so it is read from the
  // pins, not from the brief. A seeded take has a brief and no sources.
  const [sourcesResult, runsResult, lastExtract] = await Promise.all([
    supabase
      .from("take_inputs")
      .select("material_id, pinned_at")
      .eq("take_id", take.id)
      .eq("role", "brief_source")
      .order("pinned_at", { ascending: false }),
    supabase
      .from("take_runs")
      .select("stage, finished_at")
      .eq("take_id", take.id)
      .eq("status", "succeeded")
      .in("stage", ["extract", "structure", "map"])
      .order("finished_at", { ascending: false }),
    // What the last reading read, by id. Compared with the pins as SETS, so a
    // document taken out changes the stage the way one put in does.
    supabase
      .from("take_runs")
      .select("steps")
      .eq("take_id", take.id)
      .eq("stage", "extract")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const sources = sourcesResult.data ?? [];
  const readSteps = (lastExtract.data?.steps as Array<{ materialId?: unknown }> | null) ?? null;
  const readIds = readSteps
    ? readSteps
        .map((step) => step.materialId)
        .filter((id): id is string => typeof id === "string")
    : null;
  const runs: Partial<Record<"extract" | "structure" | "map", string | null>> = {};
  for (const run of runsResult.data ?? []) {
    const stage = run.stage as "extract" | "structure" | "map";
    if (!runs[stage]) runs[stage] = run.finished_at as string | null;
  }

  const pipeline = videoPipeline({
    template: (take.template_id as string) ?? "",
    hasBrief: take.brief != null && typeof take.brief === "object",
    sourceCount: sources.length,
    sourcePinnedAt: (sources[0]?.pinned_at as string | null) ?? null,
    sourceIds: sources.map((source) => source.material_id as string),
    readIds,
    runs,
    briefUpdatedAt: (take.updated_at as string | null) ?? null,
    brief: (take.brief as Record<string, unknown> | null) ?? null,
    renderStatus,
    renderUpdatedAt: (render?.updated_at as string | null) ?? null,
    artifactCreatedAt:
      (artifactResult.data?.created_at as string | null) ?? null,
    // A template that collects edits in a workbench ends the chain at the film
    // instead of at the MP4 (`bakesBrief`, lib/templates/catalog.ts). Counted
    // through the same function the badge and the player's notice read, on the
    // same stored briefs, so the three cannot disagree (§3.3).
    bake: VIDEO_TEMPLATES[take.template_id as string]?.bakesBrief
      ? {
          at: (take.baked_at as string | null) ?? null,
          changes: bakeChanges(
            take.brief as EventCmBrief,
            (take.baked_brief as EventCmBrief | null) ?? null,
          ).length,
        }
      : null,
  });

  return Response.json(
    {
      pipeline: {
        stages: pipeline.stages,
        goal: pipeline.goal,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}