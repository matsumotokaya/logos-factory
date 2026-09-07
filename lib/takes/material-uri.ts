// How a brief points at a material, and how those pointers are walked.
//
// A brief never holds a private R2 key: it holds `material:<uuid>`, and the
// take_inputs row pins which material version that take consumes. Two consumers
// resolve those pointers and they must walk the brief identically:
//
//   render time — materials.ts downloads the bytes next to the composition
//   preview time — materials.ts mints signed same-origin URLs for the browser
//
// The walk lives here, free of `server-only`, so it can be tested directly.

export const MATERIAL_URI_PREFIX = "material:";

export const materialUri = (materialId: string): string =>
  `${MATERIAL_URI_PREFIX}${materialId}`;

/** Signature payload for one material served to a header-less browser
 *  request: the route identity plus the exact object it may serve. */
export const takeMaterialSignatureToken = (
  brandId: string,
  takeId: string,
  materialId: string,
  key: string,
): string => `take-material:${brandId}:${takeId}:${materialId}:${key}`;

/**
 * The same, for a material held at brand scope rather than pinned to a take.
 *
 * A brand's own files — the site screenshots, the key visual, the textures the
 * capture brought home — belong to no take, so `takeMaterialSignatureToken`
 * has no take id to bind. The route identity differs so a URL minted for one
 * cannot be replayed against the other.
 */
export const brandMaterialSignatureToken = (
  brandId: string,
  materialId: string,
  key: string,
): string => `brand-material:${brandId}:${materialId}:${key}`;

export function collectMaterialIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.startsWith(MATERIAL_URI_PREFIX)) {
    ids.add(value.slice(MATERIAL_URI_PREFIX.length));
  } else if (Array.isArray(value)) {
    for (const item of value) collectMaterialIds(item, ids);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectMaterialIds(item, ids);
  }
  return ids;
}

/**
 * The same walk, keeping WHERE each pointer was found.
 *
 * The inventory has to answer 「この素材はどこで使われているか」, and
 * `take_inputs.role` cannot answer it: 27 of the 47 pins say `brief_source`,
 * which means "somebody uploaded this to be read", not "the film shows it
 * here". The brief is the only thing that knows, because holding the pointer
 * IS being used.
 *
 * Paths come back in dotted form with array indices (`guests.0.photo`), which
 * is what a template's own vocabulary translates into a scene name. One
 * material can appear more than once — a mark really is in three scenes — so
 * the value is a list and duplicates are kept.
 */
export function collectMaterialPaths(
  value: unknown,
  paths = new Map<string, string[]>(),
  at = "",
): Map<string, string[]> {
  if (typeof value === "string" && value.startsWith(MATERIAL_URI_PREFIX)) {
    const id = value.slice(MATERIAL_URI_PREFIX.length);
    const found = paths.get(id);
    if (found) found.push(at);
    else paths.set(id, [at]);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectMaterialPaths(item, paths, at ? `${at}.${index}` : String(index)),
    );
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectMaterialPaths(item, paths, at ? `${at}.${key}` : key);
    }
  }
  return paths;
}

/**
 * Rewrite every `material:<uuid>` leaf through `resolve`.
 *
 * Returning null from `resolve` leaves the pointer untouched, so an unresolved
 * material stays visible as itself instead of turning into an empty slot — an
 * empty slot means "the template designed a substitute" (deliverable
 * architecture §17), which is not what a missing pin is.
 */
export function replaceMaterialUris<T>(
  value: T,
  resolve: (materialId: string) => string | null,
): T {
  if (typeof value === "string" && value.startsWith(MATERIAL_URI_PREFIX)) {
    const resolved = resolve(value.slice(MATERIAL_URI_PREFIX.length));
    return (resolved ?? value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceMaterialUris(item, resolve)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceMaterialUris(item, resolve)]),
    ) as T;
  }
  return value;
}
