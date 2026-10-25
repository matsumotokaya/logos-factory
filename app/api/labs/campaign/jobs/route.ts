// GET: poll a campaign job (?id=...) or fetch the caller's latest job.
//
// This is how the UI re-attaches to a run after reload / connection loss:
// the whole progress log, the Brand Kit and the rendered LP live in the job
// store, not in the original request. Done jobs include the LP html (for the
// inline hero digest) and a signed URL for opening the real page in a new tab.

import { guardBrandRequest } from "@/lib/brand-access";
import { requireUser } from "@/lib/supabase/server";
import { signedLabsUrl } from "@/lib/labs-output-sign";
import {
  getCampaignJob,
  latestCampaignJobForUser,
  listCampaignJobsForUser,
  readCampaignJobHtml,
  failStaleCampaignJob,
  type CampaignJob,
} from "@/lib/campaign/jobs";

function jobResponse(rawJob: CampaignJob) {
  // Auto-fail a run whose process died mid-generation so the UI stops polling.
  const job = failStaleCampaignJob(rawJob);
  const done = job.status === "done";
  return Response.json(
    {
      job,
      // The kit (and its LP html) can appear while still running — the draft
      // published after the creative stage, before verification settles.
      html: job.kit ? readCampaignJobHtml(job.id) : null,
      lpUrl: done
        ? (job.catalog?.publishedLpPath ??
          signedLabsUrl(`/c/${job.id}`, `campaign-lp:${job.id}`))
        : null,
      audioUrl: job.cm?.track
        ? signedLabsUrl(
            `/api/labs/campaign/audio/${job.id}`,
            `campaign-audio:${job.id}`,
          )
        : null,
      videoUrl: job.cm?.mp4
        ? signedLabsUrl(
            `/api/labs/campaign/video/${job.id}`,
            `campaign-video:${job.id}`,
          )
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);

  const search = new URL(req.url).searchParams;

  // ?list=1 — card summaries for /campaigns (no step logs / HTML payloads).
  if (search.get("list")) {
    const jobs = listCampaignJobsForUser(user.id).map((job) => ({
      id: job.id,
      createdAt: job.createdAt,
      status: job.status,
      name: job.kit?.service.name ?? job.input.name ?? job.input.url ?? "無題",
      tagline: job.kit?.service.tagline ?? null,
      primary: job.kit?.brand.primary ?? null,
      accent: job.kit?.brand.accent ?? null,
      organizationName:
        job.input.registrationScope === "organization"
          ? (job.kit?.service.name ?? null)
          : (job.kit?.organization?.name ?? null),
      businessName: job.kit?.service.name ?? job.input.name ?? null,
      organizationId: job.catalog?.organizationId ?? null,
      businessId: job.catalog?.businessId ?? job.input.brandEntityId ?? null,
      registrationScope: job.input.registrationScope ?? "business",
      catalogError: job.catalogError ?? null,
    }));
    return Response.json(
      { jobs },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ?brandId= — the latest run that fills this Brand, for the brand page's
  // status line. A run made the Brand when it started (brandEntityId), or —
  // for runs from before that — registered it when it ended (catalog).
  const brandId = search.get("brandId");
  if (brandId) {
    const latestForBrand = listCampaignJobsForUser(user.id).find(
      (job) =>
        job.input.brandEntityId === brandId || job.catalog?.brandId === brandId,
    );
    if (!latestForBrand)
      return Response.json(
        { job: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    return jobResponse(latestForBrand);
  }

  const id = search.get("id");
  if (id) {
    const job = getCampaignJob(id);
    if (!job || job.userId !== user.id)
      return Response.json(
        { error: "ジョブが見つかりません" },
        { status: 404 },
      );
    return jobResponse(job);
  }

  const latest = latestCampaignJobForUser(user.id);
  if (!latest)
    return Response.json(
      { job: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  return jobResponse(latest);
}
