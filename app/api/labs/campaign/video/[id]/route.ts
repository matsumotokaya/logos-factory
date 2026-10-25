// GET: the rendered CM MP4 of a campaign job, via a short-lived HMAC
// signature (same model as the audio/LP routes — <video> elements can't send
// an Authorization header). Supports single-range requests so browsers can
// seek. The sample campaign's MP4 is a static file under public/campaigns/.

import { guardBrandRequest } from "@/lib/brand-access";
import { labsDisabledResponse, labsEnabled } from "@/lib/labs-access";
import { verifyLabsSignature } from "@/lib/labs-output-sign";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { renderProductCmJob } from "@/lib/takes/product-cm";
import {
  appendCampaignStep,
  failCampaignCm,
  finishCampaignCm,
  getCampaignJob,
  readCampaignCmMp4,
  readCampaignCmWav,
  startCampaignCmRender,
} from "@/lib/campaign/jobs";

export const maxDuration = 300;

// POST: explicitly export an existing browser-preview track as MP4. Keeping
// this separate from TTS prevents a background completion from replacing the
// Player's inputs while the owner is watching it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await params;
  const job = getCampaignJob(id);

  if (!job || job.userId !== user.id)
    return Response.json({ error: "キャンペーンが見つかりません" }, { status: 404 });
  if (!job.cm?.track)
    return Response.json(
      { error: "先に製品紹介動画を生成してください" },
      { status: 409 }
    );
  if (job.cm.status === "running")
    return Response.json({ jobId: id }, { status: 202 });
  const wav = readCampaignCmWav(id);
  if (!wav) {
    return Response.json({ error: "ナレーション音声が見つかりません" }, { status: 409 });
  }

  startCampaignCmRender(id);
  appendCampaignStep(id, { message: "MP4ファイルを作成中…", level: "info" });

  void renderProductCmJob(createServerSupabaseForToken(user.token), {
    userId: user.id,
    job,
    wav,
    track: job.cm.track,
  })
    .then(() => {
      finishCampaignCm(id, { mp4: true });
      appendCampaignStep(id, { message: "MP4ファイルが完成しました", level: "success" });
    })
    .catch((e) => {
      console.error("Campaign MP4 render failed:", e);
      const message = e instanceof Error ? e.message : "MP4ファイルを作成できませんでした";
      failCampaignCm(id, message);
      appendCampaignStep(id, { message: "MP4ファイルを作成できませんでした", level: "warn" });
    });

  return Response.json({ jobId: id }, { status: 202 });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!labsEnabled()) return labsDisabledResponse();

  const url = new URL(req.url);
  if (
    !verifyLabsSignature(
      `campaign-video:${id}`,
      url.searchParams.get("exp"),
      url.searchParams.get("sig")
    )
  ) {
    return labsDisabledResponse();
  }

  const mp4 = readCampaignCmMp4(id);
  if (!mp4)
    return Response.json({ error: "動画が見つかりません" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const range = req.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    const start = match[1] ? parseInt(match[1], 10) : mp4.length - parseInt(match[2], 10);
    const end = match[1] && match[2] ? parseInt(match[2], 10) : mp4.length - 1;
    if (start >= 0 && start <= end && end < mp4.length) {
      return new Response(new Uint8Array(mp4.subarray(start, end + 1)), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${mp4.length}`,
        },
      });
    }
  }

  return new Response(new Uint8Array(mp4), { headers });
}
