// LPs (campaign-lp Takes) of one brand. The list view under
// /brands/[id]/lp — the place the brand top links to and where a new LP will
// land once that flow exists. Today the LP detail page is /brands/[id]/lp/[jobId],
// and every LP Take is a V2 row, so the list reads straight from `takes` like
// the video portal does.

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

type TakeLpRow = {
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

export type LpSummary = {
  id: string;
  brandId: string;
  title: string;
  template: string;
  theme: string | null;
  /** Whether the brief carries a usable source URL — what the user can read into the LP. */
  hasSource: boolean;
  published: boolean;
  state: "html_ready" | "preview_ready" | "empty";
  createdAt: string;
};

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardBrandRequest(req);
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
  if (brandError) {
    return Response.json({ error: "ブランドを確認できませんでした" }, { status: 500 });
  }
  if (!brand) {
    return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
  }

  const takeResult = await supabase
    .from("takes")
    .select(
      "id, brand_id, template_id, title, brief, created_at, take_renders(status, latest_artifact_id, publications(status))",
    )
    .eq("brand_id", brandId)
    .eq("tool_kind", "lp")
    .order("created_at", { ascending: false });
  if (takeResult.error) {
    return Response.json({ error: "LPを取得できませんでした" }, { status: 500 });
  }

  const rows = (takeResult.data ?? []) as unknown as TakeLpRow[];
  const lps: LpSummary[] = rows
    .filter((row) => row.template_id === "campaign-lp")
    .map((row) => {
      const brief = (row.brief as Record<string, unknown> | null) ?? {};
      const theme = typeof brief.theme === "string" ? brief.theme : null;
      const sourceUrl = typeof brief.sourceUrl === "string" ? brief.sourceUrl : "";
      const kit = brief.kit;
      const renderReady = (row.take_renders ?? []).some(
        (render) => render.status === "ready" && render.latest_artifact_id,
      );
      const published = (row.take_renders ?? []).some((render) =>
        (render.publications ?? []).some(
          (publication) => publication.status === "live",
        ),
      );
      return {
        id: row.id,
        brandId: row.brand_id,
        title: row.title,
        template: row.template_id,
        theme,
        hasSource: Boolean(sourceUrl || kit),
        published,
        state: renderReady ? "html_ready" : sourceUrl || kit ? "preview_ready" : "empty",
        createdAt: row.created_at,
      };
    });

  return Response.json({ brand: { id: brand.id, name: brand.name }, lps });
}