import { z } from "zod";
import { CAMPAIGN_THEME_IDS } from "./themes";

// Service Brand Kit — the intermediate representation of Campaign Lab.
// Produced once from minimal inputs (URL / files / pasted text), then
// consumed by every renderer: LP, promo video (CM), SNS assets.
// Ported from the cm-maker Phase 0 pipeline.

export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "hex color like #ff7a18");

export const BrandSchema = z.object({
  primary: HexColor.describe("Primary brand color"),
  accent: HexColor.describe("Accent color, contrasting with primary"),
  background: HexColor.describe("Page background color"),
  surface: HexColor.describe(
    "Card/surface color, slightly offset from background",
  ),
  text: HexColor.describe("Main text color, readable on background"),
  palette_source: z
    .enum(["extracted", "generated"])
    .describe(
      "'extracted' when every color was chosen from evidence collected on the real site; 'generated' when the palette is an AI proposal without site evidence",
    ),
  mode: z.enum(["light", "dark"]).describe("Overall theme mode"),
  font_style: z
    .enum(["modern-sans", "elegant-serif", "tech-mono", "rounded-friendly"])
    .describe("Typography direction matching the service personality"),
});

export const FeatureSchema = z.object({
  title: z.string().describe("Short feature name (<= 20 chars in Japanese)"),
  description: z.string().describe("1-2 sentence benefit-oriented description"),
  emoji: z.string().describe("Single emoji representing this feature"),
});

export const StepSchema = z.object({
  title: z.string(),
  description: z.string(),
});

// Placeholder-friendly sections: a full SaaS-style sales page needs social
// proof, testimonials, pricing and FAQ even when the sources say nothing
// about them. These are generated as PLAUSIBLE FICTION (clearly generic, no
// real company names) and the renderer labels them as sample content the
// user should replace — the input-completion philosophy: scraped/generated
// values are 仮情報 that the user later overwrites with facts.

export const StatSchema = z.object({
  value: z.string().describe('Short display value, e.g. "3分", "92%", "500+"'),
  label: z
    .string()
    .describe("What the value measures, <= 12 chars in Japanese"),
});

export const TestimonialSchema = z.object({
  quote: z.string().describe("1-2 sentence customer quote in Japanese"),
  name: z.string().describe('Fictional Japanese name, e.g. "田中 美咲"'),
  role: z
    .string()
    .describe(
      'Fictional role + company type, e.g. "マーケティング責任者 / SaaS企業"',
    ),
});

export const PricingPlanSchema = z.object({
  name: z.string().describe('Plan name, e.g. "Free", "Pro"'),
  price: z.string().describe('Display price, e.g. "¥0", "¥9,800"'),
  period: z
    .string()
    .describe('Billing period suffix, e.g. "/月". Empty string if none'),
  description: z.string().describe("One sentence: who this plan is for"),
  features: z.array(z.string()).min(3).max(5),
  highlighted: z.boolean().describe("true for exactly one recommended plan"),
  cta_label: z.string(),
});

export const FaqItemSchema = z.object({
  q: z.string(),
  a: z.string().describe("2-3 sentence answer, reassuring tone"),
});

export const CopySchema = z.object({
  hero: z.object({
    headline: z.string().describe("Punchy headline, <= 30 chars in Japanese"),
    subheadline: z
      .string()
      .describe("1-2 sentences expanding the value proposition"),
    cta_label: z.string().describe("CTA button label, e.g. 無料で始める"),
  }),
  problem: z.object({
    headline: z
      .string()
      .describe("Headline naming the pain the audience feels"),
    points: z.array(z.string()).min(2).max(4).describe("Concrete pain points"),
  }),
  features: z.array(FeatureSchema).min(3).max(4),
  how_it_works: z.object({
    headline: z.string(),
    steps: z.array(StepSchema).min(2).max(4),
  }),
  proof: z.object({
    stats: z
      .array(StatSchema)
      .min(3)
      .max(3)
      .describe("3 headline metrics. Plausible fiction when sources have none"),
    client_names: z
      .array(z.string())
      .min(4)
      .max(6)
      .describe(
        "Fictional client/brand names for the logo row (katakana or English coined words, never real companies)",
      ),
  }),
  testimonials: z.array(TestimonialSchema).min(2).max(3),
  pricing: z.object({
    headline: z.string().describe('e.g. "シンプルな料金プラン"'),
    plans: z.array(PricingPlanSchema).min(2).max(3),
  }),
  faq: z.array(FaqItemSchema).min(3).max(5),
  closing: z.object({
    headline: z.string().describe("Final push headline"),
    subtext: z.string(),
    cta_label: z.string(),
  }),
});

// 30-second CM script, structured as ordered scenes so the video renderer,
// TTS sectioning, captions and scene transitions are all driven by the same
// single source. One scene = one TTS section = one visual sequence.
export const CM_SCENE_ROLES = [
  "hook",
  "problem",
  "solution",
  "features",
  "cta",
] as const;

export const OrganizationSchema = z.object({
  name: z
    .string()
    .describe(
      "Legal or commonly used name of the company/person operating the service",
    ),
  organization_kind: z
    .enum(["company", "individual", "nonprofit", "other"])
    .describe("Real-world operator type, not the service account/workspace"),
  website: z
    .string()
    .nullable()
    .describe("Corporate/operator website when evidenced, else null"),
  description: z
    .string()
    .describe("Short factual description grounded in source material"),
  relationship: z
    .enum(["same_identity", "operated_by", "parent_group", "unknown"])
    .describe("How the service relates to this organization"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Confidence based on footer, legal notice, JSON-LD, or source documents",
    ),
  evidence: z
    .string()
    .nullable()
    .describe(
      "Short source-grounded reason for the operator inference, else null",
    ),
});

export const BRAND_SUBJECT_KINDS = [
  "corporate",
  "business",
  "service",
  "product",
  "media",
  "event",
] as const;

export const SubjectClassificationSchema = z.object({
  brand_kind: z
    .enum(BRAND_SUBJECT_KINDS)
    .describe("The closest market-facing subject category"),
  placement: z
    .enum(["brand", "work"])
    .describe(
      "brand for a continuing independent identity; work for a one-off subject without its own continuing identity",
    ),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z
    .string()
    .describe(
      "Short source-grounded reason for this classification in Japanese",
    ),
});

export const CmSceneSchema = z.object({
  role: z
    .enum(CM_SCENE_ROLES)
    .describe(
      "Scene role in the problem-solution CM template. Must appear exactly once each, in order: hook, problem, solution, features, cta",
    ),
  text: z
    .string()
    .describe(
      "Exactly the words the voice actor reads aloud in this scene, in Japanese. No headings, no stage directions, no markdown.",
    ),
});

export type CmScene = z.infer<typeof CmSceneSchema>;

export const BrandKitSchema = z.object({
  organization: OrganizationSchema,
  classification: SubjectClassificationSchema,
  service: z.object({
    name: z.string(),
    tagline: z.string().describe("<= 25 chars, appears next to the logo"),
    description: z
      .string()
      .describe("2-3 sentence neutral description of the service"),
    industry: z
      .string()
      .describe(
        "業種・産業を日本語の一言で (e.g. 不動産テック, 生成AI基盤, 飲食（カフェ）, 会計SaaS)",
      ),
    business_type: z
      .enum([
        "saas",
        "app",
        "web_service",
        "ecommerce",
        "media",
        "consulting",
        "agency",
        "restaurant",
        "retail",
        "local_service",
        "freelance",
        "community",
        "tool",
        "other",
      ])
      .describe(
        "What kind of business this is — used for template/BGM selection. saas=B2B/B2C SaaS, app=consumer app, consulting=advisory, agency=client-work studio, restaurant/retail/local_service=physical business, freelance=individual professional",
      ),
    offering: z
      .string()
      .describe(
        "主に何を提供しているか、1文の日本語で (analysis result, not marketing copy)",
      ),
    audience: z.string().describe("Primary target audience in one phrase"),
    url: z.string().nullable().describe("Service URL if known, else null"),
  }),
  theme: z
    .enum(CAMPAIGN_THEME_IDS)
    .describe(
      "Design theme id for ALL renderers (LP / video / banners). Choose from the theme catalog in the prompt by industry, business_type and brand personality. Stored on the kit so it can be changed later.",
    ),
  brand: BrandSchema,
  copy: CopySchema,
  cm_script: z
    .array(CmSceneSchema)
    .min(5)
    .max(5)
    .describe(
      "30-second CM narration as 5 scenes in fixed order (hook → problem → solution → features → cta), ~180-260 Japanese characters in total. problem echoes copy.problem.points; features echoes copy.features titles; cta ends with a clear action.",
    ),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;
export type Brand = z.infer<typeof BrandSchema>;

// ---------- deterministic parts merged in by the pipeline (not LLM output) ----------

/** Visual assets collected from the real site (Stage 1 capture / ingest). */
export interface CampaignScreenAsset {
  /** How this screen entered the campaign. More sources can be added without
   * changing the device-mockup renderers. */
  source: "capture" | "upload" | "generated";
  data: string;
  media_type: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
}

export interface BrandAssets {
  /** Header logo element screenshot (or favicon fallback), base64 PNG. */
  logo: { data: string; media_type: "image/png" } | null;
  /** Inline-SVG logo with computed fills baked in (vector master), when the
   *  site's logo was an inline <svg>. Absent on records from before 2026-07-20. */
  logo_svg?: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  source_url: string | null;
  /** Product screens are stored independently from their laptop/phone frame.
   * This lets HTML/SVG, Blender and future GLB renderers consume the same
   * canonical screen image. Absent on records created before mockup v1. */
  screens?: {
    desktop: CampaignScreenAsset | null;
    mobile: CampaignScreenAsset | null;
  };
}

/** Best-effort design guideline hints read from computed CSS. */
export interface DesignTokens {
  body_font: string | null;
  heading_font: string | null;
  button_radius: string | null;
  button_padding: string | null;
  /** typical vertical padding of top-level sections (余白のルールの近似) */
  section_spacing: string | null;
  container_width: string | null;
}

/** The full portable artifact: LLM-generated kit + deterministic evidence. */
export type CampaignBrandKit = Omit<
  BrandKit,
  "theme" | "cm_script" | "organization" | "classification"
> & {
  /** Optional only for compatibility with kits generated before the
   * organization/business hierarchy was introduced. */
  organization?: BrandKit["organization"];
  /** Absent on kits generated before automatic subject classification. */
  classification?: BrandKit["classification"];
  /** Absent on kits stored before themes existed; resolveTheme() falls back. */
  theme?: BrandKit["theme"];
  /** Absent on kits stored before the structured CM script (2026-07-20).
   *  Old kits must be re-generated before the video renderer can run. */
  cm_script?: CmScene[];
  /** Flat narration text, derived from cm_script by the pipeline (kept for
   *  display / narration.txt; old kits stored it as the LLM output itself). */
  narration: string;
  assets: BrandAssets | null;
  design_tokens: DesignTokens | null;
};

/** Join the scene texts into the flat display / TTS-preview narration. */
export function narrationTextFromScript(scenes: CmScene[]): string {
  return scenes.map((s) => s.text.trim()).join("");
}

// ---------- progressive partials (accumulate while a run is in flight) ----------

/**
 * Intermediate artifacts a generation run publishes as soon as each stage
 * finishes, so the UI fills the result layout piece by piece instead of all
 * at once. Everything here is superseded by the final kit; the job store
 * drops it on completion.
 */
export interface CampaignPartial {
  /** Stage 1a ingest: page meta — the first thing on screen (~5s). */
  source?: {
    title: string | null;
    description: string | null;
    url: string;
    favicon_url: string | null;
  };
  /** Stage 1b capture: the real logo (~20s). */
  logo?: {
    logo: { data: string; media_type: "image/png" } | null;
    logo_svg: string | null;
  };
  design_tokens?: DesignTokens;
  /** Stage 2: role-less evidence colors (~30s). */
  palette_candidates?: string[];
  /** Stage 3a adjudication: the five roles, fixed (~50s). */
  palette?: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
}
