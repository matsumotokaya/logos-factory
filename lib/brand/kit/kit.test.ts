import assert from "node:assert/strict";
import test from "node:test";
import { kitMarkdown } from "./markdown";
import { kitContentHash, parseKitBrief, type BrandKitBrief } from "./snapshot";
import { kitTokens, kitTokensCss, kitTokensJson } from "./tokens";

const brief: BrandKitBrief = {
  version: 1,
  snapshotAt: "2026-11-05T00:00:00.000Z",
  brand: {
    id: "b1",
    name: "Funds",
    kind: "service",
    description: "固定利回りの資産運用。",
    industry: "金融",
    location: "",
    website: "https://funds.jp",
  },
  values: {
    "palette.primary": "#082838",
    "palette.accent": "#009FB8",
    "palette.gradient": ["#09bdfd", "#70dbfd"],
    "typography.heading_font": "Ubuntu, Noto Sans JP",
    "typography.heading_weight": "700",
    "tokens.button_radius": "999px",
    "layout.nav_items": ["ログイン", "口座開設"],
    "layout.cta_label": "新規会員登録",
    "social.x": "https://x.com/Funds_jp",
    "offering.tagline": "固定利回りの資産運用",
  },
  logos: [{ id: "L1", title: "funds.jp", role: "primary", svg: "<svg/>", mediaType: "image/svg+xml", r2Key: null }],
  keyVisual: { materialId: "m1", r2Key: "brands/b1/kv.jpg", mediaType: "image/jpeg", width: 1200, height: 630 },
};

test("tokens は役割ごとの色・書体・形を小文字HEXで出す", () => {
  const tokens = kitTokens(brief);
  assert.deepEqual(tokens.color, { primary: "#082838", accent: "#009fb8" });
  assert.deepEqual(tokens.gradient, ["#09bdfd", "#70dbfd"]);
  assert.equal(tokens.typography.heading_font, "Ubuntu, Noto Sans JP");
  assert.equal(tokens.shape.button_radius, "999px");
  assert.deepEqual(tokens.layout.nav_items, ["ログイン", "口座開設"]);
  assert.equal(tokens.social.x, "https://x.com/Funds_jp");
  assert.match(kitTokensJson(brief), /"primary": "#082838"/);
});

test("tokens.css は :root のカスタムプロパティになる", () => {
  const css = kitTokensCss(brief);
  assert.match(css, /--color-primary: #082838;/);
  assert.match(css, /--gradient-brand: linear-gradient\(90deg, #09bdfd, #70dbfd\);/);
  assert.match(css, /--font-heading: Ubuntu, Noto Sans JP;/);
  assert.match(css, /--radius-button: 999px;/);
});

test("brand.md はファイルの住所・採用値・使い方を持ち、無い項目は書かない", () => {
  const md = kitMarkdown(brief, { kitUrl: "https://logos.test/k/b1", publishedAt: "2026-11-05T01:00:00.000Z" });
  assert.match(md, /^# Funds — Brand Kit/);
  assert.match(md, /https:\/\/logos\.test\/k\/b1\/logo\.svg/);
  assert.match(md, /https:\/\/logos\.test\/k\/b1\/keyvisual\.jpg/);
  assert.match(md, /\| プライマリカラー \| `#082838` \|/);
  assert.match(md, /CTA の文言: 「新規会員登録」/);
  assert.match(md, /\| X \| https:\/\/x\.com\/Funds_jp \|/);
  assert.doesNotMatch(md, /電話/);
  assert.match(md, /## 使い方/);
});

test("内容ハッシュは snapshotAt に依存せず、値が変わると変わる", () => {
  const again = { ...brief, snapshotAt: "2026-12-01T00:00:00.000Z" };
  assert.equal(kitContentHash(brief), kitContentHash(again));
  const changed = { ...brief, values: { ...brief.values, "palette.primary": "#000000" } };
  assert.notEqual(kitContentHash(brief), kitContentHash(changed));
});

test("ブリーフの形は検証される", () => {
  assert.ok(parseKitBrief(brief));
  assert.equal(parseKitBrief({ version: 2 }), null);
});
