export const canonicalTakePath = (takeId: string): string => `/c/${takeId}`;
export const canonicalVideoPath = (takeId: string): string => `/v/${takeId}`;
/** The brand kit's address is the BRAND's, not a take's: each published
 *  version is a new take, and canonical_slots(brand_guide) says which one is
 *  current. Same shape as /p/[logoId]. */
export const canonicalKitPath = (brandId: string): string => `/k/${brandId}`;
