import { createHash } from "node:crypto";
import { z } from "zod";

// The brand kit's brief: the brand, frozen.
//
// A published kit must not change under the URL that was handed out, so the
// publish step copies everything the kit page needs into the take's brief —
// the brand row's own fields, every ADOPTED knowledge value (claims are left
// out: docs/product.md §2.1), the logos with their vector masters, and the key
// visual's address. The public route reads this and nothing live.
//
// Shared by the server (building and publishing) and the browser (the kit
// view draws from the same shape), so this file carries no server-only
// imports. The hash is what tells the workspace 「更新あり」: the draft
// snapshot's hash differs from the live take's.

export const KIT_LOGO_SVG_MAX_BYTES = 512 * 1024;

export const BrandKitBriefSchema = z.object({
  version: z.literal(1),
  snapshotAt: z.string(),
  brand: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.string(),
    description: z.string(),
    industry: z.string(),
    location: z.string(),
    website: z.string(),
  }),
  /** field_path → adopted value. Only values; a claim is not a rule. */
  values: z.record(z.string(), z.unknown()),
  logos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      role: z.string(),
      /** The vector master inline, when it is one and small enough to carry. */
      svg: z.string().nullable(),
      mediaType: z.string().nullable(),
      /** R2 key of a raster master, for /k/[id]/logo-<n>.<ext>. */
      r2Key: z.string().nullable(),
    }),
  ),
  keyVisual: z
    .object({
      materialId: z.string(),
      r2Key: z.string(),
      mediaType: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    })
    .nullable(),
});

export type BrandKitBrief = z.infer<typeof BrandKitBriefSchema>;

/** Stable JSON: keys sorted at every level, so the same brand hashes the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/**
 * What makes two snapshots the same kit. `snapshotAt` is left out — it is when
 * the copy was taken, not what it says.
 */
export function kitContentHash(brief: BrandKitBrief): string {
  const content: Record<string, unknown> = { ...brief };
  delete content.snapshotAt;
  return createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
}

export function parseKitBrief(value: unknown): BrandKitBrief | null {
  const parsed = BrandKitBriefSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
