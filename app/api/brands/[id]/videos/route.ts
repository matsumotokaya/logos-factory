// Videos of one brand — the portal's list and its "add a video" action.
//
// Every listed video is a V2 Take. POST chooses the immutable template and
// creates that Take; there are no synthetic rows or legacy asset fallbacks.

import type { SupabaseClient } from "@supabase/supabase-js";
import { guardLabsRequest } from "@/lib/labs-access";
import { campaignCmMp4Exists, getCampaignJob } from "@/lib/campaign/jobs";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import {
  isVideoTemplateId,
  type VideoTemplateId,
  videoFamilyIndex,
  VIDEO_TEMPLATES,
} from "@/lib/video/templates";
import { artDirectionIds, currentTemplate } from "@/lib/templates/catalog";
import { videoState, type VideoState, type VideoSummary } from "@/lib/video/asset";
import { emptyEventBrief } from "@/remotion/event/briefs";
import { createTake } from "@/lib/takes/create";
import { seedEventCmFromBrand } from "@/lib/event-cm/seed-from-brand";
import {
  COPY_COLUMNS,
  copyMaterials,
  type CopiedMaterial,
  type CopySource,
} from "@/lib/materials/copy";
import { materialUri, replaceMaterialUris } from "@/lib/takes/material-uri";
import { UNTITLED_VIDEO } from "@/lib/event-cm/title";
import { draftEventCmNarration, eventCmNarrationAvailable } from "@/lib/event-cm/narration";

type TakeVideoRow = {
  id: string;
  brand_id: string;
  template_id: string;
  title: string;
  brief: unknown;
  created_at: string;
  take_renders: Array<{
    status: string;
    latest_artifact_id: string | null;
    publications: Array<{ status: string }> | null;
  }> | null;
};

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** What the local generation job says. Everything else is `videoState`. */
function campaignVideoState(jobId: string | null): VideoState {
  if (!jobId) return "empty";
  if (campaignCmMp4Exists(jobId)) return "mp4_ready";
  return getCampaignJob(jobId)?.cm?.track ? "preview_ready" : "empty";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const { data: brand, error: brandError } = await supabase
    .from("brand_entities")
    .select("id, name")
    .eq("id", brandId)
    .maybeSingle();
  if (brandError) return Response.json({ error: "ブランドを確認できませんでした" }, { status: 500 });
  if (!brand) return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });

  const takeResult = await supabase
    .from("takes")
    .select(
      "id, brand_id, template_id, title, brief, created_at, take_renders(status, latest_artifact_id, publications(status))",
    )
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .order("created_at", { ascending: true });
  if (takeResult.error) {
    return Response.json({ error: "アセットを取得できませんでした" }, { status: 500 });
  }

  const videos: VideoSummary[] = [];
  const v2Videos = (takeResult.data ?? []) as unknown as TakeVideoRow[];
  for (const take of v2Videos) {
    if (!isVideoTemplateId(take.template_id)) continue;
    const brief = take.brief as Record<string, unknown> | null;
    const renderReady = (take.take_renders ?? []).some(
      (render) => render.status === "ready" && render.latest_artifact_id,
    );
    const published = (take.take_renders ?? []).some((render) =>
      (render.publications ?? []).some((publication) => publication.status === "live"),
    );
    // Its OWN job, never a sibling's. This used to fall back to the newest
    // campaign-lp take of the brand, which meant a video's state could be
    // decided by an LP nobody had connected it to (docs/template-contract.md
    // §2.1). A deliverable reads its own brief and no other.
    const jobId = typeof brief?.campaignJobId === "string" ? brief.campaignJobId : null;
    videos.push({
      id: take.id,
      brandId: take.brand_id,
      template: take.template_id,
      // The painting, for the list's style badge. Only event-cm briefs carry
      // one; everything else is labelled by its template.
      artDirection: typeof brief?.artDirection === "string" ? brief.artDirection : null,
      title: take.title,
      published,
      // The same derivation the detail screen uses (lib/video/asset.ts). The
      // job store is only consulted for a take whose template says its brief
      // is not enough to play on its own.
      state: videoState({
        template: take.template_id,
        hasRender: renderReady,
        hasBrief: Boolean(take.brief),
        hasVoice: brief?.voice != null && typeof brief.voice === "object",
        ...(jobId ? { campaign: () => campaignVideoState(jobId) } : {}),
      }),
      createdAt: take.created_at,
      isPlaceholder: false,
    });
  }

  // Grouped by template family in catalog order, newest first inside a family.
  // The order lives here rather than in the portal so anything else reading this
  // endpoint gets the same page the portal shows.
  videos.sort((left, right) => {
    const byFamily = videoFamilyIndex(left.template) - videoFamilyIndex(right.template);
    if (byFamily !== 0) return byFamily;
    return right.createdAt.localeCompare(left.createdAt);
  });

  return Response.json({ brand: { id: brand.id, name: brand.name }, videos });
}

/**
 * One line of the creation log.
 *
 * Creating an event video is three to four steps and most of a minute, and it
 * used to go out as one opaque request: a thin bar reading 「動画を作成して
 * います…」 for forty seconds, which is indistinguishable from a page that has
 * frozen. What was missing was not a percentage — an LLM call cannot honestly
 * report one (BusyBar says so) — but the ACCOUNT: which of the steps is running
 * now, and how many are left.
 *
 * So the response streams. Each line is a real event emitted where the work
 * actually happens, never a timer advancing a fake list.
 */
type CreateEvent =
  | { type: "step"; label: string; index: number; total: number }
  | { type: "done"; id: string; createdAt: string }
  | { type: "error"; message: string };

/** Thrown to end creation with a message the client shows. Streaming has
 *  already begun by then, so the status code can no longer carry it. */
class CreateFailure extends Error {}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  let body: { template?: unknown; title?: unknown; artDirection?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "リクエストを解釈できませんでした" }, { status: 400 });
  }

  const template = typeof body.template === "string" ? body.template : "";
  if (!isVideoTemplateId(template)) {
    return Response.json({ error: "テンプレートが不正です" }, { status: 400 });
  }
  // A retired template still lists and renders its takes; it just stops
  // getting new ones. The dialog no longer offers it, and the API agrees.
  if (!VIDEO_TEMPLATES[template].addable) {
    return Response.json(
      { error: "このテンプレートは新規作成を受け付けていません" },
      { status: 400 },
    );
  }
  // The painting, when the template offers more than one. Validated against
  // the template's own list: an id it has not declared has no dressing and no
  // place in the dialog, so it is a bad request rather than a quiet fallback.
  const entry = currentTemplate(template);
  const artDirection =
    typeof body.artDirection === "string" && body.artDirection ? body.artDirection : undefined;
  if (artDirection && entry && !artDirectionIds(entry).includes(artDirection)) {
    return Response.json({ error: "アートディレクションが不正です" }, { status: 400 });
  }
  const requestedTitle = typeof body.title === "string" ? body.title.trim() : "";

  // Everything above answers with a status code, because nothing has been sent
  // yet: a bad template is a bad request and says so. Everything below is the
  // work, and it streams.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: CreateEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await createVideoTake({
          supabase,
          brandId,
          userId: user.id,
          template,
          artDirection,
          requestedTitle,
          send,
        });
        send({ type: "done", ...result });
      } catch (error) {
        // In-band, because the 200 went out with the first line. The client
        // reads the last event, not the status.
        send({
          type: "error",
          message:
            error instanceof CreateFailure
              ? error.message
              : error instanceof Error
                ? error.message
                : "動画を追加できませんでした",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 201,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Nothing may sit on this and hand it over complete: a buffered progress
      // log is the same forty seconds of silence it replaced.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * The work, reporting each step as it starts.
 *
 * Split out of the handler so the steps are readable in order and so the log
 * lines sit exactly where the work does — a list assembled anywhere else drifts
 * from what actually runs, and a progress log that lies is worse than none.
 */
async function createVideoTake({
  supabase,
  brandId,
  userId,
  template,
  artDirection,
  requestedTitle,
  send,
}: {
  supabase: SupabaseClient;
  brandId: string;
  userId: string;
  template: VideoTemplateId;
  artDirection: string | undefined;
  requestedTitle: string;
  send: (event: CreateEvent) => void;
}): Promise<{ id: string; createdAt: string }> {
  // How many lines this creation will have. Said up front so the log reads as
  // a list being worked through rather than as an unbounded stream.
  const total = template === "event-cm" ? 3 : 2;
  let at = 0;
  const step = (label: string) => send({ type: "step", label, index: ++at, total });

  let title = requestedTitle;
  let brief: unknown;
  let pinMaterial: { id: string; checksum: string } | null = null;

  if (template === "event-cm") {
    // Seeded, not empty. The take arrives as a finished film: the brand's own
    // palette and mark, an event archetype inferred from its industry, and a
    // plausible date — every guess labelled in the brief's provenance so the
    // screen can say which parts are proposals (§17.5).
    step("ブランドの色・マーク・素材を読んでいます");
    const seeded = await seedEventCmFromBrand(supabase, {
      brandId,
      userId,
      ...(artDirection ? { artDirection } : {}),
    });
    if (!seeded.ok) throw new CreateFailure(seeded.error);
    let seededBrief = seeded.seeded.brief;
    if (title.trim()) seededBrief = { ...seededBrief, title: title.trim() };

    // Narration comes with the film, like the music does. The golden path is
    // that nobody is asked for anything: add a video and it plays, with words
    // and a soundtrack. Writing it here rather than on first open means the
    // take is never briefly a silent film with no narration.
    //
    // A failure here does not fail the creation. The take is complete without
    // a narration — the timeline falls back to the scene budget — and the
    // narration can be written from the pipeline afterwards.
    if (eventCmNarrationAvailable()) {
      step("ナレーションを書いています（数十秒かかります）");
      try {
        const draft = await draftEventCmNarration(seededBrief, {
          now: new Date().toISOString(),
        });
        seededBrief = { ...seededBrief, narration: draft.narration };
      } catch {
        // Left empty on purpose; the screen says the narration is missing.
      }
    }

    brief = seededBrief;
    pinMaterial = seeded.seeded.logoMaterial;
    // Not the seeded event name: that is a proposal for the *film*, and using
    // it as the video's name made a guess look like something somebody typed
    // (lib/event-cm/title.ts).
    if (!title) title = UNTITLED_VIDEO;
  } else if (template === "event-promo") {
    // The template IS the starting point. Copying an existing take as a
    // "base" was a way of getting materials before the take had its own input
    // stage; now it has one, and offering a video to build from asked the
    // user to pick a template twice.
    brief = emptyEventBrief(title || UNTITLED_VIDEO);
    if (!title) title = UNTITLED_VIDEO;
  } else {
    // A product CM used to be born from the brand's newest LP: its brief was
    // built by reading that take's Brand Kit and job id. That is the coupling
    // docs/template-contract.md §2.1 forbids — an LP and a video are siblings,
    // and neither is the source of the other.
    //
    // Refused rather than seeded from nothing until the template is re-founded
    // on brand knowledge (§4). It is already out of the add dialog
    // (`addable: false`), so this closes the direct-API path to the same state.
    throw new CreateFailure(
      "製品紹介動画は作り直しの途中です。ブランドから投影する新しい版ができるまで追加できません",
    );
  }

  step("動画を保存しています");
  const created = await createTake(supabase, {
    brandId,
    templateId: template,
    title,
    brief,
    // The render row records the painting too, so `take_renders.theme` says
    // what was chosen and not the catalog's first entry.
    artDirection: artDirection ?? null,
    createdBy: userId,
  });
  if (!created.ok) throw new CreateFailure(created.error);

  if (pinMaterial) {
    // The mark is COPIED into the take, not referenced (docs/asset-normalization
    // §12, 2026-09-08). The brand's row stays the brand's; this take gets its
    // own row under its own prefix, so whatever the brand does to its mark
    // later — replace it, delete it — reaches no film already made, and
    // deleting this take takes exactly this take's files with it.
    step("ブランドのマークをこの動画へコピーしています");
    const source = await supabase
      .from("brand_materials")
      .select(COPY_COLUMNS)
      .eq("id", pinMaterial.id)
      .maybeSingle();
    if (source.error || !source.data) {
      throw new CreateFailure("ブランドのマークを読めませんでした");
    }
    let copies: CopiedMaterial[];
    try {
      copies = await copyMaterials(
        supabase,
        [source.data as unknown as CopySource],
        { scope: "take", brandId, takeId: created.takeId },
        userId,
      );
    } catch (error) {
      throw new CreateFailure(
        error instanceof Error ? error.message : "ブランドのマークをコピーできませんでした",
      );
    }
    const copy = copies[0];

    // The brief was saved pointing at the brand's row; repoint it at the copy
    // the take now owns. The pin is what lets the preview resolver and the
    // renderer read those bytes, and what fixes the exact version consumed.
    const repointed = replaceMaterialUris(brief, (id) =>
      id === pinMaterial.id ? materialUri(copy.id) : null,
    );
    const { error: briefError } = await supabase
      .from("takes")
      .update({ brief: repointed })
      .eq("id", created.takeId);
    if (briefError) {
      throw new CreateFailure(`マークの参照を書き換えられませんでした: ${briefError.message}`);
    }
    const { error: pinError } = await supabase.from("take_inputs").insert({
      take_id: created.takeId,
      material_id: copy.id,
      role: "logo",
      checksum: copy.checksum ?? pinMaterial.checksum,
    });
    if (pinError) {
      throw new CreateFailure(`ロゴを入力として固定できませんでした: ${pinError.message}`);
    }
  }

  return { id: created.takeId, createdAt: new Date().toISOString() };
}
