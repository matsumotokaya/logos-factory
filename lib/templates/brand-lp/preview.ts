import "server-only";

import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedLabsUrl } from "@/lib/labs-output-sign";
import { getR2Object } from "@/lib/r2";
import { brandMaterialSignatureToken } from "@/lib/takes/material-uri";
import type { BrandLpBrief } from "./brief-schema";
import type { LpAssets } from "./render";

// The addresses an LP's two files are served from, for the workspace.
//
// The logo travels inside the page: the kit froze its vector master, so it
// becomes a data URI and the page shows it wherever it is opened. The screen
// is a brand material in private storage, so the browser is handed a signed
// URL — absolute, because the page is shown from srcdoc and from a blob,
// where a relative address has nothing to resolve against.

export async function lpAssets(
  supabase: SupabaseClient,
  input: { brandId: string; brief: BrandLpBrief; origin: string },
): Promise<LpAssets> {
  const { brandId, brief, origin } = input;

  let logo: string | null = null;
  const mark = brief.kit.logos[0];
  if (mark?.svg) {
    logo = `data:image/svg+xml;base64,${Buffer.from(mark.svg, "utf8").toString("base64")}`;
  } else if (mark?.r2Key) {
    const bytes = await getR2Object(mark.r2Key);
    if (bytes) logo = `data:${mark.mediaType ?? "image/png"};base64,${bytes.toString("base64")}`;
  }

  let screen: string | null = null;
  if (brief.visuals.screen) {
    // Read through the caller's own access: a material they can no longer
    // see, or one that was deleted, leaves the hero typographic.
    const { data } = await supabase
      .from("brand_materials")
      .select("id, r2_key")
      .eq("id", brief.visuals.screen.materialId)
      .eq("brand_id", brandId)
      .maybeSingle();
    const key = (data?.r2_key as string | null) ?? null;
    if (data && key) {
      screen =
        origin +
        signedLabsUrl(
          `/api/brands/${brandId}/materials/${data.id}/${encodeURIComponent(path.posix.basename(key))}?key=${encodeURIComponent(key)}`,
          brandMaterialSignatureToken(brandId, data.id as string, key),
        );
    }
  }
  return { logo, screen };
}
