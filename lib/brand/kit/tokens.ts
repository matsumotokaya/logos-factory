import { frameLabel } from "@/lib/brand/capture-frame";
import { isHex } from "@/lib/brand/profile";
import type { BrandKitBrief } from "./snapshot";

// tokens.json and tokens.css — the kit's values in the two shapes code takes
// them in. Pure: the same brief gives the same bytes, which is what makes the
// published file stable.

const PALETTE_ROLES = ["primary", "accent", "background", "surface", "text", "border"] as const;

export type KitTokens = {
  brand: { id: string; name: string; website: string };
  color: Record<string, string>;
  gradient: string[];
  typography: Record<string, string>;
  shape: Record<string, string>;
  layout: Record<string, unknown>;
  social: Record<string, string>;
  contact: Record<string, string>;
};

function stringValues(values: Record<string, unknown>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, value] of Object.entries(values)) {
    if (!path.startsWith(prefix)) continue;
    if (typeof value === "string" && value !== "") out[path.slice(prefix.length)] = value;
    else if (typeof value === "number") out[path.slice(prefix.length)] = String(value);
  }
  return out;
}

export function kitTokens(brief: BrandKitBrief): KitTokens {
  const values = brief.values;
  const color: Record<string, string> = {};
  for (const role of PALETTE_ROLES) {
    const hex = values[`palette.${role}`];
    if (isHex(hex)) color[role] = hex.toLowerCase();
  }
  const gradient = Array.isArray(values["palette.gradient"])
    ? (values["palette.gradient"] as unknown[]).filter(isHex).map((hex) => hex.toLowerCase())
    : [];
  const layout: Record<string, unknown> = {};
  for (const key of ["sections", "nav_items", "hero_kind", "cta_label", "density"]) {
    const value = values[`layout.${key}`];
    if (value !== undefined && value !== null && value !== "") layout[key] = value;
  }
  return {
    brand: { id: brief.brand.id, name: brief.brand.name, website: brief.brand.website },
    color,
    gradient,
    typography: stringValues(values, "typography."),
    shape: stringValues(values, "tokens."),
    layout,
    social: stringValues(values, "social."),
    contact: stringValues(values, "contact."),
  };
}

export function kitTokensJson(brief: BrandKitBrief): string {
  return `${JSON.stringify(kitTokens(brief), null, 2)}\n`;
}

const CSS_NAME: Record<string, string> = {
  heading_font: "font-heading",
  body_font: "font-body",
  heading_weight: "font-weight-heading",
  body_weight: "font-weight-body",
  heading_size: "font-size-heading",
  body_size: "font-size-body",
  line_height: "line-height-body",
  letter_spacing: "letter-spacing-heading",
  button_radius: "radius-button",
  button_padding: "padding-button",
  button_weight: "font-weight-button",
  button_shadow: "shadow-button",
  card_radius: "radius-card",
  card_shadow: "shadow-card",
  border_width: "border-width",
  section_spacing: "space-section",
  container_width: "width-container",
};

/** Custom properties on :root, with the frame's label as the comment. */
export function kitTokensCss(brief: BrandKitBrief): string {
  const tokens = kitTokens(brief);
  const lines: string[] = [`/* ${brief.brand.name} — brand tokens. Source: ${brief.brand.website || "logos"} */`, ":root {"];
  for (const [role, hex] of Object.entries(tokens.color)) {
    lines.push(`  --color-${role}: ${hex}; /* ${frameLabel(`palette.${role}`)} */`);
  }
  if (tokens.gradient.length > 1) {
    lines.push(`  --gradient-brand: linear-gradient(90deg, ${tokens.gradient.join(", ")});`);
  }
  for (const [key, value] of Object.entries(tokens.typography)) {
    const name = CSS_NAME[key];
    if (!name || key === "font_source" || key === "font_style") continue;
    lines.push(`  --${name}: ${value}; /* ${frameLabel(`typography.${key}`)} */`);
  }
  for (const [key, value] of Object.entries(tokens.shape)) {
    const name = CSS_NAME[key];
    if (!name) continue;
    lines.push(`  --${name}: ${value}; /* ${frameLabel(`tokens.${key}`)} */`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}
