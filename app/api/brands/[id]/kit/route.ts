// The brand kit's publishing surface for the workspace.
//
//   GET     status (下書き / 公開中 / 更新あり / 非公開) and the draft brief
//   POST    publish the draft as a new version at /k/<brandId>
//   DELETE  take the live version down (the URL goes 404; the takes stay)
//
// Rights are the database's: the kit is a take, the publication is a
// publication, and the RLS on those rows decides. A brand grant that can
// edit the brand's output can make the take; only the admin rung can put a
// publication live (migration 0030).

import { guardBrandRequest } from "@/lib/brand-access";
import { kitStatus, publishKit, unpublishKit } from "@/lib/brand/kit/publish";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

async function session(req: Request) {
  const denied = await guardBrandRequest(req);
  if (denied) return { denied };
  try {
    const user = await requireUser(req);
    return { user, supabase: createServerSupabaseForToken(user.token) };
  } catch {
    return { denied: unauthorized() };
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await session(req);
  if (s.denied) return s.denied;
  const { id } = await ctx.params;
  const result = await kitStatus(s.supabase, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ kit: result.status });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await session(req);
  if (s.denied) return s.denied;
  const { id } = await ctx.params;
  const result = await publishKit(s.supabase, { brandId: id, userId: s.user.id });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  const status = await kitStatus(s.supabase, id);
  return Response.json({
    takeId: result.takeId,
    urlPath: result.urlPath,
    kit: status.ok ? status.status : null,
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await session(req);
  if (s.denied) return s.denied;
  const { id } = await ctx.params;
  const result = await unpublishKit(s.supabase, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  const status = await kitStatus(s.supabase, id);
  return Response.json({ retired: result.retired, kit: status.ok ? status.status : null });
}
