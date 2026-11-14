import { z } from "zod";
import { BrandKitBriefSchema } from "@/lib/brand/kit/snapshot";

// The brand LP's brief: what the page says, the kit it was drawn from, and
// where each section's facts came from.
//
// The LP is the first deliverable made FROM the kit (docs/product.md §2), and
// it exists to show what the kit is missing. So the brief keeps three things
// apart that a page normally blends:
//
//   kit      the kit as it was read when the page was made. The renderer
//            takes colour, type, shape and the logo from here and nowhere
//            else — the same shape /k/[brandId] publishes.
//   content  the words on the page.
//   basis    per section, where the facts under those words came from:
//              kit        a value the kit carries (adopted or measured)
//              workspace  a reading the workspace holds but the kit does not
//                         publish yet (推定) — adopting it puts it in the kit
//              sample     neither had it; the frame filled it in
//
// Everything that is not `kit` is a gap in the kit, listed on the LP's page.
//
// No server-only imports: the detail screen reads these types.

export const LP_SECTIONS = ["hero", "overview", "features", "voices", "closing"] as const;
export type LpSection = (typeof LP_SECTIONS)[number];

export const LP_SECTION_LABEL: Record<LpSection, string> = {
  hero: "ヒーロー",
  overview: "概要",
  features: "特長",
  voices: "お客様の声",
  closing: "締めのCTA",
};

export const LP_ORIGINS = ["kit", "workspace", "sample"] as const;
export type LpOrigin = (typeof LP_ORIGINS)[number];

const BasisSchema = z.object({
  origin: z.enum(LP_ORIGINS),
  /** The fields the section's facts were read from. */
  paths: z.array(z.string()),
  /** Those of them the kit does not carry yet (推定). Adopting one puts it in the kit. */
  pending: z.array(z.string()),
  /** One plain sentence for the LP's page: what was used, or what was missing. */
  note: z.string(),
});
export type LpBasis = z.infer<typeof BasisSchema>;

export const LpContentSchema = z.object({
  hero: z.object({
    eyebrow: z.string(),
    /** May carry one "\n" where the line is meant to break. */
    headline: z.string(),
    sub: z.string(),
  }),
  overview: z.object({
    heading: z.string(),
    body: z.string(),
    points: z.array(z.string()).max(4),
  }),
  features: z.object({
    heading: z.string(),
    items: z.array(z.object({ title: z.string(), body: z.string() })).min(1).max(3),
  }),
  voices: z.object({
    heading: z.string(),
    items: z.array(z.object({ quote: z.string(), name: z.string(), role: z.string() })).max(3),
  }),
  closing: z.object({
    headline: z.string(),
    sub: z.string(),
  }),
  cta: z.object({
    label: z.string(),
    href: z.string(),
  }),
});
export type LpContent = z.infer<typeof LpContentSchema>;

export const BrandLpBriefSchema = z.object({
  version: z.literal(1),
  /** BCP 47 language of the page, from the site (`site.lang`). */
  lang: z.string(),
  kit: BrandKitBriefSchema,
  content: LpContentSchema,
  basis: z.object({
    hero: BasisSchema,
    overview: BasisSchema,
    features: BasisSchema,
    voices: BasisSchema,
    closing: BasisSchema,
  }),
  visuals: z.object({
    /** The site's own screen, shown in the hero. A brand material, not a kit file. */
    screen: z
      .object({
        materialId: z.string(),
        width: z.number().nullable(),
        height: z.number().nullable(),
      })
      .nullable(),
  }),
  /**
   * What the extract stage found: the brand's features and voices as they
   * stood when the page was made, before three were chosen. Absent on LPs
   * made before it was recorded.
   */
  read: z
    .object({
      features: z.array(z.object({ title: z.string(), description: z.string() })),
      voices: z.array(z.object({ quote: z.string(), name: z.string(), role: z.string() })),
    })
    .optional(),
  /** How the words were written: by the model, or by the frame alone. */
  writer: z.object({
    kind: z.enum(["model", "frame"]),
    model: z.string().nullable(),
    /** Why the frame wrote it, when the model was meant to. */
    note: z.string().nullable(),
  }),
});
export type BrandLpBrief = z.infer<typeof BrandLpBriefSchema>;

export function parseLpBrief(value: unknown): BrandLpBrief | null {
  const parsed = BrandLpBriefSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
