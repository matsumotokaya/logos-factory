/**
 * THE FRAME — everything the product tries to learn from a brand's website.
 *
 * One ledger, because the alternative is what we had: the extractor knew about
 * a few colours, the goal list knew about a slightly different few, the brand
 * page's label map knew about a third set, and nothing anywhere said what the
 * product was *trying* to find. Adding a row here raises the bar everywhere at
 * once — the pipeline reports it missing, the brand page names it, and the
 * extractor has a new thing to go get (§17.1, §17.8).
 *
 * Two axes decide where an observation goes (asset-normalization §5):
 *
 *   INFORMATION (this file)  something you READ — a colour, a font name, a
 *                            phone number. Stored as brand_knowledge claims,
 *                            and adopted as values when a rule measured it.
 *   FILES (MATERIAL_SLOTS)   something you OPEN — a screenshot, a key visual,
 *                            a texture. Stored in R2 + brand_materials.
 *
 * `layer` follows §4.1 strictly. A `fact` is something the page states about
 * the world (a phone number, a company name) and may never come from
 * llm_generation. An `expression` is a design judgement (a colour, a radius).
 * Nothing in this ledger may be invented: a field with no evidence stays
 * missing, and the brand page says まだわからない rather than guessing.
 */

/** How a field is obtained. Rules first; the model only where a rule cannot see (AGENTS.md). */
export type CaptureMethod =
  /** measured off the rendered page or the HTML — deterministic, repeatable */
  | "rule"
  /** a vision model looking at what was captured, choosing from what is there */
  | "vlm"
  /** a language model structuring text the page actually contains */
  | "llm";

export interface CaptureField {
  /** brand_knowledge field_path. Must match ^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$ */
  path: string;
  label: string;
  layer: "fact" | "expression";
  method: CaptureMethod;
  /** Part of the goal a brand is measured against; false = improves it. */
  required: boolean;
  /** What a deliverable does with this. Also the reason the row exists. */
  useFor: string;
}

/**
 * Colour. The five roles a renderer needs, plus the evidence of how they were
 * decided — `palette.source` is the difference between "we measured this site"
 * and "a model proposed it", and the brand page must not show those the same.
 */
const PALETTE: CaptureField[] = [
  { path: "palette.primary", label: "プライマリカラー", layer: "expression", method: "rule", required: true, useFor: "LPの主要ボタン・動画のマーク面・バナーの地" },
  { path: "palette.accent", label: "アクセントカラー", layer: "expression", method: "rule", required: true, useFor: "強調・リンク・第2CTA" },
  { path: "palette.background", label: "背景色", layer: "expression", method: "rule", required: true, useFor: "LP・動画の地の色" },
  { path: "palette.surface", label: "面の色", layer: "expression", method: "rule", required: false, useFor: "カード・パネルの面" },
  { path: "palette.text", label: "文字色", layer: "expression", method: "rule", required: true, useFor: "本文・字幕" },
  { path: "palette.mode", label: "明暗", layer: "expression", method: "rule", required: false, useFor: "テンプレートの明暗の選択" },
  { path: "palette.border", label: "罫線の色", layer: "expression", method: "rule", required: false, useFor: "区切り線・カードの縁" },
  { path: "palette.gradient", label: "グラデーション", layer: "expression", method: "rule", required: false, useFor: "ヒーローの地・動画の背景" },
  { path: "palette.source", label: "パレットの出所", layer: "expression", method: "rule", required: false, useFor: "実測か提案かの区別（表示の確度）" },
];

/**
 * Type. The two family names were all we took, which is why generated pages
 * felt like the site "in the wrong size" — the scale and weight carry as much
 * of a brand's voice as the family does.
 */
const TYPOGRAPHY: CaptureField[] = [
  { path: "typography.heading_font", label: "見出し書体", layer: "expression", method: "rule", required: true, useFor: "LP見出し・動画のタイトル" },
  { path: "typography.body_font", label: "本文書体", layer: "expression", method: "rule", required: true, useFor: "本文・字幕" },
  { path: "typography.font_style", label: "書体の性格", layer: "expression", method: "llm", required: false, useFor: "書体が手に入らないときの代替選び" },
  { path: "typography.heading_weight", label: "見出しの太さ", layer: "expression", method: "rule", required: false, useFor: "見出しの再現" },
  { path: "typography.body_weight", label: "本文の太さ", layer: "expression", method: "rule", required: false, useFor: "本文の再現" },
  { path: "typography.heading_size", label: "見出しの大きさ", layer: "expression", method: "rule", required: false, useFor: "見出しと本文の比（版面の印象）" },
  { path: "typography.body_size", label: "本文の大きさ", layer: "expression", method: "rule", required: false, useFor: "本文の再現・字幕の基準" },
  { path: "typography.line_height", label: "行送り", layer: "expression", method: "rule", required: false, useFor: "組みの密度" },
  { path: "typography.letter_spacing", label: "字間", layer: "expression", method: "rule", required: false, useFor: "見出しの締まり" },
  { path: "typography.font_source", label: "書体の入手先", layer: "expression", method: "rule", required: false, useFor: "同じ書体を実際に読み込めるか" },
];

/** Shape. The measurements that decide whether a generated page feels like the site. */
const TOKENS: CaptureField[] = [
  { path: "tokens.button_radius", label: "角の丸み", layer: "expression", method: "rule", required: false, useFor: "ボタン・カードの形" },
  { path: "tokens.button_padding", label: "ボタンの余白", layer: "expression", method: "rule", required: false, useFor: "ボタンの寸法" },
  { path: "tokens.button_weight", label: "ボタン文字の太さ", layer: "expression", method: "rule", required: false, useFor: "CTAの強さ" },
  { path: "tokens.button_shadow", label: "ボタンの影", layer: "expression", method: "rule", required: false, useFor: "立体感の有無（平面かマテリアルか）" },
  { path: "tokens.card_radius", label: "カードの丸み", layer: "expression", method: "rule", required: false, useFor: "面の形" },
  { path: "tokens.card_shadow", label: "カードの影", layer: "expression", method: "rule", required: false, useFor: "面の浮き" },
  { path: "tokens.border_width", label: "罫線の太さ", layer: "expression", method: "rule", required: false, useFor: "線の強さ" },
  { path: "tokens.section_spacing", label: "セクション間の余白", layer: "expression", method: "rule", required: false, useFor: "LPの縦のリズム" },
  { path: "tokens.container_width", label: "コンテナ幅", layer: "expression", method: "rule", required: false, useFor: "版面の幅" },
];

/**
 * Structure. What the page is built out of, in order. A generated LP that has
 * the site's colours but none of its sections is a different page about the
 * same company; this is what makes it the same page.
 */
const LAYOUT: CaptureField[] = [
  { path: "layout.sections", label: "セクション構成", layer: "expression", method: "rule", required: false, useFor: "LPの節の並び・動画の構成" },
  { path: "layout.nav_items", label: "ナビゲーション項目", layer: "fact", method: "rule", required: false, useFor: "LPヘッダー・サイトの守備範囲の把握" },
  { path: "layout.hero_kind", label: "ヒーローの作り", layer: "expression", method: "rule", required: false, useFor: "写真・グラデ・べた塗りのどれで始めるか" },
  { path: "layout.cta_label", label: "CTAの文言", layer: "fact", method: "rule", required: false, useFor: "LP・動画の締めの言葉（実際に使っている語）" },
  { path: "layout.density", label: "情報の密度", layer: "expression", method: "rule", required: false, useFor: "1画面に載せる量" },
];

/**
 * Imagery. Not the files themselves (those are materials) but the character of
 * them: a brand that shows people is not a brand that shows product cutouts,
 * and the video template's fallback should follow the site rather than the
 * template's own taste.
 */
const IMAGERY: CaptureField[] = [
  { path: "imagery.style", label: "画づくりの性格", layer: "expression", method: "vlm", required: false, useFor: "動画・LPの画の選び方（人物中心／物撮り／情景／図版）" },
  { path: "imagery.subjects", label: "よく写っているもの", layer: "expression", method: "vlm", required: false, useFor: "素材が足りないときに何を足すか" },
  { path: "imagery.treatment", label: "画の加工", layer: "expression", method: "vlm", required: false, useFor: "角丸・切り抜き・全面などの扱い" },
  { path: "imagery.count", label: "サイトの画像点数", layer: "fact", method: "rule", required: false, useFor: "素材の量の見込み" },
];

/** Who they are. Facts the page states about itself — never inferred into a value. */
const IDENTITY: CaptureField[] = [
  { path: "identity.legal_name", label: "運営者名", layer: "fact", method: "llm", required: false, useFor: "クレジット・フッター表記" },
  { path: "identity.description", label: "運営者の説明", layer: "fact", method: "llm", required: false, useFor: "会社紹介の節" },
  { path: "identity.copyright", label: "著作権表記", layer: "fact", method: "rule", required: false, useFor: "LP・動画のフッター（実際の表記をそのまま使う）" },
];

/** How to reach them. All of these are literally printed on the page. */
const CONTACT: CaptureField[] = [
  { path: "contact.website", label: "Webサイト", layer: "fact", method: "rule", required: false, useFor: "CTAの遷移先・QR" },
  { path: "contact.address", label: "所在地", layer: "fact", method: "rule", required: false, useFor: "フッター・地図" },
  { path: "contact.telephone", label: "電話番号", layer: "fact", method: "rule", required: false, useFor: "フッター・問い合わせ導線" },
  { path: "contact.email", label: "メールアドレス", layer: "fact", method: "rule", required: false, useFor: "問い合わせ導線" },
];

/** Where else they are. From JSON-LD sameAs and the footer's own links. */
const SOCIAL: CaptureField[] = [
  { path: "social.x", label: "X (Twitter)", layer: "fact", method: "rule", required: false, useFor: "動画の締め・LPのフッター" },
  { path: "social.instagram", label: "Instagram", layer: "fact", method: "rule", required: false, useFor: "同上" },
  { path: "social.facebook", label: "Facebook", layer: "fact", method: "rule", required: false, useFor: "同上" },
  { path: "social.youtube", label: "YouTube", layer: "fact", method: "rule", required: false, useFor: "同上・既存動画の参照" },
  { path: "social.linkedin", label: "LinkedIn", layer: "fact", method: "rule", required: false, useFor: "同上" },
  { path: "social.github", label: "GitHub", layer: "fact", method: "rule", required: false, useFor: "同上" },
];

/**
 * Voice and tone. The model's reading of how the site talks, which is the one
 * thing a renderer cannot measure — there is no computed style for 丁寧さ.
 */
const TONE: CaptureField[] = [
  { path: "tone.theme", label: "デザインテーマ", layer: "expression", method: "llm", required: false, useFor: "LP・動画・バナーの描画テーマ" },
  { path: "voice.tone", label: "声のトーン", layer: "expression", method: "llm", required: false, useFor: "コピーとナレーションの書き方" },
  { path: "voice.tagline", label: "サイトが名乗る一言", layer: "fact", method: "rule", required: false, useFor: "動画の冒頭・LPの見出し（実際の表記）" },
];

/** What they sell. Structured by the model from text the page actually carries. */
const OFFERING: CaptureField[] = [
  { path: "offering.name", label: "提供サービス名", layer: "fact", method: "llm", required: false, useFor: "LP・動画の主語" },
  { path: "offering.tagline", label: "タグライン", layer: "fact", method: "llm", required: false, useFor: "ロゴ横・動画の冒頭" },
  { path: "offering.description", label: "説明", layer: "fact", method: "llm", required: false, useFor: "LPのリード" },
  { path: "offering.industry", label: "業種", layer: "fact", method: "llm", required: false, useFor: "テンプレート・BGMの選択" },
  { path: "offering.business_type", label: "事業の型", layer: "fact", method: "llm", required: false, useFor: "同上" },
  { path: "offering.audience", label: "主要な対象", layer: "fact", method: "llm", required: false, useFor: "コピーの宛先" },
  { path: "offering.summary", label: "提供内容の要約", layer: "fact", method: "llm", required: false, useFor: "LPの要約節" },
];

/** Evidence that we actually looked. `site.captured_at` is what makes 認知 visible. */
const SITE: CaptureField[] = [
  { path: "site.lang", label: "サイトの言語", layer: "fact", method: "rule", required: false, useFor: "生成する言語の既定" },
  { path: "site.dark_mode", label: "ダークモード対応", layer: "fact", method: "rule", required: false, useFor: "明暗2版を作るかどうか" },
  { path: "site.captured_at", label: "最後に読んだ日時", layer: "fact", method: "rule", required: false, useFor: "この内容がいつ時点のものか" },
  { path: "site.page_title", label: "ページのタイトル", layer: "fact", method: "rule", required: false, useFor: "取り違えの検知" },
];

/** The whole frame, in the order the brand page shows it. */
export const CAPTURE_FRAME: readonly CaptureField[] = [
  ...PALETTE,
  ...TYPOGRAPHY,
  ...TOKENS,
  ...LAYOUT,
  ...IMAGERY,
  ...TONE,
  ...IDENTITY,
  ...CONTACT,
  ...SOCIAL,
  ...OFFERING,
  ...SITE,
];

/** Section headings on the brand page, and which paths fall under each. */
export const FRAME_GROUPS: readonly { key: string; label: string; prefix: string }[] = [
  { key: "palette", label: "色", prefix: "palette." },
  { key: "typography", label: "書体", prefix: "typography." },
  { key: "tokens", label: "形と余白", prefix: "tokens." },
  { key: "layout", label: "構成", prefix: "layout." },
  { key: "imagery", label: "画づくり", prefix: "imagery." },
  { key: "tone", label: "トーン", prefix: "tone." },
  { key: "voice", label: "声", prefix: "voice." },
  { key: "identity", label: "運営者", prefix: "identity." },
  { key: "contact", label: "連絡先", prefix: "contact." },
  { key: "social", label: "ソーシャル", prefix: "social." },
  { key: "offering", label: "提供内容", prefix: "offering." },
  { key: "site", label: "サイト", prefix: "site." },
];

const BY_PATH = new Map(CAPTURE_FRAME.map((field) => [field.path, field]));

export function frameField(path: string): CaptureField | null {
  return BY_PATH.get(path) ?? null;
}

/** The human label for a field path, falling back to the path itself. */
export function frameLabel(path: string): string {
  return BY_PATH.get(path)?.label ?? path;
}

/**
 * FILES the capture goes and gets, as named slots.
 *
 * These are slots, not categories: `key-visual` names a use, and the same photo
 * is a key visual in one campaign and a background in the next
 * (asset-normalization §5.0). The row that lands in brand_materials carries
 * `kind` (the medium) and `category` (what is in it) separately; this list only
 * says what the capture goes looking for and what it will be used for.
 */
export interface MaterialSlot {
  key: string;
  label: string;
  /** brand_materials.kind */
  kind: "logo" | "keyvisual" | "photo" | "illustration" | "document";
  /** brand_materials.category, when it is known without looking at the image. */
  category: string | null;
  hint: string;
  useFor: string;
}

export const MATERIAL_SLOTS: readonly MaterialSlot[] = [
  {
    key: "logo",
    label: "ロゴ",
    kind: "logo",
    category: "mark",
    hint: "サイトが自ら出しているマーク",
    useFor: "動画の冒頭と締め、LPのヘッダー、バナー",
  },
  {
    key: "screenshot",
    label: "サイトの画面",
    kind: "photo",
    category: "screen",
    hint: "実際にレンダリングしたトップページ",
    useFor: "デバイスモックアップ、LPの実績節、取り違えの検知",
  },
  {
    key: "keyvisual",
    label: "キービジュアル",
    kind: "keyvisual",
    category: null,
    hint: "og:image かヒーローの主画像",
    useFor: "動画の地、LPのヒーロー、バナーの背景",
  },
  {
    key: "photo",
    label: "サイトの写真",
    kind: "photo",
    category: null,
    hint: "本文中の大きな画像",
    useFor: "動画のカット、LPの各節、バナー",
  },
  {
    key: "texture",
    label: "地紋・テクスチャ",
    kind: "photo",
    category: "texture",
    hint: "繰り返しの背景画像・パターン",
    useFor: "動画とLPの地、余白の埋め",
  },
];

/**
 * The goal a brand is measured against — the `expression` half of the frame.
 *
 * Only expression fields are here because only they are adoptable: a design
 * judgement measured off the site becomes this brand's rule, while a fact stays
 * a claim with its confidence attached (§4.1 — a scraped phone number is not
 * promoted to canonical by a crawl). Facts still show on the brand page and
 * still improve the output; they are simply not what "understood" is counted in.
 */
export const GOAL_FIELDS: readonly CaptureField[] = CAPTURE_FRAME.filter(
  (field) => field.layer === "expression",
);
