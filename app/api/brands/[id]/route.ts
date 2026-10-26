import { guardBrandRequest } from "@/lib/brand-access";
import { isBrandKind } from "@/lib/brand-kind";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

// PATCH: relabel a Brand or move it in the tree.
//
//   { brandKind: "product" }        the label, any of BRAND_KINDS
//   { parentBrandId: "<uuid>" }     nest under another Brand in the workspace
//   { parentBrandId: null }         back to the top of the workspace
//
// Neither changes anything else: the kind is a label, and a move leaves every
// deliverable as it was because a take pins its inputs. The tree's rules —
// not its own parent, no cycle, same workspace — live in the
// enforce_brand_membership trigger; this route only translates its refusals.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;

  let body: { brandKind?: unknown; parentBrandId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const supabase = createServerSupabaseForToken(user.token);
  const current = await supabase
    .from("brand_entities")
    .select("provenance")
    .eq("id", id)
    .maybeSingle();
  if (current.error) {
    return Response.json({ error: "ブランドを確認できませんでした" }, { status: 500 });
  }
  if (!current.data) {
    return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if ("brandKind" in body) {
    if (!isBrandKind(body.brandKind)) {
      return Response.json({ error: "種別が不正です" }, { status: 400 });
    }
    patch.brand_kind = body.brandKind;
    patch.provenance = {
      ...((current.data.provenance as Record<string, unknown> | null) ?? {}),
      brand_kind: { source: "user_confirmed", confirmed_at: now, confirmed_by: user.id },
    };
  }
  if ("parentBrandId" in body) {
    if (body.parentBrandId !== null && typeof body.parentBrandId !== "string") {
      return Response.json({ error: "親ブランドが不正です" }, { status: 400 });
    }
    patch.parent_brand_id = body.parentBrandId;
  }
  if (!("brand_kind" in patch) && !("parent_brand_id" in patch)) {
    return Response.json({ error: "変更する項目がありません" }, { status: 400 });
  }

  const updated = await supabase
    .from("brand_entities")
    .update(patch)
    .eq("id", id)
    .select("id, brand_kind, parent_brand_id")
    .maybeSingle();
  if (updated.error) {
    const message = updated.error.message;
    const reason = /own parent/.test(message)
      ? "ブランドを自分自身の下には置けません"
      : /cycle/.test(message)
        ? "ブランドを自分の子孫の下には置けません"
        : /another workspace|another Brand/.test(message)
          ? "同じワークスペースのブランドの下にだけ置けます"
          : null;
    if (reason) return Response.json({ error: reason }, { status: 409 });
    console.error("Brand update failed:", message);
    return Response.json({ error: "ブランドを更新できませんでした" }, { status: 500 });
  }
  if (!updated.data) {
    return Response.json(
      { error: "このブランドを編集する権限がありません" },
      { status: 403 },
    );
  }

  return Response.json({
    brand: {
      id: updated.data.id as string,
      brandKind: updated.data.brand_kind as string,
      parentBrandId: (updated.data.parent_brand_id as string | null) ?? null,
    },
  });
}

// DELETE: remove a Brand that holds nothing. Anything it still owns — logos,
// deliverables, materials, nested brands — is named in the refusal, so the
// user deletes or moves it first; nothing is removed by implication.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  try {
    const brand = await supabase
      .from("brand_entities")
      .select("id, name, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (brand.error) throw new Error("ブランドを確認できませんでした");
    if (!brand.data) {
      return Response.json({ error: "ブランドが見つかりません" }, { status: 404 });
    }

    const [takes, materials, logos, children] = await Promise.all([
      supabase.from("takes").select("id", { count: "exact", head: true }).eq("brand_id", id),
      supabase
        .from("brand_materials")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", id),
      supabase
        .from("logos")
        .select("id", { count: "exact", head: true })
        .eq("subject_entity_id", id),
      supabase
        .from("brand_entities")
        .select("id", { count: "exact", head: true })
        .eq("parent_brand_id", id),
    ]);
    const countError =
      takes.error ?? materials.error ?? logos.error ?? children.error;
    if (countError) throw new Error("関連データを確認できませんでした");

    const blocking: string[] = [];
    if ((logos.count ?? 0) > 0) blocking.push(`ロゴ${logos.count}件`);
    if ((takes.count ?? 0) > 0) blocking.push(`動画・LP${takes.count}件`);
    if ((materials.count ?? 0) > 0) blocking.push(`素材${materials.count}件`);
    if ((children.count ?? 0) > 0) blocking.push(`子ブランド${children.count}件`);
    if (blocking.length > 0) {
      return Response.json(
        {
          error: `${blocking.join("・")}が残っているため削除できません。先に削除または移動してください`,
        },
        { status: 409 },
      );
    }

    const deleted = await supabase
      .from("brand_entities")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (deleted.error) throw new Error("ブランドを削除できませんでした");
    if (!deleted.data) {
      return Response.json(
        { error: "このブランドを削除する権限がありません" },
        { status: 403 },
      );
    }

    return Response.json(
      { ok: true, organizationId: brand.data.organization_id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "削除できませんでした" },
      { status: 500 },
    );
  }
}
