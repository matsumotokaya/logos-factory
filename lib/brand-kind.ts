import type { BrandKind } from "@/lib/campaign/classification";

/**
 * Every value brand_entities.brand_kind accepts (its CHECK constraint), in the
 * order the menu offers them. The kind is a label the user can change at any
 * time; it decides nothing about where a Brand sits in the tree.
 */
export const BRAND_KINDS = [
  "organization",
  "corporate",
  "business",
  "service",
  "product",
  "media",
  "event",
] as const satisfies readonly BrandKind[];

export const BRAND_KIND_LABEL: Record<BrandKind, string> = {
  organization: "組織",
  corporate: "企業",
  business: "事業",
  service: "サービス",
  product: "プロダクト",
  media: "メディア",
  event: "イベント",
};

export function isBrandKind(value: unknown): value is BrandKind {
  return typeof value === "string" && (BRAND_KINDS as readonly string[]).includes(value);
}
