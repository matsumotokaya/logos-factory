import type { SiteCapture } from "@/lib/campaign/capture";
import type { AdoptKnowledgeField, AppendKnowledgeField } from "@/lib/brand/knowledge";

/**
 * Turn one site capture into brand knowledge.
 *
 * The split this module exists to make is between **what a rule measured** and
 * **what a model proposed**, because the product has been showing them as the
 * same thing and they are not:
 *
 *   measured   the rendered page said so. A computed style, a declared phone
 *              number, an actual font family. Deterministic, re-runnable, and
 *              — for design decisions — good enough to become this brand's
 *              rule without asking. Adopted (§17.6 precedent: the re-import
 *              path has always adopted url_extraction palette and tokens).
 *
 *   proposed   a model's reading. A palette invented because Chromium was not
 *              available, a font character judged from screenshots. Recorded
 *              as a claim with its confidence and shown as 推定 — never
 *              adopted, because adopting it would state that this IS the
 *              brand's colour when nobody has decided that.
 *
 * Facts are never adopted whatever their source. `adopt_brand_knowledge` stamps
 * a fact `confirmed`, and a crawl has not confirmed a company's phone number —
 * it has only read it off a page. Facts come back as claims with confidence
 * `evidenced`, which is exactly what they are: stated, with a source.
 *
 * Nothing is filled in. A field the page does not carry is simply absent from
 * both lists, and the brand page renders it as まだわからない.
 */

export interface SiteKnowledge {
  /** Design decisions a rule measured — safe to become this brand's values. */
  adopt: AdoptKnowledgeField[];
  /** Everything read off the page as a statement, with its source. */
  claims: AppendKnowledgeField[];
}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/**
 * Build the knowledge one capture yields.
 *
 * `capturedAt` is passed in rather than read from the clock so that the same
 * capture produces the same knowledge twice — the append path de-duplicates on
 * (source_kind, source_ref, field_path), and a moving timestamp inside the
 * value would defeat nothing but would make two runs look different for no
 * reason.
 */
export function siteKnowledge(
  capture: SiteCapture,
  capturedAt: string,
): SiteKnowledge {
  const adopt: AdoptKnowledgeField[] = [];
  const claims: AppendKnowledgeField[] = [];

  const measured = (path: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    adopt.push({ field_path: path, layer: "expression", value });
  };
  const stated = (path: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    claims.push({
      field_path: path,
      layer: "fact",
      value,
      // The page says so and we can point at where. Not `confirmed` — nobody
      // has checked it against the world (§4.1).
      confidence: "evidenced",
    });
  };

  const profile = capture.profile;

  // ---- type: family, weight, scale, and where the faces come from ----------
  measured("typography.heading_font", capture.designTokens.heading_font);
  measured("typography.body_font", capture.designTokens.body_font);
  if (profile) {
    measured("typography.heading_weight", profile.typography.headingWeight);
    measured("typography.body_weight", profile.typography.bodyWeight);
    measured("typography.heading_size", profile.typography.headingSize);
    measured("typography.body_size", profile.typography.bodySize);
    measured("typography.line_height", profile.typography.lineHeight);
    measured("typography.letter_spacing", profile.typography.letterSpacing);
    if (profile.typography.fontSources.length > 0) {
      measured("typography.font_source", profile.typography.fontSources);
    }
  }

  // ---- shape ---------------------------------------------------------------
  measured("tokens.button_radius", capture.designTokens.button_radius);
  measured("tokens.button_padding", capture.designTokens.button_padding);
  measured("tokens.section_spacing", capture.designTokens.section_spacing);
  measured("tokens.container_width", capture.designTokens.container_width);
  if (profile) {
    measured("tokens.button_weight", profile.tokens.buttonWeight);
    measured("tokens.button_shadow", profile.tokens.buttonShadow);
    measured("tokens.card_radius", profile.tokens.cardRadius);
    measured("tokens.card_shadow", profile.tokens.cardShadow);
    measured("tokens.border_width", profile.tokens.borderWidth);
    measured("palette.border", profile.tokens.borderColor);
  }

  // The hero's gradient stops, which no role in the five-colour palette holds
  // and which is exactly what a template needs to open on the same wash.
  const gradient = (capture.evidence.gradients ?? [])
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((stop) => stop.hex);
  if (gradient.length >= 2) measured("palette.gradient", gradient);

  // ---- structure -----------------------------------------------------------
  if (profile) {
    if (profile.layout.sections.length > 0) {
      measured(
        "layout.sections",
        profile.layout.sections.map((section) => ({
          kind: section.kind,
          heading: section.heading,
        })),
      );
    }
    measured("layout.hero_kind", profile.layout.heroKind);
    measured("layout.density", profile.layout.density);
    if (profile.layout.navItems.length > 0) {
      stated("layout.nav_items", profile.layout.navItems);
    }
    stated("layout.cta_label", text(profile.layout.ctaLabel));

    // ---- who they are and how to reach them --------------------------------
    stated("identity.copyright", text(profile.copyright));
    stated("contact.telephone", text(profile.contact.telephone));
    stated("contact.email", text(profile.contact.email));
    stated("contact.address", text(profile.contact.address));
    for (const [network, url] of Object.entries(profile.social)) {
      stated(`social.${network}`, text(url));
    }

    // ---- the page itself ---------------------------------------------------
    stated("site.lang", text(profile.site.lang));
    stated("site.page_title", text(profile.site.title));
    if (profile.site.darkMode !== null) {
      stated("site.dark_mode", profile.site.darkMode);
    }
    stated("voice.tagline", text(profile.site.tagline));
  }

  stated("contact.website", capture.url);
  stated("site.captured_at", capturedAt);
  if (capture.images.length > 0) stated("imagery.count", capture.images.length);

  return { adopt, claims };
}

/**
 * The palette, split the same way.
 *
 * Kept separate from the rest because the palette is the one design decision
 * that has two possible origins in the same shape: `palette_source` says
 * whether these five colours were read off the rendered page (a VLM chose
 * among deterministic candidates, choose-only) or invented by the model
 * because there was no page to read. The first is measured, the second is not,
 * and until now both were written identically.
 */
export function paletteKnowledge(brand: {
  primary?: string | null;
  accent?: string | null;
  background?: string | null;
  surface?: string | null;
  text?: string | null;
  mode?: string | null;
  palette_source?: string | null;
  font_style?: string | null;
}): SiteKnowledge {
  const extracted = brand.palette_source === "extracted";
  const fields: Array<[string, unknown]> = [
    ["palette.primary", brand.primary],
    ["palette.accent", brand.accent],
    ["palette.background", brand.background],
    ["palette.surface", brand.surface],
    ["palette.text", brand.text],
    ["palette.mode", brand.mode],
    ["palette.source", brand.palette_source],
  ];
  const adopt: AdoptKnowledgeField[] = [];
  const claims: AppendKnowledgeField[] = [];
  for (const [path, value] of fields) {
    if (value === null || value === undefined || value === "") continue;
    if (extracted) adopt.push({ field_path: path, layer: "expression", value });
    else
      claims.push({
        field_path: path,
        layer: "expression",
        value,
        confidence: "suggested",
      });
  }
  // The character of the type is always a judgement — there is no computed
  // style for 「明朝の落ち着き」 — so it stays a suggestion whatever else happened.
  if (brand.font_style) {
    claims.push({
      field_path: "typography.font_style",
      layer: "expression",
      value: brand.font_style,
      confidence: "suggested",
    });
  }
  return { adopt, claims };
}
