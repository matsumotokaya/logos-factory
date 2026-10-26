// GET: a run on this brand (?runId=) or its latest one — reading the site on
// creation or on 「サイトを読み直す」. The brand page polls this to show the
// log while a run goes and to reload when it lands.

import { guardBrandRequest } from "@/lib/brand-access";
import { getBrandRun, latestBrandRun } from "@/lib/brand/runs";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id: brandId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);
  const runId = new URL(req.url).searchParams.get("runId");
  try {
    const run = runId
      ? await getBrandRun(supabase, brandId, runId)
      : await latestBrandRun(supabase, brandId);
    if (runId && !run) {
      return Response.json({ error: "実行が見つかりません" }, { status: 404 });
    }
    return Response.json({ run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Brand run read failed:", error);
    return Response.json({ error: "実行を取得できませんでした" }, { status: 500 });
  }
}
