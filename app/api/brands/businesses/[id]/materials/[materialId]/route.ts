import { guardLabsRequest } from "@/lib/labs-access";
import {
  createServerSupabaseForToken,
  requireUser,
} from "@/lib/supabase/server";
import { destroyFamily, resolveBrandMaterialFamily } from "@/lib/materials/delete";

/**
 * Remove a brand-scope material, and everything that came out of it.
 *
 * docs/asset-normalization.md §12 (2026-09-08). A brand's file is nobody
 * else's: takes hold copies, so deleting here reaches no video, and there is
 * nothing to ask. A video made before the copy model still pins the brand's
 * mark directly; the FK refuses for it, and lib/materials/delete.ts says so.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; materialId: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  const user = await requireUser(req);
  const { id, materialId } = await ctx.params;
  const supabase = createServerSupabaseForToken(user.token);

  const resolved = await resolveBrandMaterialFamily(supabase, { brandId: id, materialId });
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const destroyed = await destroyFamily(supabase, resolved.family);
  if ("error" in destroyed) {
    return Response.json({ error: destroyed.error }, { status: destroyed.status });
  }
  return Response.json(
    {
      ok: true,
      deleted: destroyed.destroyed.deleted.map((row) => ({ id: row.id, label: row.label })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
