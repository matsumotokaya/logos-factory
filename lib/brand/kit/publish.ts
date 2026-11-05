import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTake } from "@/lib/takes/create";
import { canonicalKitPath } from "@/lib/takes/publication-path";
import { buildKitBrief } from "./build";
import { kitContentHash, parseKitBrief, type BrandKitBrief } from "./snapshot";

// Publishing the brand kit — a snapshot, never a pointer.
//
// Each publish makes a new take whose brief is the brand frozen at that
// moment, marks its html render ready (the page is derived on read, so there
// is no artifact to wait for), retires whatever was live at /k/<brandId>,
// puts the new render there, and points canonical_slots(brand_guide) at the
// new take. The old takes stay: a published version is a thing someone was
// handed, and the history of what was said is the whole point of keeping it.
//
// Status is computed, not stored: the live take's content hash against the
// draft's. A brand whose site was re-read gets 「更新あり」 without anything
// having to remember to flip a flag.

export const KIT_SLOT = "brand_guide";

export type KitStatus = {
  /** 下書き: never published. 公開中: live and equal to the draft. 更新あり:
   *  live but the draft differs. 非公開: was live, taken down. */
  state: "draft" | "live" | "stale" | "unpublished";
  urlPath: string;
  liveTakeId: string | null;
  publishedAt: string | null;
  /** The draft, for the preview and the publish dialog. */
  draft: BrandKitBrief;
};

async function livePublication(
  supabase: SupabaseClient,
  brandId: string,
): Promise<{ renderId: string; takeId: string; publishedAt: string } | null> {
  const { data } = await supabase
    .from("publications")
    .select("render_id, published_at, take_renders!inner(take_id)")
    .eq("surface", "canonical_url")
    .eq("url_path", canonicalKitPath(brandId))
    .eq("status", "live")
    .maybeSingle();
  if (!data) return null;
  const render = data.take_renders as unknown as { take_id: string } | { take_id: string }[];
  const takeId = Array.isArray(render) ? render[0]?.take_id : render?.take_id;
  if (!takeId) return null;
  return {
    renderId: data.render_id as string,
    takeId,
    publishedAt: data.published_at as string,
  };
}

export async function kitStatus(
  supabase: SupabaseClient,
  brandId: string,
): Promise<{ ok: true; status: KitStatus } | { ok: false; status: number; error: string }> {
  const draft = await buildKitBrief(supabase, brandId);
  if (!draft.ok) return draft;
  const live = await livePublication(supabase, brandId);
  const urlPath = canonicalKitPath(brandId);
  if (!live) {
    // Was anything ever published here? A retired row means 非公開, not 下書き.
    const { count } = await supabase
      .from("publications")
      .select("id", { count: "exact", head: true })
      .eq("surface", "canonical_url")
      .eq("url_path", urlPath);
    return {
      ok: true,
      status: {
        state: count && count > 0 ? "unpublished" : "draft",
        urlPath,
        liveTakeId: null,
        publishedAt: null,
        draft: draft.brief,
      },
    };
  }
  const { data: take } = await supabase
    .from("takes")
    .select("brief")
    .eq("id", live.takeId)
    .maybeSingle();
  const liveBrief = parseKitBrief(take?.brief);
  const same = liveBrief !== null && kitContentHash(liveBrief) === kitContentHash(draft.brief);
  return {
    ok: true,
    status: {
      state: same ? "live" : "stale",
      urlPath,
      liveTakeId: live.takeId,
      publishedAt: live.publishedAt,
      draft: draft.brief,
    },
  };
}

export async function publishKit(
  supabase: SupabaseClient,
  input: { brandId: string; userId: string },
): Promise<{ ok: true; takeId: string; urlPath: string } | { ok: false; status: number; error: string }> {
  const draft = await buildKitBrief(supabase, input.brandId);
  if (!draft.ok) return draft;
  const brief = draft.brief;
  const urlPath = canonicalKitPath(input.brandId);

  const created = await createTake(supabase, {
    brandId: input.brandId,
    templateId: "brand-kit",
    brief,
    title: `${brief.brand.name} ブランドキット`,
    createdBy: input.userId,
  });
  if (!created.ok) return { ok: false, status: 500, error: created.error };
  const renderId = created.renderIds[0];
  if (!renderId) return { ok: false, status: 500, error: "キットの出力行が作られませんでした" };

  const now = new Date().toISOString();
  const ready = await supabase
    .from("take_renders")
    .update({ status: "ready", updated_at: now })
    .eq("id", renderId);
  if (ready.error) return { ok: false, status: 500, error: ready.error.message };

  // The address can hold one live occupant. Retire the previous version
  // first; the unique index refuses two live rows on the same path.
  const previous = await livePublication(supabase, input.brandId);
  if (previous) {
    const retired = await supabase
      .from("publications")
      .update({ status: "retired", updated_at: now })
      .eq("render_id", previous.renderId)
      .eq("surface", "canonical_url")
      .eq("status", "live");
    if (retired.error) return { ok: false, status: 500, error: retired.error.message };
  }
  const published = await supabase.from("publications").insert({
    render_id: renderId,
    surface: "canonical_url",
    url_path: urlPath,
    status: "live",
    published_at: now,
    published_by: input.userId,
    metadata: { contentHash: kitContentHash(brief), supersedesTakeId: previous?.takeId ?? null },
  });
  if (published.error) return { ok: false, status: 500, error: published.error.message };

  // canonical_slots(brand_id, slot) is a partial unique index, which PostgREST
  // cannot upsert against; read, then write.
  const slot = await supabase
    .from("canonical_slots")
    .select("id")
    .eq("brand_id", input.brandId)
    .eq("slot", KIT_SLOT)
    .maybeSingle();
  if (slot.error) return { ok: false, status: 500, error: slot.error.message };
  const slotWrite = slot.data
    ? await supabase
        .from("canonical_slots")
        .update({ take_id: created.takeId, updated_by: input.userId, updated_at: now })
        .eq("id", slot.data.id)
    : await supabase.from("canonical_slots").insert({
        slot: KIT_SLOT,
        brand_id: input.brandId,
        take_id: created.takeId,
        updated_by: input.userId,
      });
  if (slotWrite.error) return { ok: false, status: 500, error: slotWrite.error.message };

  return { ok: true, takeId: created.takeId, urlPath };
}

export async function unpublishKit(
  supabase: SupabaseClient,
  brandId: string,
): Promise<{ ok: true; retired: boolean } | { ok: false; status: number; error: string }> {
  const live = await livePublication(supabase, brandId);
  if (!live) return { ok: true, retired: false };
  const { error } = await supabase
    .from("publications")
    .update({ status: "retired", updated_at: new Date().toISOString() })
    .eq("render_id", live.renderId)
    .eq("surface", "canonical_url")
    .eq("status", "live");
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, retired: true };
}
