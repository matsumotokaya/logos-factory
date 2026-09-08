import "server-only";

import { signedLabsUrl } from "@/lib/labs-output-sign";
import {
  brandMaterialSignatureToken,
  takeMaterialSignatureToken,
} from "@/lib/takes/material-uri";

// One signed URL for one material's own file, whatever scope it sits in.
//
// docs/asset-normalization.md §9.4. Every material is a container whose
// contents begin with itself, so every list that shows a material has to be
// able to hand its bytes over. There are two delivery routes — one for the
// files a take pinned and one for the files a brand holds — and three lists
// that need them, which is six chances to build a URL slightly differently.
// This is the one place that decides.
//
// Signatures last an hour and bind the exact R2 key, so the same URL serves the
// thumbnail and the download without an Authorization header.

/**
 * The URL's last segment: the file's base name, never the whole label.
 *
 * A folder upload stores names like `sake/photo.jpg`, and a slash in the path
 * would address something that does not exist. The extension survives so media
 * players can sniff the format; the saved filename comes from the anchor's
 * `download` attribute either way.
 */
const segment = (label: string): string =>
  encodeURIComponent(label.split("/").pop() || "asset");

export interface SignableMaterial {
  id: string;
  label: string;
  r2_key: string | null;
}

/**
 * A same-origin URL for this material's bytes, or null when it has none.
 *
 * `takeId` picks the route: a material pinned to a take is served through the
 * take path, a brand's own file through the brand path. Passing the take id for
 * a brand-scope row would mint a signature the brand route cannot verify.
 */
export function signedMaterialUrl(
  brandId: string,
  material: SignableMaterial,
  takeId?: string | null,
): string | null {
  if (!material.r2_key) return null;
  const name = segment(material.label);
  if (takeId) {
    return signedLabsUrl(
      `/api/brands/${brandId}/takes/${takeId}/materials/${material.id}/${name}?key=${encodeURIComponent(material.r2_key)}`,
      takeMaterialSignatureToken(brandId, takeId, material.id, material.r2_key),
    );
  }
  return signedLabsUrl(
    `/api/brands/${brandId}/materials/${material.id}/${name}?key=${encodeURIComponent(material.r2_key)}`,
    brandMaterialSignatureToken(brandId, material.id, material.r2_key),
  );
}
