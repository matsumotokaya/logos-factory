import { z } from "zod";
import { EventCmBriefSchema } from "@/remotion/event-cm/brief-schema";
import { BrandKitBriefSchema } from "@/lib/brand/kit/snapshot";

// The brief schema of each template — the shape of the data that template needs.
//
// This is the "template-driven data collection" of the pivot made concrete: the
// schema decides what the collect/extract/structure stages have to produce, and
// a take stores the version it was validated against so a later schema change
// cannot retroactively invalidate what was already gathered.
//
// Kept apart from catalog.ts so client components can read template metadata
// without pulling zod and every schema into the browser bundle.

const LogoPresentationBriefSchema = z.object({
  logoId: z.string().min(1),
  presentation: z.object({
    catchphrase: z.string(),
    story: z.string(),
    sceneTexts: z.record(z.string(), z.object({ lead: z.string().optional() })),
    layout: z.object({
      version: z.literal(1),
      mappings: z.array(
        z.object({
          assetId: z.string(),
          placementId: z.enum([
            "splash.hero",
            "web.device",
            "social.primary",
            "onsite.primary",
            "merch.primary",
            "generated.tile",
          ]),
          order: z.number().finite(),
          enabled: z.boolean(),
          params: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
    }),
    updatedAt: z.string(),
  }),
});

export const BRIEF_SCHEMAS: Record<string, z.ZodType<unknown>> = {
  "brand-kit": BrandKitBriefSchema,
  "logo-presentation": LogoPresentationBriefSchema,
  "event-cm": EventCmBriefSchema,
};

export const briefSchema = (templateId: string): z.ZodType<unknown> | null =>
  BRIEF_SCHEMAS[templateId] ?? null;

export type BriefValidation =
  | { ok: true; brief: unknown }
  | { ok: false; issues: string[] };

/** Validate a brief against its template. Shape only — see brief-schema.ts on
 *  why an empty fact is not a validation failure. */
export function validateBrief(templateId: string, brief: unknown): BriefValidation {
  const schema = briefSchema(templateId);
  if (!schema) return { ok: false, issues: [`unknown template: ${templateId}`] };
  const parsed = schema.safeParse(brief);
  if (parsed.success) return { ok: true, brief: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
