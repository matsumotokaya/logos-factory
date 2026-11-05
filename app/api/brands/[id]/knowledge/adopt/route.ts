// 推定 → 採用, by a person.
//
// A claim is something the product read; a value is something the brand
// stands behind. Until now only the site capture wrote values (and only the
// measurable ones), so every fact a model structured — the operator's name,
// the audience — stayed a claim forever and never reached the kit. This is
// the one click that moves it: the field's current claim (or a value the
// user typed over it) becomes the adopted value, recorded as user input.

import { frameField } from "@/lib/brand/capture-frame";
import { guardBrandRequest } from "@/lib/brand-access";
import { adoptBrandKnowledge } from "@/lib/brand/knowledge";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

const FIELD_PATH = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$/;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardBrandRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: brandId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { fieldPath?: unknown; value?: unknown }
    | null;
  const fieldPath = typeof body?.fieldPath === "string" ? body.fieldPath : "";
  if (!FIELD_PATH.test(fieldPath)) {
    return Response.json({ error: "項目が正しくありません" }, { status: 400 });
  }
  const supabase = createServerSupabaseForToken(user.token);

  // The value to adopt: what the caller sent, else the latest claim.
  let value = body?.value;
  let layer: "fact" | "expression" | null = frameField(fieldPath)?.layer ?? null;
  if (value === undefined) {
    const { data: claim, error } = await supabase
      .from("brand_knowledge_claims")
      .select("value, layer")
      .eq("brand_id", brandId)
      .is("variant_id", null)
      .eq("field_path", fieldPath)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!claim) return Response.json({ error: "採用できる推定がありません" }, { status: 404 });
    value = claim.value;
    layer = layer ?? ((claim.layer as "fact" | "expression") ?? null);
  }
  if (value === undefined || value === null || value === "") {
    return Response.json({ error: "空の値は採用できません" }, { status: 400 });
  }
  if (!layer) return Response.json({ error: "この項目の層がわかりません" }, { status: 400 });

  const result = await adoptBrandKnowledge(supabase, {
    brandId,
    fields: [{ field_path: fieldPath, layer, value }],
    sourceKind: "user_input",
    sourceRef: { source: "brand_kit", at: new Date().toISOString() },
    userId: user.id,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ adopted: result.adopted, fieldPath, value });
}
