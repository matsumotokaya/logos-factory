// Taking apart a PDF that is already registered.
//
// docs/asset-normalization.md §9.4. New uploads are expanded in the same
// request that registers them; this is for the PDFs that arrived before that
// existed, and for a person who wants to re-run the extraction after a fix. It
// runs the same function as intake, so the two cannot disagree on what a child
// is, and it is idempotent on content — running it twice writes nothing new.

import { guardLabsRequest } from "@/lib/labs-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { getR2Object } from "@/lib/r2";
import { isPdf } from "@/lib/materials/pdf";
import { registerPdfChildren } from "@/lib/materials/pdf-children";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; materialId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, materialId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const current = await supabase
    .from("brand_materials")
    .select("id, brand_id, scope, take_id, label, media_type, r2_key")
    .eq("id", materialId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (current.error) {
    return Response.json({ error: "素材を確認できませんでした" }, { status: 500 });
  }
  if (!current.data) {
    return Response.json({ error: "素材が見つかりません" }, { status: 404 });
  }
  const row = current.data as {
    id: string;
    brand_id: string;
    scope: string;
    take_id: string | null;
    label: string;
    media_type: string | null;
    r2_key: string | null;
  };
  if (!isPdf(row.media_type)) {
    return Response.json({ error: "PDFではないので中身を取り出せません" }, { status: 400 });
  }
  if (!row.r2_key) {
    return Response.json({ error: "この素材はファイルを持っていません" }, { status: 400 });
  }

  const bytes = await getR2Object(row.r2_key);
  if (!bytes) {
    return Response.json({ error: "素材の本体を取得できませんでした" }, { status: 502 });
  }

  try {
    const expansion = await registerPdfChildren(supabase, row, bytes, user.id);
    return Response.json({ expansion }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "PDFの中身を取り出せませんでした" },
      { status: 400 },
    );
  }
}
