// Campaign design themes — the parameterized template axis shared by every
// renderer. A theme is a creative direction (tone & manner) plus rendering
// parameters. Today it drives the LP template variant and biases the
// generated palette / copy tone; the same `direction` text is designed to be
// fed to the upcoming renderers (30s CM video, banners, BGM selection) so all
// assets of one campaign stay on the same tone.
//
// The chosen theme is stored on the Brand Kit (`kit.theme`), so it can be
// changed later and every asset re-rendered from the same kit.
//
// Plain data + pure functions only — imported from server routes, the LP
// renderer and client components alike.

export const CAMPAIGN_THEME_IDS = [
  "tech-glass",
  "minimal-light",
  "corporate-trust",
  "care-warm",
  "friendly-pop",
  "food-casual",
  "luxury-serif",
] as const;

export type CampaignThemeId = (typeof CAMPAIGN_THEME_IDS)[number];

export interface CampaignTheme {
  id: CampaignThemeId;
  /** Display name shown in UI (Japanese). */
  label: string;
  /** Industries this theme is intended for (docs / UI hint). */
  audience: string;
  /** Selection criteria — written for the LLM that assigns a theme. */
  selection: string;
  /**
   * Creative direction for ALL renderers (LP copy tone, narration voice,
   * and the future video / banner / BGM stages). Written as an instruction
   * to a creative team.
   */
  direction: string;
  /** LP rendering parameters. */
  lp: {
    /**
     * Which LP template renders this theme. The first three are separate
     * designs (own type system, own section structure), not skins:
     *
     *   "noir"      cinematic dark — US AI/robotics product page
     *   "lumen"     bright premium SaaS — trust-first, inverted closing band
     *   "editorial" ink & metal, serif — art / luxury / hospitality
     *   "glass"     dark frosted skin of the original flat template
     *   "flat"      the original light SaaS template
     */
    variant: "noir" | "lumen" | "editorial" | "glass" | "flat";
    /**
     * Hero-section background photo (public URL path + rgba scrim). The hero
     * renders white text over the dimmed photo; the rest of the page keeps
     * the template's own canvas. Absent = the template's CSS-only hero.
     * Current set: the curated abstract-glass photos in public/campaigns/bg/,
     * fixed per theme; dedicated per-theme shoots can replace them later.
     */
    heroBackground?: { src: string; scrim: string };
  };
}

export const CAMPAIGN_THEMES: Record<CampaignThemeId, CampaignTheme> = {
  "tech-glass": {
    id: "tech-glass",
    label: "テックグラス",
    audience: "SaaS・AI・開発者ツール・フィンテックなどの先進テック",
    selection:
      "テック系・ソフトウェア・AI・スタートアップ全般。先進性やスピード感を打ち出したいサービス",
    direction:
      "漆黒に近いキャンバスにブランドカラーがオーロラのように発光する、最先端AI企業の製品ページの世界観。巨大なタイポグラフィと英語のマイクロラベル、広い余白、精密なヘアライン。コピーは短く自信のある断定調。BGMはミニマルなエレクトロニカ、ナレーションは落ち着いた低めのトーン。",
    // The noir template is design-complete on its own canvas (aurora +
    // grain), so it takes no hero photo.
    lp: { variant: "noir" },
  },
  "minimal-light": {
    id: "minimal-light",
    label: "ミニマルライト",
    audience: "B2Bサービス全般・業務ツール（迷ったらこれ）",
    selection:
      "汎用のデフォルト。誠実さと分かりやすさを優先する業務サービス、または他のテーマに当てはまらない場合",
    direction:
      "白ベースのクリーンなSaaSスタイル。大きく詰めた見出しと細いヘアラインで構成し、ブランドカラーは要所だけに効かせる。最後は反転した黒帯で締めてコントラストを残す。コピーは丁寧で具体的、BGMは軽快なコーポレートポップ、ナレーションは明るく信頼感のあるトーン。",
    // The lumen template ships its own light canvas; no hero photo.
    lp: { variant: "lumen" },
  },
  "corporate-trust": {
    id: "corporate-trust",
    label: "コーポレートトラスト",
    audience: "金融・不動産・保険・士業・コンサルティング",
    selection:
      "信頼・実績・堅実さが第一の業種。金融、不動産、法務・会計、企業向けコンサルなど",
    direction:
      "ネイビーやチャコールを基調にした端正で構造的なデザイン。装飾を抑え、数字と実績を大きく見せる。コピーは敬体で堅実、誇張しない。BGMは弦楽やピアノの落ち着いた曲、ナレーションは重厚で信頼感のある声。",
    lp: { variant: "lumen" },
  },
  "care-warm": {
    id: "care-warm",
    label: "ケアウォーム",
    audience: "福祉・介護・医療・保育・教育",
    selection:
      "人に寄り添う業種。福祉、介護、医療・ヘルスケア、保育・教育、地域サービスなど",
    direction:
      "グリーンやオレンジなどのあたたかい中間色を、明るく清潔なホワイトキャンバスに乗せる。現代のヘルスケア・ウェルネスブランドの佇まいで、安心感と誠実さを最優先する。コピーはやわらかい語りかけ調。BGMはアコースティック、ナレーションはあたたかく穏やかなトーン。",
    lp: { variant: "lumen" },
  },
  "friendly-pop": {
    id: "friendly-pop",
    label: "フレンドリーポップ",
    audience: "コンシューマアプリ・コミュニティ・イベント",
    selection:
      "個人ユーザー向けの明るいサービス。コンシューマアプリ、コミュニティ、イベント、エンタメなど",
    direction:
      "明るい色数の多いポップな世界観。大きめの絵文字やイラスト的要素、角丸の大きいUI。コピーは口語でテンポよく、絵文字も許容。BGMはアップテンポなポップス、ナレーションは若く元気なトーン。",
    lp: { variant: "flat" },
  },
  "food-casual": {
    id: "food-casual",
    label: "フードカジュアル",
    audience: "大衆飲食・食品EC・小売",
    selection:
      "日常的な飲食・食品・小売。カフェ、定食、テイクアウト、食品EC、商店など(高級業態はluxury-serifへ)",
    direction:
      "食欲を誘う暖色（赤・オレンジ・ブラウン）を軸にした活気のあるデザイン。シズル感のある写真を主役に想定し、価格やメニューを大きく見せる。コピーは短く威勢よく。BGMは軽快で楽しい曲、ナレーションは親しみのある元気なトーン。",
    lp: { variant: "flat" },
  },
  "luxury-serif": {
    id: "luxury-serif",
    label: "ラグジュアリーセリフ",
    audience: "高級飲食・ホテル・美容・ジュエリー",
    selection:
      "高価格帯・上質さが価値の業態。高級レストラン、ホテル・旅館、美容、ジュエリー、ハイブランドなど",
    direction:
      "深い墨色の紙にアクセントカラーを金のように一色だけ差した、作品集のような静けさ。セリフ体（明朝体）を大きく細く組み、角丸も発光も使わず、罫線と余白だけで構成する。コピーは寡黙で詩的、説明しすぎない。BGMはジャズやクラシック、ナレーションはささやくように上品なトーン。",
    lp: { variant: "editorial" },
  },
};

/** Fallback for kits generated before themes existed (keeps their current look). */
export const DEFAULT_THEME_ID: CampaignThemeId = "minimal-light";

/**
 * Whether this theme's LP renders on a dark canvas. Consumers outside the LP
 * — the management preview frame, the CM video palette — must match the page
 * they sit next to, and "which variants are dark" is a fact about the
 * templates, so it is answered here rather than re-derived per call site.
 */
export function isDarkTheme(theme: CampaignTheme): boolean {
  const v = theme.lp.variant;
  return v === "noir" || v === "editorial" || v === "glass";
}

function isThemeId(v: unknown): v is CampaignThemeId {
  return (
    typeof v === "string" && (CAMPAIGN_THEME_IDS as readonly string[]).includes(v)
  );
}

/** Resolve a kit's theme, tolerating pre-theme kits and unknown values. */
export function resolveTheme(
  kit: { theme?: string | null } | null | undefined
): CampaignTheme {
  const id = kit?.theme;
  return CAMPAIGN_THEMES[isThemeId(id) ? id : DEFAULT_THEME_ID];
}

/** The theme catalog as prompt text for the LLM's theme assignment. */
export function describeThemesForPrompt(): string {
  const lines = CAMPAIGN_THEME_IDS.map((id) => {
    const t = CAMPAIGN_THEMES[id];
    return `- ${t.id}: ${t.selection}。方向性: ${t.direction}`;
  });
  return `# Design theme catalog (choose exactly one id for \`theme\`)\n${lines.join("\n")}`;
}
