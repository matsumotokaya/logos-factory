import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// The first second of 「URLからブランドを作る」: the brand exists at once, so
// the user is taken to its page while the site is read into it
// (importSiteIntoBrand). Until the analysis names it, it is called after the
// host and wears the most general kind; a workspace made for it is named the
// same way and renamed after the operator when the analysis is sure of one.

/** The URL as a brand records it: no query, fragment or trailing slash. */
export function normalizedWebsite(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

function hostName(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export async function createBrandFromUrl(
  supabase: SupabaseClient,
  userId: string,
  input: {
    url: string;
    /** The workspace to file it in; null to make a new one. */
    organizationId: string | null;
    /** The brand this one sits under (a sub-brand), else null. */
    parentBrandId?: string | null;
  },
): Promise<{
  organizationId: string;
  brandId: string;
  /** The workspace's name when it was made for this brand, else null. */
  provisionalWorkspaceName: string | null;
}> {
  const provisionalName = hostName(input.url) ?? "新しいブランド";
  let organizationId = input.organizationId;
  let provisionalWorkspaceName: string | null = null;
  if (!organizationId) {
    organizationId = randomUUID();
    provisionalWorkspaceName = provisionalName;
    // The creator becomes owner through the on_organization_created trigger.
    const workspace = await supabase.from("organizations").insert({
      org_id: organizationId,
      name: provisionalWorkspaceName,
      created_by: userId,
    });
    if (workspace.error) throw new Error(workspace.error.message);
  }

  // Last in the workspace's list; the user moves it from there.
  const last = await supabase
    .from("brand_entities")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw new Error(last.error.message);
  const sortOrder = ((last.data?.sort_order as number | undefined) ?? 0) + 1;

  const brandId = randomUUID();
  const website = normalizedWebsite(input.url);
  const brand = await supabase.from("brand_entities").insert({
    id: brandId,
    name: provisionalName,
    website,
    status: "inferred",
    source_kind: "scraped",
    source_url: website || null,
    provenance: {
      name: { source: "provisional" },
      brand_kind: { source: "provisional" },
    },
    created_by: userId,
    organization_id: organizationId,
    parent_brand_id: input.parentBrandId ?? null,
    sort_order: sortOrder,
    brand_kind: "business",
  });
  if (brand.error) throw new Error(brand.error.message);
  return { organizationId, brandId, provisionalWorkspaceName };
}
