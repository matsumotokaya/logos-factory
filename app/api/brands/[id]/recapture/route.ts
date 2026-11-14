// Make the brand again from its inputs: the site, and everything the person
// added beside it (files, pages, notes — lib/brand/read-inputs.ts). A brand
// with no site is made from its added inputs alone.
//
// The same reading a brand gets when it is created from a URL
// (importSiteIntoBrand): it appends what the site says now, adopts only what
// a rule measured, and never overwrites a value a person decided. It never
// renames the brand, and it makes no deliverable — remaking an LP or a video
// stays each deliverable's own button. It runs detached; the brand page
// follows it through GET /api/brands/[id]/runs.

import { guardBrandRequest } from "@/lib/brand-access";
import { importInputsOnly, importSiteIntoBrand } from "@/lib/brand/import-site";
import { startBrandRun } from "@/lib/brand/runs";
import { normalizePublicHttpUrl } from "@/lib/public-url";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const brand = await supabase
    .from("brand_entities")
    .select("id, website")
    .eq("id", brandId)
    .maybeSingle();
  if (brand.error) {
    return Response.json({ error: "ブランドを取得できませんでした" }, { status: 500 });
  }
  if (!brand.data) {
    return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
  }

  // The body may name a URL; otherwise the brand's own website is the source.
  // `source_url` is not unique and is not identity (§19.3) — only where to look.
  let url: string | null;
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    const candidate =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : ((brand.data.website as string | null) ?? "");
    url = candidate ? normalizePublicHttpUrl(candidate).href : null;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "URLを読み取れませんでした" },
      { status: 400 },
    );
  }

  let log: Awaited<ReturnType<typeof startBrandRun>>;
  try {
    log = await startBrandRun(supabase, { brandId, userId: user.id });
  } catch (error) {
    console.error("Brand run creation failed:", error);
    return Response.json({ error: "読み直しを開始できませんでした" }, { status: 500 });
  }

  const work = url
    ? importSiteIntoBrand({ supabase, userId: user.id, brandId, url, log, identify: null })
    : importInputsOnly({ supabase, userId: user.id, brandId, log });
  void work.catch(
    async (error) => {
      console.error("Site re-import failed:", error);
      await log.fail(error instanceof Error ? error.message : "サイトから取り込めませんでした");
    },
  );

  return Response.json({ runId: log.id }, { status: 202 });
}
