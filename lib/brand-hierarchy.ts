export type BrandEntityKind =
  | "corporate"
  | "business"
  | "service"
  | "product"
  | "media"
  | "event"
  | "audience";
export type BrandRecordStatus = "inferred" | "confirmed" | "archived";

export type BrandAssetKind =
  | "logo"
  | "guideline"
  | "lp"
  | "narration"
  | "audio"
  | "video"
  | "banner"
  | "mockup"
  | "document"
  | "other";

export type BrandAssetSummary = {
  id: string;
  kind: BrandAssetKind;
  title: string;
  status: "pending" | "ready" | "failed" | "archived";
  publicPath: string | null;
  createdAt: string;
};

export type BrandLogoSummary = {
  id: string;
  title: string;
  role: string;
  visibility: string;
  subjectEntityId: string;
  subjectEntityName: string;
  inherited: boolean;
};

export type BrandSummary = {
  id: string;
  organizationId: string;
  parentBrandId: string | null;
  kind: BrandEntityKind;
  isPrimary: boolean;
  name: string;
  website: string;
  industry: string;
  description: string;
  status: BrandRecordStatus;
  primary: string | null;
  accent: string | null;
  fontStyle: string | null;
  logos: BrandLogoSummary[];
  logoIds: string[];
  assets: BrandAssetSummary[];
  /** Files in the brand's own library (brand_materials, scope=brand). */
  materialCount: number;
  /** Position in the workspace's list, the user's arrangement. */
  sortOrder: number;
  /** The workspace's main brand (organizations.main_brand_id). */
  isMain: boolean;
  /** The brand this one sits under (parentBrandId), by name. */
  parentName: string | null;
};

export type BrandOrganizationSummary = {
  id: string;
  name: string;
  organizationKind: "company" | "individual" | "nonprofit" | "other" | null;
  website: string;
  description: string;
  status: BrandRecordStatus;
  logos: BrandLogoSummary[];
  brands: BrandSummary[];
};
