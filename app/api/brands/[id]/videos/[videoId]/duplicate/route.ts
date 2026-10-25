// A second version of one video.
//
// Separate from POST /videos, which starts from a template. This starts from an
// existing take: same template version rules, same brief, same pinned inputs —
// what "make another version of this" means for something whose template can
// never change after creation (docs/data-model.md §5).

import { guardBrandRequest } from "@/lib/brand-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { duplicateTake } from "@/lib/takes/duplicate";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(
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

  // A body is optional: the menu sends none and takes the generated name.
  let title: string | null = null;
  try {
    const body = (await req.json()) as { title?: unknown };
    if (typeof body?.title === "string") title = body.title;
  } catch {
    title = null;
  }

  const outcome = await duplicateTake(supabase, {
    brandId,
    takeId: videoId,
    toolKind: "video",
    createdBy: user.id,
    title,
  });
  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, issues: outcome.issues },
      { status: outcome.status },
    );
  }

  return Response.json(
    { id: outcome.takeId, title: outcome.title, inputsCopied: outcome.inputsCopied },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
