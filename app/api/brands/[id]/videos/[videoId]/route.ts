// One video of one brand.
//
// The path segment is always a V2 Take id. PATCH updates its validated brief,
// title, or canonical publication state.

import { guardBrandRequest } from "@/lib/brand-access";
import { signedLabsUrl } from "@/lib/labs-output-sign";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { videoState } from "@/lib/video/asset";
import { VIDEO_TEMPLATES, videoDisplayName } from "@/lib/video/templates";
import { renderOutputSignatureToken } from "../../takes/[takeId]/renders/[renderId]/output/route";
import { resolveBriefMaterialUrls } from "@/lib/takes/materials";
import { deleteTake, parseMaterialDisposition } from "@/lib/takes/delete";
import { titleOffer } from "@/lib/templates/event-cm/title";
import { filmPending } from "@/lib/templates/event-cm/bake";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import { validateBrief } from "@/lib/templates/brief-schemas";
import { rendererChangedSince } from "@/lib/templates/catalog";
import {
  ensureCanonicalVideoPublication,
  retireCanonicalPublications,
} from "@/lib/takes/publication";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

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
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const { data: take, error: takeError } = await supabase
    .from("takes")
    // The brand's name travels with the take because the page says where you
    // are: a breadcrumb reading 「ブランド」 names no brand, and this screen is
    // reached from a tree where the brand is the thing you picked.
    .select(
      "id, brand_id, template_id, title, brief, baked_brief, baked_at, created_at, brand_entities(name)",
    )
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (takeError) {
    return Response.json({ error: "動画を取得できませんでした" }, { status: 500 });
  }
  if (take) {
    const { data: render, error: renderError } = await supabase
      .from("take_renders")
      .select("id, status, latest_artifact_id, updated_at, params")
      .eq("take_id", take.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (renderError || !render) {
      return Response.json({ error: "動画の出力単位を取得できませんでした" }, { status: 500 });
    }
    const [artifactResult, publicationResult] = await Promise.all([
      render.latest_artifact_id
        ? supabase
            .from("render_artifacts")
            .select("r2_key, created_at, bytes")
            .eq("id", render.latest_artifact_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("publications")
        .select("id, url_path")
        .eq("render_id", render.id)
        .eq("status", "live")
        .limit(1),
    ]);
    if (artifactResult.error || publicationResult.error) {
      return Response.json({ error: "動画の成果物を取得できませんでした" }, { status: 500 });
    }
    // The client renders this brief in a Remotion Player, so its material
    // pointers have to become URLs a browser can fetch. Resolving here — while
    // the caller's token is still in hand — keeps the pinned-input check on the
    // server and the private R2 keys off the wire.
    let briefForClient = take.brief;
    let unresolvedMaterials: string[] = [];
    let materialUrls: Record<string, string> = {};
    try {
      const resolvedBrief = await resolveBriefMaterialUrls(
        supabase,
        brandId,
        take.id as string,
        take.brief,
      );
      briefForClient = resolvedBrief.brief;
      unresolvedMaterials = resolvedBrief.unresolved;
      materialUrls = resolvedBrief.urls;
    } catch {
      // A material read failure must not take the page down: the brief still
      // describes the video, and the slot list below the player is derived
      // from the same fields. The player shows what it can fetch.
    }

    // The film the player will actually run.
    //
    // Two briefs travel to the client on purpose (migration 0050): the
    // storyboard edits the working one, the player shows the one a run fixed.
    // Resolved through the same path because the player has to fetch the same
    // photographs and the same recording — a baked brief full of `material:`
    // pointers would play as a film with every slot empty.
    let bakedForClient: unknown = null;
    if (take.baked_brief) {
      try {
        bakedForClient = (
          await resolveBriefMaterialUrls(
            supabase,
            brandId,
            take.id as string,
            take.baked_brief,
          )
        ).brief;
      } catch {
        // Same reasoning as above; the working brief still describes the video.
      }
    }

    const artifact = artifactResult.data;
    const mp4Url = artifact
      ? signedLabsUrl(
          `/api/brands/${brandId}/takes/${take.id}/renders/${render.id}/output?key=${encodeURIComponent(artifact.r2_key)}`,
          renderOutputSignatureToken(brandId, take.id, render.id, artifact.r2_key),
        )
      : null;
    // Whether the drawing itself has moved on since this file was made.
    //
    // Only the server can answer it: the comparison is against the catalog this
    // deployment ships, and the client has no way to know which build drew an
    // MP4 that was exported weeks ago. Unknown reads as false — an export made
    // before the revision was recorded is not evidence of anything.
    const rendererBehind = rendererChangedSince(
      (render.params as Record<string, unknown> | null)?.rendererRevision,
      take.template_id as string,
    );
    const renderState =
      render.status === "running"
        ? {
            status: "running" as const,
            error: null,
            renderedAt: null,
            rendererBehind: false,
          }
        : render.status === "ready"
          ? {
              status: "done" as const,
              error: null,
              renderedAt: artifact?.created_at ?? render.updated_at,
              rendererBehind,
            }
          : render.status === "failed"
            ? {
                status: "error" as const,
                error: "前回のレンダーに失敗しました",
                renderedAt: null,
                rendererBehind: false,
              }
            : null;

    return Response.json(
      {
        kind: "asset" as const,
        video: {
          render: renderState,
          mp4Url,
          mp4Bytes: artifact?.bytes ?? null,
          id: take.id,
          brandId: take.brand_id,
          brandName:
            (Array.isArray(take.brand_entities)
              ? take.brand_entities[0]?.name
              : (take.brand_entities as { name?: string } | null)?.name) ?? null,
          title: take.title,
          template: take.template_id,
          // Family and painting (`イベント紹介動画 - スタンダード`): the name of
          // THIS take, not of its template, since one template paints two ways.
          templateName: videoDisplayName(
            take.template_id,
            typeof (take.brief as { artDirection?: unknown } | null)?.artDirection === "string"
              ? ((take.brief as { artDirection: string }).artDirection)
              : null,
          ),
          published: (publicationResult.data?.length ?? 0) > 0,
          publicUrl: publicationResult.data?.[0]?.url_path ?? null,
          briefSlug: null,
          brief: briefForClient,
          // What a run fixed. Null = never run, which the screen answers with
          // guidance rather than a warning (§9.9).
          bakedBrief: bakedForClient,
          bakedAt: take.baked_at ?? null,
          // How far the player is behind the workbench, field by field.
          //
          // Computed HERE, on the stored briefs, and never in the browser: the
          // copies above have had their `material:<uuid>` pointers replaced by
          // signed URLs that are re-minted on every load, so a field comparison
          // run on them would report the BGM and every photograph as changed on
          // a page refresh (docs/video-state-model.md §3.3).
          pending:
            VIDEO_TEMPLATES[take.template_id]?.bakesBrief && take.brief
              ? filmPending(
                  take.brief as EventCmBrief,
                  (take.baked_brief as EventCmBrief | null) ?? null,
                  take.baked_at ?? null,
                )
              : null,
          unresolvedMaterials,
          // material:<uuid> → the signed URL it became, so a picker can tell
          // which of its options the brief currently holds.
          materialUrls,
          // What this take can actually do right now — derived in
          // lib/video/asset.ts, which the portal's list reads too.
          state: videoState({
            template: take.template_id,
            hasRender: Boolean(artifact),
            hasBrief: Boolean(briefForClient),
          }),
          createdAt: take.created_at,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          Vary: "Authorization",
        },
      },
    );
  }

  return Response.json({ error: "動画が見つかりません" }, { status: 404 });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  let body: {
    published?: unknown;
    brief?: unknown;
    title?: unknown;
    /** Answer to "rename this video to the event's title?" — see
     *  lib/event-cm/title.ts. Kept as one field so the rule for what each
     *  answer writes lives on the server, not in the button. */
    titleOffer?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "リクエストを解釈できませんでした" }, { status: 400 });
  }

  const { data: take, error: takeReadError } = await supabase
    .from("takes")
    .select("id, template_id, title, brief")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (takeReadError) {
    return Response.json({ error: "動画を確認できませんでした" }, { status: 500 });
  }
  if (take) {
    if (body.published === true) {
      const { data: render, error: renderError } = await supabase
        .from("take_renders")
        .select("id, status, latest_artifact_id")
        .eq("take_id", take.id)
        .eq("format", "mp4")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (renderError || !render) {
        return Response.json({ error: "動画Renderが見つかりません" }, { status: 409 });
      }
      if (render.status !== "ready" || !render.latest_artifact_id) {
        return Response.json({ error: "完成したMP4がない動画は公開できません" }, { status: 409 });
      }
      const published = await ensureCanonicalVideoPublication(supabase, {
        takeId: take.id as string,
        renderId: render.id as string,
        userId: user.id,
      });
      if (!published.ok) {
        return Response.json(
          {
            error: published.error.includes("row-level security")
              ? "動画を公開する権限がありません"
              : published.error,
          },
          { status: published.error.includes("row-level security") ? 403 : 409 },
        );
      }
    }
    if (body.published === false) {
      const { data: renders, error: rendersError } = await supabase
        .from("take_renders")
        .select("id")
        .eq("take_id", take.id);
      if (rendersError) {
        return Response.json({ error: "公開状態を確認できませんでした" }, { status: 500 });
      }
      const renderIds = (renders ?? []).map((render) => render.id as string);
      const retired = await retireCanonicalPublications(supabase, renderIds);
      if (!retired.ok) {
        return Response.json({ error: "公開を終了できませんでした" }, { status: 500 });
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.brief && typeof body.brief === "object") {
      const validated = validateBrief(take.template_id as string, body.brief);
      if (!validated.ok) {
        return Response.json(
          { error: `ブリーフが不正です: ${validated.issues.join(", ")}` },
          { status: 400 },
        );
      }
      update.brief = validated.brief;
    }
    if (typeof body.title === "string" && body.title.trim()) {
      update.title = body.title.trim();
    }
    if (body.titleOffer === "accept" || body.titleOffer === "decline") {
      const current = take.brief as EventCmBrief;
      const proposed = titleOffer(take.title as string, current);
      if (proposed) {
        if (body.titleOffer === "accept") {
          update.title = proposed;
        } else {
          // Remembering the exact string means a *different* title proposed
          // later still gets asked about.
          const declined = validateBrief("event-cm", {
            ...current,
            titleDeclined: proposed,
          });
          if (!declined.ok) {
            return Response.json(
              { error: declined.issues.join(", ") },
              { status: 400 },
            );
          }
          update.brief = declined.brief;
        }
      }
    }
    if (Object.keys(update).length > 1) {
      const { error: updateError } = await supabase
        .from("takes")
        .update(update)
        .eq("id", take.id);
      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500 });
      }
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "動画が見つかりません" }, { status: 404 });
}

// Removing a video for good.
//
// The whole decision lives in `delete_take` (0031) — permission, the live
// publication refusal, and what happens to material this take is the only
// holder of. This route's only judgement is that the take is a video of *this*
// brand, so a video id from another brand cannot be deleted through this path.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const url = new URL(req.url);
  const disposition = parseMaterialDisposition(url.searchParams.get("materials"));
  if (!disposition) {
    return Response.json({ error: "素材の扱いが不正です" }, { status: 400 });
  }

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
  if (!take) {
    return Response.json({ error: "動画が見つかりません" }, { status: 404 });
  }

  const outcome = await deleteTake(supabase, {
    brandId,
    takeId: take.id as string,
    disposition,
  });
  if (!outcome.ok) {
    return Response.json(
      {
        error: outcome.error,
        needsMaterialDecision: outcome.needsMaterialDecision,
      },
      { status: outcome.status },
    );
  }

  return Response.json(
    {
      ok: true,
      cleanupPending: outcome.cleanupPending,
      promotedMaterials: outcome.promotedMaterials,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
