// POST: kick off one Campaign Lab generation as a detached server-side job.
//
// NotebookLM-style intake: any mix of { url, pasted text, uploaded PDFs /
// images } funnels into the same creative stage (Claude structured outputs),
// which emits a Service Brand Kit. The pipeline runs detached from this
// request and persists every progress event to the job store, so the client
// can close the tab / lose the connection and re-attach later by polling
// GET /api/labs/campaign/jobs — nothing is lost on reload.
//
// Note: the detached run assumes a long-lived Node process (local dev / a
// real server). On serverless the process may be frozen after the response —
// Labs is local-first, and Phase 1 moves this to a real queue.

import { NextResponse } from "next/server";
import { guardBrandRequest } from "@/lib/brand-access";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import type { SourceFile } from "@/lib/campaign/creative";
import { runCampaignPipeline } from "@/lib/campaign/pipeline";
import { persistCampaignCatalog } from "@/lib/campaign/catalog";
import { createCampaignLpTake } from "@/lib/takes/campaign-lp";
import {
  createCampaignJob,
  appendCampaignStep,
  updateCampaignPartial,
  saveCampaignJobDraft,
  completeCampaignJob,
  failCampaignJob,
  getCampaignJob,
  saveCampaignCatalog,
} from "@/lib/campaign/jobs";

export const maxDuration = 300;

const MAX_FILES = 5;
const MAX_FILE_BASE64_LENGTH = 6_000_000; // ~4.5MB binary per file
const MAX_TEXT_LENGTH = 20_000;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type GenerateBody = {
  url?: string;
  name?: string;
  description?: string;
  pastedText?: string;
  files?: { kind?: string; mediaType?: string; data?: string }[];
  brandEntityId?: string;
  organizationId?: string;
  newWorkspace?: boolean;
};

function parseFiles(raw: GenerateBody["files"]): SourceFile[] {
  if (!raw) return [];
  if (raw.length > MAX_FILES)
    throw new Error(`ファイルは${MAX_FILES}個までです`);
  return raw.map((f) => {
    if (typeof f.data !== "string" || f.data.length === 0)
      throw new Error("ファイルデータが空です");
    if (f.data.length > MAX_FILE_BASE64_LENGTH)
      throw new Error("ファイルが大きすぎます（1ファイル4.5MB上限）");
    if (f.kind === "pdf") return { kind: "pdf", data: f.data };
    if (f.kind === "image" && f.mediaType && IMAGE_TYPES.has(f.mediaType)) {
      return {
        kind: "image",
        mediaType: f.mediaType as
          | "image/png"
          | "image/jpeg"
          | "image/webp"
          | "image/gif",
        data: f.data,
      };
    }
    throw new Error(
      "対応していないファイル形式です（PDF / PNG / JPEG / WebP / GIF）",
    );
  });
}

function parseUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let candidate = raw.trim();
  if (!/^https?:\/\//.test(candidate)) candidate = `https://${candidate}`;
  const u = new URL(candidate); // throws on invalid
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new Error("http/https のURLを指定してください");
  return u.href;
}

export async function POST(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env.local and restart." },
      { status: 500 },
    );
  }

  let url: string | null;
  let files: SourceFile[];
  let body: GenerateBody;
  let brandEntityId: string | null = null;
  let organizationId: string | null = null;
  let newWorkspace = false;
  try {
    body = (await req.json()) as GenerateBody;
    url = parseUrl(body.url);
    files = parseFiles(body.files);
    if (typeof body.brandEntityId === "string" && body.brandEntityId.trim()) {
      const candidateId = body.brandEntityId.trim();
      const supabase = createServerSupabaseForToken(user.token);
      const { data: entity, error: entityError } = await supabase
        .from("brand_entities")
        .select("id")
        .eq("id", candidateId)
        .not("brand_kind", "is", null)
        .maybeSingle();
      if (entityError || !entity)
        throw new Error("選択した事業を利用できません");
      brandEntityId = entity.id as string;
    }
    // Which workspace a new Brand goes in is the user's choice, made on the
    // entry form — never inferred. A selected Brand already has one.
    if (!brandEntityId) {
      const supabase = createServerSupabaseForToken(user.token);
      if (body.newWorkspace === true) {
        newWorkspace = true;
      } else if (
        typeof body.organizationId === "string" &&
        body.organizationId.trim()
      ) {
        // Checked against membership rather than trusted: the form only
        // offers the caller's own workspaces, so a miss is not a stale
        // preference to paper over.
        const { data: membership, error: membershipError } = await supabase
          .from("org_members")
          .select("org_id")
          .eq("org_id", body.organizationId.trim())
          .eq("user_id", user.id)
          .maybeSingle();
        if (membershipError || !membership)
          throw new Error("選択したワークスペースを利用できません");
        organizationId = membership.org_id as string;
      } else {
        // Nothing chosen. With no workspace there is nothing to choose, and
        // with exactly one there is one answer; with more, ask.
        const { data: memberships, error: membershipError } = await supabase
          .from("org_members")
          .select("org_id")
          .eq("user_id", user.id);
        if (membershipError)
          throw new Error("ワークスペースを確認できませんでした");
        if (!memberships || memberships.length === 0) newWorkspace = true;
        else if (memberships.length === 1)
          organizationId = memberships[0].org_id as string;
        else throw new Error("ブランドを入れるワークスペースを選んでください");
      }
    }
    if (
      typeof body.pastedText === "string" &&
      body.pastedText.length > MAX_TEXT_LENGTH
    )
      throw new Error("貼り付けテキストが長すぎます（2万字上限）");
    if (
      !url &&
      files.length === 0 &&
      !body.pastedText?.trim() &&
      !body.name?.trim()
    )
      throw new Error(
        "URL・ファイル・テキストのいずれかのソースを追加してください",
      );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "リクエストが不正です" },
      { status: 400 },
    );
  }

  const job = createCampaignJob(user.id, {
    url,
    name: body.name?.trim() || null,
    files: files.length,
    fileKinds: files.map((file) => file.kind),
    hasText: Boolean(body.pastedText?.trim()),
    brandEntityId,
    organizationId,
    newWorkspace,
  });

  // Detached run: progress and result live in the job store, not in this
  // response. The client re-attaches via polling — reload-safe by design.
  void runCampaignPipeline(
    {
      url,
      userName: body.name?.trim() || undefined,
      userDescription: body.description?.trim() || undefined,
      pastedText: body.pastedText?.trim() || undefined,
      files,
    },
    {
      onProgress: (event) => appendCampaignStep(job.id, event),
      onPartial: (patch) => updateCampaignPartial(job.id, patch),
      onDraft: (kit) => saveCampaignJobDraft(job.id, { kit }),
    },
  )
    .then(async (result) => {
      completeCampaignJob(job.id, {
        kit: result.kit,
        meta: {
          captured: result.meta.captured,
          adjudicated: result.meta.adjudicated,
          verification: result.meta.verification,
          usage: result.meta.usage,
        },
      });

      const completedJob = getCampaignJob(job.id);
      if (!completedJob) return;
      try {
        const catalog = await persistCampaignCatalog({
          accessToken: user.token,
          userId: user.id,
          job: completedJob,
          kit: result.kit,
          // What the rendered page actually said. Without it the brand can
          // only record what the model proposed, and the two are stored
          // differently (lib/brand/site-knowledge.ts).
          capture: result.debug.capture,
        });
        saveCampaignCatalog(job.id, catalog);
        const v2 = await createCampaignLpTake(
          createServerSupabaseForToken(user.token),
          {
            userId: user.id,
            brandId: catalog.brandId,
            job: completedJob,
            kit: result.kit,
          },
        );
        saveCampaignCatalog(job.id, {
          ...catalog,
          publishedLpTakeId: v2.takeId,
          publishedLpPath: v2.urlPath,
        });
        appendCampaignStep(job.id, {
          message: `catalog: 「${result.kit.service.name}」をブランドとして登録、LPを作成: ${v2.urlPath}（公開はしていません）`,
          level: "success",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "ブランド台帳への登録に失敗しました";
        console.error("Campaign catalog persistence failed:", error);
        saveCampaignCatalog(job.id, { error: message });
        appendCampaignStep(job.id, {
          message:
            "catalog: キャンペーンは完成しましたが、ブランド台帳への登録は保留されています",
          level: "warn",
        });
      }
    })
    .catch((e) => {
      console.error("Campaign generate failed:", e);
      failCampaignJob(
        job.id,
        e instanceof Error ? e.message : "生成に失敗しました",
      );
    });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
