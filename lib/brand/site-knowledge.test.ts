import assert from "node:assert/strict";
import { test } from "node:test";
import type { SiteCapture, SiteProfile } from "@/lib/site/capture";
import { paletteKnowledge, siteKnowledge } from "./site-knowledge";

const AT = "2026-09-03T12:00:00.000Z";

function profile(overrides: Partial<SiteProfile> = {}): SiteProfile {
  return {
    typography: {
      headingWeight: "700",
      bodyWeight: "400",
      headingSize: "48px",
      bodySize: "16px",
      lineHeight: "1.75",
      letterSpacing: "normal",
      fontSources: ["https://fonts.googleapis.com/css2"],
    },
    tokens: {
      buttonWeight: "600",
      buttonShadow: "none",
      cardRadius: "12px",
      cardShadow: "none",
      borderWidth: "1px",
      borderColor: "#e5e5e5",
    },
    layout: {
      sections: [{ kind: "hero", heading: "はじめる", height: 640 }],
      navItems: ["製品", "料金"],
      heroKind: "gradient",
      ctaLabel: "無料で試す",
      density: 1.2,
    },
    site: {
      lang: "ja",
      darkMode: false,
      title: "Example",
      description: "説明",
      tagline: "はじめる",
    },
    contact: { telephone: "03-0000-0000", email: null, address: "東京都" },
    social: { x: "https://x.com/example" },
    copyright: "© 2026 Example",
    images: [],
    ...overrides,
  };
}

function capture(overrides: Partial<SiteCapture> = {}): SiteCapture {
  return {
    url: "https://example.com/",
    screenshots: { desktop: "", fullPage: null, mobile: null },
    evidence: {
      backgrounds: [],
      texts: [],
      borders: [],
      gradients: [],
      pixels: [],
      interactive: [],
      cssVars: [],
      logoColors: [],
    },
    logoImage: null,
    logoSvg: null,
    logoCandidates: [],
    designTokens: {
      body_font: "Inter",
      heading_font: "Inter",
      button_radius: "999px",
      button_padding: "12px 24px",
      section_spacing: "96px",
      container_width: "1200px",
    },
    profile: profile(),
    images: [],
    ...overrides,
  };
}

const paths = (fields: { field_path: string }[]) => fields.map((f) => f.field_path);

test("what a rule measured is adopted; what the page states is a claim", () => {
  const { adopt, claims } = siteKnowledge(capture(), AT);

  // Design decisions read off the rendered page become this brand's rules.
  assert.ok(paths(adopt).includes("typography.heading_font"));
  assert.ok(paths(adopt).includes("typography.line_height"));
  assert.ok(paths(adopt).includes("tokens.card_radius"));
  assert.ok(paths(adopt).includes("layout.hero_kind"));

  // Facts stay claims whatever their source: adopting one would stamp it
  // `confirmed`, and a crawl has confirmed nothing.
  assert.equal(paths(adopt).includes("contact.telephone"), false);
  assert.ok(paths(claims).includes("contact.telephone"));
  assert.ok(paths(claims).includes("social.x"));
  assert.ok(paths(claims).includes("identity.copyright"));
});

test("facts carry `evidenced` — stated, with a source, not verified", () => {
  const { claims } = siteKnowledge(capture(), AT);
  for (const claim of claims) {
    assert.equal(claim.layer, "fact");
    assert.equal(claim.confidence, "evidenced");
  }
});

test("nothing is invented for a page that says nothing", () => {
  const bare = capture({
    profile: profile({
      typography: {
        headingWeight: null,
        bodyWeight: null,
        headingSize: null,
        bodySize: null,
        lineHeight: null,
        letterSpacing: null,
        fontSources: [],
      },
      tokens: {
        buttonWeight: null,
        buttonShadow: null,
        cardRadius: null,
        cardShadow: null,
        borderWidth: null,
        borderColor: null,
      },
      contact: { telephone: null, email: null, address: null },
      social: {},
      copyright: null,
      layout: { sections: [], navItems: [], heroKind: null, ctaLabel: null, density: null },
      site: { lang: null, darkMode: null, title: null, description: null, tagline: null },
    }),
    designTokens: {
      body_font: null,
      heading_font: null,
      button_radius: null,
      button_padding: null,
      section_spacing: null,
      container_width: null,
    },
  });
  const { adopt, claims } = siteKnowledge(bare, AT);
  assert.deepEqual(adopt, []);
  // Only the two things that are true by virtue of the capture having happened.
  assert.deepEqual(paths(claims).sort(), ["contact.website", "site.captured_at"]);
});

test("a profile the in-page pass could not produce degrades to the tokens", () => {
  const { adopt, claims } = siteKnowledge(capture({ profile: null }), AT);
  assert.ok(paths(adopt).includes("typography.body_font"));
  assert.equal(paths(adopt).includes("tokens.card_radius"), false);
  assert.ok(paths(claims).includes("contact.website"));
});

test("a false darkMode is recorded, not dropped as falsy", () => {
  // null means 「測っていない」 and false means 「対応していない」; conflating
  // them is the mistake this codebase has made three times.
  const { claims } = siteKnowledge(capture(), AT);
  const dark = claims.find((claim) => claim.field_path === "site.dark_mode");
  assert.equal(dark?.value, false);

  const unmeasured = siteKnowledge(
    capture({ profile: profile({ site: { lang: "ja", darkMode: null, title: null, description: null, tagline: null } }) }),
    AT,
  );
  assert.equal(
    unmeasured.claims.some((claim) => claim.field_path === "site.dark_mode"),
    false,
  );
});

test("gradient stops need at least two colours to be a gradient", () => {
  const one = siteKnowledge(
    capture({
      evidence: { ...capture().evidence, gradients: [{ hex: "#ff0000", weight: 10 }] },
    }),
    AT,
  );
  assert.equal(paths(one.adopt).includes("palette.gradient"), false);

  const two = siteKnowledge(
    capture({
      evidence: {
        ...capture().evidence,
        gradients: [
          { hex: "#ff0000", weight: 10 },
          { hex: "#0000ff", weight: 8 },
        ],
      },
    }),
    AT,
  );
  const gradient = two.adopt.find((field) => field.field_path === "palette.gradient");
  assert.deepEqual(gradient?.value, ["#ff0000", "#0000ff"]);
});

test("an extracted palette is adopted; a generated one only suggested", () => {
  const extracted = paletteKnowledge({
    primary: "#123456",
    accent: "#abcdef",
    background: "#ffffff",
    text: "#101010",
    mode: "light",
    palette_source: "extracted",
  });
  assert.ok(paths(extracted.adopt).includes("palette.primary"));
  assert.equal(extracted.claims.length, 0);

  const generated = paletteKnowledge({
    primary: "#123456",
    accent: "#abcdef",
    palette_source: "generated",
  });
  assert.deepEqual(generated.adopt, []);
  for (const claim of generated.claims) {
    assert.equal(claim.layer, "expression");
    assert.equal(claim.confidence, "suggested");
  }
});

test("the character of a typeface is a judgement, never adopted", () => {
  const { adopt, claims } = paletteKnowledge({
    primary: "#123456",
    palette_source: "extracted",
    font_style: "geometric sans",
  });
  assert.equal(paths(adopt).includes("typography.font_style"), false);
  const style = claims.find((claim) => claim.field_path === "typography.font_style");
  assert.equal(style?.confidence, "suggested");
});
