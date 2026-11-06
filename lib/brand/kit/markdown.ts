import { frameLabel } from "@/lib/brand/capture-frame";
import { BRAND_KIND_LABEL, isBrandKind } from "@/lib/brand-kind";
import { fontFamilies, isHex, SOCIAL_NETWORKS } from "@/lib/brand/profile";
import type { BrandKitBrief } from "./snapshot";
import { kitTokens } from "./tokens";

// brand.md — the kit as an agent reads it.
//
// The first thing an agent fetches, so it has to be complete on its own: what
// the brand is, every adopted rule with the address of the file that proves
// it, and what each rule is for. Written in the kit's own words rather than
// the product's ("プライマリ", not "palette.primary"), with the field path in
// a trailing code span so a tool that wants the raw key still has it.
//
// Everything here is ADOPTED. A value a model only guessed is not in the brief
// (docs/product.md §2.1), so nothing in this file needs a confidence column.

export type KitMarkdownOptions = {
  /** Absolute base of this kit, e.g. https://logos.example/k/<id>. No trailing slash. */
  kitUrl: string;
  publishedAt: string;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String((item as Record<string, unknown>).heading ?? (item as Record<string, unknown>).kind ?? "")
          : "",
    )
    .filter(Boolean);
}

function row(label: string, value: string | null, path?: string): string | null {
  if (!value) return null;
  return `| ${label} | ${value.replace(/\|/g, "\\|")} | ${path ? `\`${path}\`` : ""} |`;
}

function table(rows: (string | null)[]): string[] {
  const kept = rows.filter((line): line is string => line !== null);
  if (kept.length === 0) return [];
  return ["| 項目 | 値 | key |", "| --- | --- | --- |", ...kept];
}

export function kitMarkdown(brief: BrandKitBrief, options: KitMarkdownOptions): string {
  const v = brief.values;
  const tokens = kitTokens(brief);
  const out: string[] = [];

  out.push(`# ${brief.brand.name} — Brand Kit`);
  out.push("");
  out.push(
    `このファイルは ${brief.brand.name} のブランドキットです。ここに書かれた値は、ブランドのサイトから測定されたものと、持ち主が採用したものだけです。モデルの推測は含みません。無い項目は無いものとして扱い、推測で補わないでください。`,
  );
  out.push("");
  out.push(`- キット: ${options.kitUrl}`);
  out.push(`- トークン: ${options.kitUrl}/tokens.json · ${options.kitUrl}/tokens.css`);
  brief.logos.forEach((logo, index) => {
    const ext = logo.svg ? "svg" : extensionOf(logo.mediaType);
    out.push(`- ロゴ${brief.logos.length > 1 ? `（${logo.title}）` : ""}: ${options.kitUrl}/logo${index === 0 ? "" : `-${index + 1}`}.${ext}`);
  });
  if (brief.keyVisual) {
    out.push(`- キービジュアル: ${options.kitUrl}/keyvisual.${extensionOf(brief.keyVisual.mediaType)}`);
  }
  out.push(`- 公開: ${options.publishedAt}（取得: ${brief.snapshotAt}）`);
  const fromParent = Object.entries(brief.inherited ?? {});
  const parents = new Map<string, string>();
  for (const [, parent] of fromParent) parents.set(parent.id, parent.name);
  if (brief.logosFrom) parents.set(brief.logosFrom.id, brief.logosFrom.name);
  if (brief.keyVisualFrom) parents.set(brief.keyVisualFrom.id, brief.keyVisualFrom.name);
  if (parents.size > 0) {
    const names = [...parents.values()].map((name) => `「${name}」`).join("・");
    const parts: string[] = [];
    if (fromParent.length > 0) parts.push(`${fromParent.length}項目（${fromParent.map(([path]) => `\`${path}\``).join(", ")}）`);
    if (brief.logosFrom) parts.push("ロゴ");
    if (brief.keyVisualFrom) parts.push("キービジュアル");
    out.push(`- 親ブランド: このブランドは ${names} のサブブランドです。${parts.join("・")}は親の値をそのまま使っています`);
  }
  out.push("");

  // ---- ブランド
  out.push("## ブランド");
  out.push("");
  const kind = isBrandKind(brief.brand.kind) ? BRAND_KIND_LABEL[brief.brand.kind] : brief.brand.kind;
  out.push(
    ...table([
      row("名前", brief.brand.name),
      row("種別", kind || null),
      row("タグライン", text(v["offering.tagline"]) ?? text(v["voice.tagline"]), "offering.tagline"),
      row("説明", brief.brand.description || null),
      row("業種", brief.brand.industry || null),
      row("所在地", brief.brand.location || null),
      row("Web", brief.brand.website || null),
      row("運営者", text(v["identity.legal_name"]), "identity.legal_name"),
      row("運営者の説明", text(v["identity.description"]), "identity.description"),
      row("主要な対象", text(v["offering.audience"]), "offering.audience"),
      row("提供内容", text(v["offering.summary"]), "offering.summary"),
      row("著作権表記", text(v["identity.copyright"]), "identity.copyright"),
    ]),
  );
  out.push("");

  // ---- ロゴ
  out.push("## ロゴ");
  out.push("");
  if (brief.logos.length === 0) {
    out.push("このキットにロゴはありません。文字でロゴを組まないでください。ブランド名はテキストとして扱い、マークは置かないでください。");
  } else {
    out.push("ロゴは上のファイルをそのまま使ってください。文字で打ち直さない、色を変えない、変形しない、ロゴの直後に文字を続けない。ロゴの周囲には、マークの高さの半分以上の余白を取ってください。");
    out.push("");
    const background = text(v["palette.background"]);
    const primary = text(v["palette.primary"]);
    if (isHex(background)) out.push(`- 既定の地色: \`${background}\`（サイトの背景色）`);
    if (isHex(primary)) out.push(`- 暗い地（例: \`${primary}\`）に置くときは、ロゴのコントラストを確かめてください。反転版はこのキットにありません`);
  }
  out.push("");

  // ---- 色
  out.push("## 色");
  out.push("");
  const colorUse: Record<string, string> = {
    primary: "主要なボタン・マーク面・バナーの地",
    accent: "強調・リンク・第2CTA",
    background: "ページ・動画の地",
    surface: "カード・パネルの面",
    text: "本文・字幕",
    border: "区切り線・カードの縁",
  };
  if (Object.keys(tokens.color).length === 0) {
    out.push("色は採用されていません。");
  } else {
    out.push("| 役割 | HEX | 使いどころ | key |");
    out.push("| --- | --- | --- | --- |");
    for (const [role, hex] of Object.entries(tokens.color)) {
      out.push(`| ${frameLabel(`palette.${role}`)} | \`${hex}\` | ${colorUse[role] ?? ""} | \`palette.${role}\` |`);
    }
    if (tokens.gradient.length > 1) {
      out.push("");
      out.push(`グラデーション: ${tokens.gradient.map((hex) => `\`${hex}\``).join(" → ")}（ヒーローの地・動画の背景） \`palette.gradient\``);
    }
    const mode = text(v["palette.mode"]);
    if (mode) {
      out.push("");
      out.push(`明暗: ${mode} \`palette.mode\``);
    }
  }
  out.push("");

  // ---- 書体
  out.push("## 書体");
  out.push("");
  const heading = text(v["typography.heading_font"]);
  const body = text(v["typography.body_font"]);
  if (!heading && !body) {
    out.push("書体は採用されていません。");
  } else {
    out.push(
      ...table([
        row("見出し", heading, "typography.heading_font"),
        row("本文", body, "typography.body_font"),
        row("見出しの太さ", text(v["typography.heading_weight"]), "typography.heading_weight"),
        row("本文の太さ", text(v["typography.body_weight"]), "typography.body_weight"),
        row("見出しの大きさ", text(v["typography.heading_size"]), "typography.heading_size"),
        row("本文の大きさ", text(v["typography.body_size"]), "typography.body_size"),
        row("行送り", text(v["typography.line_height"]), "typography.line_height"),
        row("字間", text(v["typography.letter_spacing"]), "typography.letter_spacing"),
        row("書体の性格", text(v["typography.font_style"]), "typography.font_style"),
      ]),
    );
    const families = [...new Set([...fontFamilies(heading), ...fontFamilies(body)])];
    if (families.length > 0) {
      out.push("");
      out.push(`読み込み: ${families.map((family) => `\`${family}\``).join(", ")}。Google Fonts にある族名はそこから、無ければ同じ性格の書体で代替してください。`);
    }
  }
  out.push("");

  // ---- 形と余白
  out.push("## 形と余白");
  out.push("");
  const shapeRows = table(
    Object.entries(tokens.shape).map(([key, value]) => row(frameLabel(`tokens.${key}`), value, `tokens.${key}`)),
  );
  out.push(...(shapeRows.length > 0 ? shapeRows : ["形の値は採用されていません。"]));
  out.push("");

  // ---- 構成
  out.push("## 構成");
  out.push("");
  const nav = list(v["layout.nav_items"]);
  const sections = list(v["layout.sections"]);
  const structure: string[] = [];
  if (nav.length > 0) structure.push(`- ナビゲーション: ${nav.join(" / ")} \`layout.nav_items\``);
  if (sections.length > 0) structure.push(`- セクション: ${sections.map((heading, index) => `${index + 1}. ${heading}`).join("　")} \`layout.sections\``);
  const hero = text(v["layout.hero_kind"]);
  if (hero) structure.push(`- ヒーローの作り: ${hero} \`layout.hero_kind\``);
  const cta = text(v["layout.cta_label"]);
  if (cta) structure.push(`- CTA の文言: 「${cta}」 \`layout.cta_label\``);
  out.push(...(structure.length > 0 ? structure : ["構成は採用されていません。"]));
  out.push("");

  // ---- 声
  const tone = text(v["voice.tone"]);
  const theme = text(v["tone.theme"]);
  if (tone || theme) {
    out.push("## 声とトーン");
    out.push("");
    if (theme) out.push(`- デザインテーマ: ${theme} \`tone.theme\``);
    if (tone) out.push(`- 声のトーン: ${tone} \`voice.tone\``);
    out.push("");
  }

  // ---- 連絡先・ソーシャル
  out.push("## 連絡先とソーシャル");
  out.push("");
  const reach = table([
    row("Web", (text(v["contact.website"]) ?? brief.brand.website) || null, "contact.website"),
    row("所在地", text(v["contact.address"]), "contact.address"),
    row("電話", text(v["contact.telephone"]), "contact.telephone"),
    row("メール", text(v["contact.email"]), "contact.email"),
    ...SOCIAL_NETWORKS.map((network) => row(network.label, text(v[network.path]), network.path)),
  ]);
  out.push(...(reach.length > 0 ? reach : ["連絡先は採用されていません。"]));
  out.push("");

  out.push("## 使い方");
  out.push("");
  out.push("- ここに無い値を推測で足さないでください。足りないものは「未指定」と言ってください");
  out.push("- ロゴのファイルと表記はそのまま使ってください（不変）");
  out.push("- 色・書体・形は既定値です。デザイン上の理由があれば上書きしてよく、そのときは理由を添えてください");
  out.push("- レイアウト・写真・構図・モーションは自由です");
  out.push("");
  return out.join("\n");
}

function extensionOf(mediaType: string | null): string {
  switch (mediaType) {
    case "image/svg+xml":
      return "svg";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

export { extensionOf as kitFileExtension };
