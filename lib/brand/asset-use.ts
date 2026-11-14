// What an image from the brand's site is FOR the brand — the judgement a
// person makes looking at it, not what the DOM said about where it sat.
//
// A site carries two kinds of picture. Some are the brand's own assets: the
// hero's texture, the product on a device, the logo, the illustration set,
// the faces of the people who run it. Most of the rest only happened to be on
// the page: a news thumbnail, a campaign banner, a blog post's photo. They
// were filed alike, and the brand page showed article photos as brand
// material while the team page's portraits were left out (owner, 2026-11-14).
//
// The vision model sorts them (classify-site-images.ts) into `uses`, and each
// use belongs to a tier:
//
//   core       the brand's own assets — shown first, used by deliverables
//   possible   pictures that were on the site but are not the brand's assets;
//              shown last, folded, and a person ticks the ones worth keeping
//
// No server-only imports: the brand page groups by these.

export const ASSET_USES = [
  "keyvisual",
  "texture",
  "product",
  "illustration",
  "icon",
  "leadership",
  "team",
  "place",
  "editorial",
  "campaign",
  "partner",
  "decoration",
  "other",
] as const;
export type AssetUse = (typeof ASSET_USES)[number];

export type AssetTier = "core" | "possible";

export const ASSET_USE: Record<AssetUse, { label: string; hint: string; tier: AssetTier; category: string }> = {
  keyvisual: { label: "キービジュアル・ヒーロー", hint: "ヒーローやOGPの主役の絵", tier: "core", category: "graphic" },
  texture: { label: "背景・テクスチャ", hint: "地紋・グラデーション・背景の質感", tier: "core", category: "texture" },
  product: { label: "プロダクト", hint: "製品の写真、画面、デバイスのモックアップ", tier: "core", category: "product" },
  illustration: { label: "イラスト", hint: "ブランドのタッチで描かれた絵", tier: "core", category: "graphic" },
  icon: { label: "アイコン", hint: "そろいのアイコン・ピクトグラム", tier: "core", category: "mark" },
  leadership: { label: "経営陣", hint: "代表・役員の写真", tier: "core", category: "person" },
  team: { label: "メンバー・社員", hint: "社員・チームの写真", tier: "core", category: "person" },
  place: { label: "オフィス・場所", hint: "オフィスや拠点、店舗", tier: "core", category: "place" },
  editorial: { label: "記事・お知らせ", hint: "ニュース・ブログ・コラムのサムネイル", tier: "possible", category: "other" },
  campaign: { label: "キャンペーン・バナー", hint: "期間限定の告知やバナー", tier: "possible", category: "graphic" },
  partner: { label: "提携先・導入企業のロゴ", hint: "取引先・提携先・メディア掲載などの他社ロゴ", tier: "possible", category: "mark" },
  decoration: { label: "汎用の写真", hint: "ストックフォトなど、ブランド固有ではない写真", tier: "possible", category: "scenery" },
  other: { label: "その他", hint: "どれにも当てはまらないもの", tier: "possible", category: "other" },
};

/** The order core groups are shown in. */
export const CORE_USES: AssetUse[] = ["keyvisual", "product", "texture", "illustration", "icon", "leadership", "team", "place"];

export const isAssetUse = (value: unknown): value is AssetUse =>
  typeof value === "string" && (ASSET_USES as readonly string[]).includes(value);

/** The judgement as stored on a material (provenance.asset). */
export type AssetJudgement = {
  use: AssetUse;
  /** One short sentence: what is in it, and why it is (not) the brand's. */
  note: string;
  /** A person ticked it as worth keeping (only meaningful for `possible`). */
  picked?: boolean;
  model: string;
  at: string;
};

export function readJudgement(provenance: unknown): AssetJudgement | null {
  const asset = (provenance as Record<string, unknown> | null)?.asset as Record<string, unknown> | undefined;
  if (!asset || !isAssetUse(asset.use)) return null;
  return {
    use: asset.use,
    note: typeof asset.note === "string" ? asset.note : "",
    picked: asset.picked === true,
    model: typeof asset.model === "string" ? asset.model : "",
    at: typeof asset.at === "string" ? asset.at : "",
  };
}

/** Whether the brand treats it as its own: a core use, or a possible one a person picked. */
export const isBrandAsset = (judgement: AssetJudgement | null): boolean =>
  judgement !== null && (ASSET_USE[judgement.use].tier === "core" || judgement.picked === true);
