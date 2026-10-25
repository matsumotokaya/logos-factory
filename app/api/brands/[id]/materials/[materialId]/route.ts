// Editing what a material IS, and how far it reaches.
//
// docs/asset-normalization.md §5 / §12 / §14-2 / §14-5. Two edits, one
// resource:
//
//   category  what the file depicts. Classification is decided FOR the user
//             rather than asked of them, and that is only defensible if the
//             correction sticks — so writing here sets category_source='user',
//             and lib/materials/classify.ts never overwrites that.
//
//   scope     asking for 'brand' COPIES the material into the brand library
//             (docs/asset-normalization.md §12, 2026-09-08). The take keeps its
//             row; the brand gets its own, under its own prefix, with the
//             file's images or normalised copies along for the ride. Nothing is
//             shared afterwards: what the brand does to its copy reaches no
//             video, and what a video does to its own reaches no brand.
//
// Scoped by brand rather than by take because that is the permission boundary
// the row lives in. Since 2026-09-08 a row has exactly one owner, so a
// correction here reaches exactly one row.

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { isMaterialCategory } from "@/lib/materials/category";
import {
  isMaterialScope,
  promotionRefusal,
  promotionTo,
} from "@/lib/materials/promotion";
import { COPY_COLUMNS, copyMaterials, type CopySource } from "@/lib/materials/copy";
import { collectFamily } from "@/lib/materials/delete";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; materialId: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, materialId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  let body: { category?: unknown; scope?: unknown };
  try {
    body = (await req.json()) as { category?: unknown; scope?: unknown };
  } catch {
    return Response.json({ error: "内容を読めませんでした" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("category" in body) {
    // Clearing is allowed and means "not classified", which is a different
    // answer from `other` — the user may know that they do not know.
    if (body.category === null) {
      patch.category = null;
      patch.category_source = null;
    } else if (isMaterialCategory(body.category)) {
      patch.category = body.category;
      patch.category_source = "user";
    } else {
      return Response.json({ error: "その分類は使えません" }, { status: 400 });
    }
  }

  let promote = false;
  if ("scope" in body) {
    if (!isMaterialScope(body.scope)) {
      return Response.json({ error: "そのスコープは指定できません" }, { status: 400 });
    }
    promote = body.scope === "brand";
    if (!promote) {
      return Response.json(
        { error: "ブランドの素材を動画へ引き込む操作はまだありません" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(patch).length === 0 && !promote) {
    return Response.json({ error: "変更する内容がありません" }, { status: 400 });
  }

  // Read first, so a refusal can be told apart from a missing row. RLS makes an
  // update the caller may not perform return zero rows rather than an error,
  // and 「素材が見つかりません」 for a permission problem sends people looking
  // for the wrong thing.
  const current = await supabase
    .from("brand_materials")
    .select(COPY_COLUMNS)
    .eq("id", materialId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (current.error) {
    return Response.json({ error: "素材を確認できませんでした" }, { status: 500 });
  }
  if (!current.data) {
    return Response.json({ error: "素材が見つかりません" }, { status: 404 });
  }
  const row = current.data as unknown as CopySource;

  if (promote) {
    // The screen is not the authority: it decided this was possible, and the
    // server counts again with the same function (lib/materials/promotion.ts).
    const decision = promotionTo(row, "brand");
    if (!decision.can) {
      return Response.json({ error: decision.reason }, { status: 409 });
    }

    // Already there. The same bytes under the brand is the same promotion, so
    // a second click returns the first click's row instead of a twin.
    if (row.checksum) {
      const existing = await supabase
        .from("brand_materials")
        .select("id, scope")
        .eq("brand_id", brandId)
        .eq("scope", "brand")
        .eq("checksum", row.checksum)
        .limit(1)
        .maybeSingle();
      if (existing.data) {
        return Response.json(
          { material: existing.data, duplicate: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    // The file and what came out of it. A PDF goes up with its images, a mark
    // with its normalised copy; otherwise the brand would hold a deck whose
    // contents were left behind in one video.
    // promotionTo() refused a brand row above, so this is a take's file and
    // its take id is set; its family lives under the same take.
    const family = await supabase
      .from("brand_materials")
      .select(COPY_COLUMNS)
      .eq("brand_id", brandId)
      .eq("take_id", row.take_id as string);
    if (family.error) {
      return Response.json({ error: "素材の中身を確認できませんでした" }, { status: 500 });
    }
    const members = collectFamily(
      (family.data ?? []) as unknown as CopySource[],
      row.id,
    ).map((entry) => entry.id);
    const sources = ((family.data ?? []) as unknown as CopySource[]).filter((candidate) =>
      members.includes(candidate.id),
    );

    try {
      const copies = await copyMaterials(supabase, sources, { scope: "brand", brandId }, user.id);
      const root = copies.find((copy) => copy.fromId === row.id);
      return Response.json(
        { material: root ? { id: root.id, scope: "brand" } : null, copied: copies.length },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      // The insert policy is where the core rung is checked (0028): an editor
      // may copy within a take but not into the brand library.
      return Response.json(
        {
          error:
            error instanceof Error && /42501|policy|permission/i.test(error.message)
              ? promotionRefusal("brand")
              : error instanceof Error
                ? error.message
                : "ブランドにコピーできませんでした",
        },
        { status: 403 },
      );
    }
  }

  const updated = await supabase
    .from("brand_materials")
    .update(patch)
    .eq("id", materialId)
    .eq("brand_id", brandId)
    .select("id, category, category_source, scope")
    .maybeSingle();
  // RLS makes a forbidden update return zero rows rather than an error, so
  // a refusal and a missing row look alike from here; the read above already
  // told them apart, so zero rows now means permission.
  if (updated.error || !updated.data) {
    return Response.json({ error: "この素材を編集する権限がありません" }, { status: 403 });
  }

  return Response.json(
    { material: updated.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
