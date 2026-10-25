import { guardBrandRequest } from "@/lib/brand-access";
import { signedLabsUrl } from "@/lib/labs-output-sign";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { currentTemplate } from "@/lib/templates/catalog";
import { deleteTake, parseMaterialDisposition } from "@/lib/takes/delete";
import {
  ensureCanonicalPublication,
  retireCanonicalPublications,
} from "@/lib/takes/publication";
import { renderOutputSignatureToken } from "../../takes/[takeId]/renders/[renderId]/output/route";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

async function loadLp(
  supabase: ReturnType<typeof createServerSupabaseForToken>,
  brandId: string,
  takeId: string,
) {
  const { data: take, error: takeError } = await supabase
    .from("takes")
    .select(
      "id, brand_id, title, status, template_id, template_version, brief, created_at, updated_at",
    )
    .eq("id", takeId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "lp")
    .maybeSingle();
  if (takeError) return { error: takeError.message, status: 500 as const };
  if (!take) return { error: "LPが見つかりません", status: 404 as const };

  const { data: render, error: renderError } = await supabase
    .from("take_renders")
    .select("id, status, latest_artifact_id, updated_at")
    .eq("take_id", take.id)
    .eq("format", "html")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (renderError || !render) {
    return {
      error: renderError?.message ?? "LP Renderが見つかりません",
      status: 500 as const,
    };
  }

  const [artifactResult, publicationResult] = await Promise.all([
    render.latest_artifact_id
      ? supabase
          .from("render_artifacts")
          .select("id, r2_key, bytes, media_type, created_at")
          .eq("id", render.latest_artifact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("publications")
      .select("id, status, url_path, published_at, created_at")
      .eq("render_id", render.id)
      .eq("surface", "canonical_url")
      .order("created_at", { ascending: false }),
  ]);
  if (artifactResult.error || publicationResult.error) {
    return { error: "LPの成果物・公開履歴を取得できませんでした", status: 500 as const };
  }

  const artifact = artifactResult.data;
  const previewUrl = artifact
    ? signedLabsUrl(
        `/api/brands/${brandId}/takes/${take.id}/renders/${render.id}/output?key=${encodeURIComponent(artifact.r2_key)}`,
        renderOutputSignatureToken(brandId, take.id, render.id, artifact.r2_key),
      )
    : null;
  const publications = publicationResult.data ?? [];
  const live = publications.find((publication) => publication.status === "live") ?? null;
  const brief = take.brief as Record<string, unknown> | null;
  const kit =
    brief?.kit && typeof brief.kit === "object"
      ? (brief.kit as Record<string, unknown>)
      : null;
  const service =
    kit?.service && typeof kit.service === "object"
      ? (kit.service as Record<string, unknown>)
      : null;

  return {
    status: 200 as const,
    data: {
      lp: {
        id: take.id,
        brandId: take.brand_id,
        title: take.title,
        serviceName:
          typeof service?.name === "string"
            ? service.name
            : take.title.replace(/\s+LP$/, ""),
        templateId: take.template_id,
        templateVersion: take.template_version,
        status: take.status,
        createdAt: take.created_at,
        updatedAt: take.updated_at,
        render: {
          id: render.id,
          status: render.status,
          updatedAt: render.updated_at,
        },
        artifact: artifact
          ? {
              id: artifact.id,
              bytes: Number(artifact.bytes ?? 0),
              mediaType: artifact.media_type,
              createdAt: artifact.created_at,
            }
          : null,
        previewUrl,
        published: Boolean(live),
        publicUrl: live?.url_path ?? null,
        publishedAt: live?.published_at ?? null,
        publicationHistoryCount: publications.length,
      },
    },
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; takeId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, takeId } = await ctx.params;
  const loaded = await loadLp(
    createServerSupabaseForToken(user.token),
    brandId,
    takeId,
  );
  return loaded.status === 200
    ? Response.json(loaded.data, { headers: { "Cache-Control": "private, no-store" } })
    : Response.json({ error: loaded.error }, { status: loaded.status });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; takeId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  let body: { published?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "リクエストを解釈できませんでした" }, { status: 400 });
  }
  if (typeof body.published !== "boolean") {
    return Response.json({ error: "publishedには真偽値が必要です" }, { status: 400 });
  }

  const { id: brandId, takeId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);
  const { data: take, error: takeError } = await supabase
    .from("takes")
    .select("id, template_id")
    .eq("id", takeId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "lp")
    .maybeSingle();
  if (takeError) return Response.json({ error: takeError.message }, { status: 500 });
  if (!take) return Response.json({ error: "LPが見つかりません" }, { status: 404 });

  const template = currentTemplate(take.template_id as string);
  if (!template?.publishSurfaces.includes("canonical_url")) {
    return Response.json({ error: "このテンプレートはURL公開に対応していません" }, { status: 409 });
  }
  const { data: render, error: renderError } = await supabase
    .from("take_renders")
    .select("id, status, latest_artifact_id")
    .eq("take_id", take.id)
    .eq("format", "html")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (renderError || !render) {
    return Response.json({ error: "LP Renderが見つかりません" }, { status: 409 });
  }

  const result = body.published
    ? render.status !== "ready" || !render.latest_artifact_id
      ? { ok: false as const, error: "完成したArtifactがないLPは公開できません" }
      : await ensureCanonicalPublication(supabase, {
          takeId: take.id as string,
          renderId: render.id as string,
          userId: user.id,
        })
    : await retireCanonicalPublications(supabase, [render.id as string]);
  if (!result.ok) {
    return Response.json(
      {
        error:
          result.error.includes("row-level security")
            ? "公開状態を変更する権限がありません"
            : result.error,
      },
      { status: result.error.includes("row-level security") ? 403 : 409 },
    );
  }
  return Response.json({ ok: true });
}

// Removing an LP for good. Same contract as the video route: `delete_take`
// decides, this route only proves the take is an LP of this brand.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; takeId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, takeId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const url = new URL(req.url);
  const disposition = parseMaterialDisposition(url.searchParams.get("materials"));
  if (!disposition) {
    return Response.json({ error: "素材の扱いが不正です" }, { status: 400 });
  }

  const { data: take, error: takeError } = await supabase
    .from("takes")
    .select("id")
    .eq("id", takeId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "lp")
    .maybeSingle();
  if (takeError) {
    return Response.json({ error: "LPを確認できませんでした" }, { status: 500 });
  }
  if (!take) {
    return Response.json({ error: "LPが見つかりません" }, { status: 404 });
  }

  const outcome = await deleteTake(supabase, {
    brandId,
    takeId: take.id as string,
    disposition,
  });
  if (!outcome.ok) {
    return Response.json(
      {
        error: outcome.error.replace(/^動画/, "LP"),
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
