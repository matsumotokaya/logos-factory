import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import { canonicalKitPath } from "@/lib/takes/publication-path";
import { parseKitBrief, type BrandKitBrief } from "./snapshot";
import { KIT_SLOT } from "./publish";

// The public side of the kit: what /k/[brandId] serves.
//
// Resolved with the admin client because the reader is anonymous, and gated
// by the one publicness decision the product has — a live publication on the
// kit's path (docs/deliverable-architecture.md §4.5). The slot says which
// take is current; the publication says whether it may be shown. Both have
// to agree, so a take that was slotted but then taken down stays dark.

export type LiveKit = {
  takeId: string;
  brief: BrandKitBrief;
  publishedAt: string;
};

export async function resolveLiveKit(brandId: string): Promise<LiveKit | null> {
  const admin = createAdminSupabase();
  const { data: slot } = await admin
    .from("canonical_slots")
    .select("take_id")
    .eq("brand_id", brandId)
    .eq("slot", KIT_SLOT)
    .maybeSingle();
  if (!slot?.take_id) return null;

  const { data: publication } = await admin
    .from("publications")
    .select("published_at, take_renders!inner(take_id)")
    .eq("surface", "canonical_url")
    .eq("url_path", canonicalKitPath(brandId))
    .eq("status", "live")
    .eq("take_renders.take_id", slot.take_id)
    .maybeSingle();
  if (!publication) return null;

  const { data: take } = await admin
    .from("takes")
    .select("id, brief")
    .eq("id", slot.take_id)
    .eq("template_id", "brand-kit")
    .maybeSingle();
  const brief = parseKitBrief(take?.brief);
  if (!take || !brief) return null;
  return {
    takeId: take.id as string,
    brief,
    publishedAt: publication.published_at as string,
  };
}
