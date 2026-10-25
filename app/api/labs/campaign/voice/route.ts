// POST: generate the CM voice track (TTS + timing) for a finished campaign
// job, as a detached run — same reload-safe pattern as /generate. Progress
// lines land in the job's step log; the result (scene/caption timings) is
// stored on the job, the WAV next to it. The Player composes the preview in
// the browser, and the MP4 export follows in the same run so that every
// surface outside this app has a video to show.
//
// Explicit user action by design (TTS costs money), mirroring scene 10's
// manual mockup generation.

import { NextResponse } from "next/server";
import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { generateCmVoice, cmVoiceAvailable } from "@/lib/campaign/voice";
import {
  getCampaignJob,
  appendCampaignStep,
  startCampaignCm,
  saveCampaignCmVoice,
  finishCampaignCm,
  failCampaignCm,
} from "@/lib/campaign/jobs";
import { renderProductCmJob } from "@/lib/takes/product-cm";

export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);

  if (!cmVoiceAvailable()) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not set. Add it to .env.local (or set CAMPAIGN_TTS_MOCK=1) and restart.",
      },
      { status: 500 }
    );
  }

  let jobId: string;
  try {
    const body = (await req.json()) as { jobId?: string };
    if (typeof body.jobId !== "string" || body.jobId.length === 0)
      throw new Error("jobId を指定してください");
    jobId = body.jobId;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "リクエストが不正です" },
      { status: 400 }
    );
  }

  const job = getCampaignJob(jobId);
  if (!job || job.userId !== user.id)
    return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 });
  if (job.status !== "done" || !job.kit)
    return NextResponse.json(
      { error: "キャンペーンの生成が完了してから実行してください" },
      { status: 409 }
    );
  if (!job.kit.cm_script?.length)
    return NextResponse.json(
      {
        error:
          "このキャンペーンには構造化CMスクリプトがありません（旧形式）。キャンペーンを再生成してください。",
      },
      { status: 409 }
    );
  if (job.cm?.status === "running")
    return NextResponse.json({ jobId }, { status: 202 }); // already in flight

  const kit = job.kit;
  startCampaignCm(jobId);
  appendCampaignStep(jobId, { message: "製品紹介動画の生成を開始しました", level: "info" });

  // Detached voice generation, then the MP4 without a second button press.
  // The Player preview and the MP4 are two representations of one video: the
  // Player runs only where React runs (this app), so every other surface — the
  // LP embed, downloads — needs the file. Splitting them behind separate
  // actions is what let the management screen call a CM "done" while its LP
  // still offered to generate one.
  void generateCmVoice(kit, (message, level) =>
    appendCampaignStep(jobId, { message, level: level ?? "info" })
  )
    .then(async (result) => {
      // Leaves cm.track in place, so the Player is watchable from here on and
      // the render below never disturbs someone already watching it.
      saveCampaignCmVoice(jobId, result);
      appendCampaignStep(jobId, {
        message: "製品紹介動画のプレビューが完成しました",
        level: "success",
      });

      appendCampaignStep(jobId, { message: "MP4ファイルを作成中…", level: "info" });
      try {
        await renderProductCmJob(createServerSupabaseForToken(user.token), {
          userId: user.id,
          job,
          wav: result.wav,
          track: result.track,
        });
        finishCampaignCm(jobId, { mp4: true });
        appendCampaignStep(jobId, {
          message: "MP4ファイルが完成しました",
          level: "success",
        });
      } catch (e) {
        // A host without headless Chrome (Vercel serverless) cannot export.
        // That is not a failed CM — the preview stands on its own, so the job
        // completes and only the MP4-dependent surfaces keep waiting.
        console.error("Campaign MP4 render failed:", e);
        finishCampaignCm(jobId, { mp4: false });
        appendCampaignStep(jobId, {
          message: "MP4ファイルは作成できませんでした（プレビューはご覧いただけます）",
          level: "warn",
        });
      }
    })
    .catch((e) => {
      console.error("Campaign voice failed:", e);
      const message = e instanceof Error ? e.message : "音声生成に失敗しました";
      appendCampaignStep(jobId, { message, level: "warn" });
      failCampaignCm(jobId, message);
    });

  return NextResponse.json({ jobId }, { status: 202 });
}
