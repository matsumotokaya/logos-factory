import assert from "node:assert/strict";
import test from "node:test";
import type { BrandKitBrief } from "@/lib/brand/kit/snapshot";
import { BrandLpBriefSchema, type BrandLpBrief } from "./brief-schema";
import { lpContext } from "./context";
import { contrast, lpDesign } from "./design";
import { frameLp, SAMPLE_VOICES } from "./frame";
import { renderBrandLp } from "./render";

const kit = (values: Record<string, unknown> = {}, brand: Partial<BrandKitBrief["brand"]> = {}): BrandKitBrief => ({
  version: 1,
  snapshotAt: "2026-11-13T00:00:00.000Z",
  brand: {
    id: "b1",
    name: "Funds",
    kind: "service",
    description: "固定利回りの資産運用サービスです。",
    industry: "金融",
    location: "",
    website: "https://funds.jp",
    ...brand,
  },
  values: {
    "palette.primary": "#082838",
    "palette.accent": "#009fb8",
    "palette.background": "#ffffff",
    "palette.text": "#062952",
    ...values,
  },
  logos: [],
  keyVisual: null,
});

const FEATURES = [
  { title: "固定利回り", description: "値動きがありません。" },
  { title: "審査", description: "基準を満たした企業だけ。" },
  { title: "1円から", description: "少額で始められます。" },
];

const brief = (k: BrandKitBrief, guesses: Record<string, unknown> = {}): BrandLpBrief => {
  const context = lpContext(k, guesses, null);
  const framed = frameLp(context);
  return {
    version: 1,
    lang: context.lang,
    kit: k,
    content: framed.content,
    basis: framed.basis,
    visuals: { screen: null },
    writer: { kind: "frame", model: null, note: null },
  };
};

// ---- design

test("背景と見分けのつかないプライマリはボタンにしない", () => {
  const withAccent = lpDesign(kit({ "palette.primary": "#f8f8f8", "palette.accent": "#0898a8" }));
  assert.equal(withAccent.color.action, "#0898a8");
  const none = lpDesign(kit({ "palette.primary": "#f8f8f8", "palette.accent": undefined }));
  assert.equal(none.color.action, "#062952");
  assert.ok(none.notes.some((note) => note.path === "palette.primary"));
  assert.ok(contrast(none.color.action, none.color.bg) >= 3);
});

test("中間の明るさのブランド色には白い文字を載せる", () => {
  const design = lpDesign(kit({ "palette.primary": "#1e6cff" }));
  assert.equal(design.color.onAction, "#ffffff");
  assert.equal(design.color.band, "#1e6cff");
});

test("ヒーローのグラデーションは、サイトのヒーローがグラデーションのときだけ使う", () => {
  const gradient = ["#09bdfd", "#70dbfd"];
  assert.equal(lpDesign(kit({ "palette.gradient": gradient, "layout.hero_kind": "gradient" })).hero.kind, "gradient");
  assert.equal(lpDesign(kit({ "palette.gradient": gradient, "layout.hero_kind": "plain" })).hero.kind, "plain");
  assert.equal(lpDesign(kit({ "palette.gradient": gradient })).hero.kind, "tint");
});

test("本文に使えない行送りは補正し、補正したことを残す", () => {
  const design = lpDesign(kit({ "typography.line_height": "1.00" }));
  assert.equal(design.font.lineHeight, 1.6);
  assert.ok(design.notes.some((note) => note.path === "typography.line_height"));
  const fine = lpDesign(kit({ "typography.line_height": "1.80" }));
  assert.ok(!fine.notes.some((note) => note.path === "typography.line_height"));
});

test("書体はキットの族名を先頭に、読み込める族だけを Google Fonts に頼む", () => {
  const design = lpDesign(kit({ "typography.heading_font": "Ubuntu, Noto Sans JP", "typography.body_font": "Hiragino Sans" }));
  assert.ok(design.font.heading.startsWith('Ubuntu, "Noto Sans JP"'));
  assert.ok(design.font.href?.includes("family=Ubuntu"));
  assert.ok(!design.font.href?.includes("Hiragino"));
});

// ---- where a section's facts came from

test("キットに無く推定にある項目は「推定から」になり、採用する項目として挙がる", () => {
  const framed = frameLp(lpContext(kit(), { "offering.features": FEATURES, "offering.tagline": "堅実イチバン" }, null));
  assert.equal(framed.basis.features.origin, "workspace");
  assert.deepEqual(framed.basis.features.pending, ["offering.features"]);
  assert.equal(framed.basis.hero.origin, "workspace");
  assert.deepEqual(framed.basis.hero.pending, ["offering.tagline"]);
  assert.equal(framed.content.hero.headline, "堅実イチバン");
});

test("キットの値は推定より優先され、「キットから」になる", () => {
  const framed = frameLp(
    lpContext(kit({ "offering.features": FEATURES }), { "offering.features": [{ title: "別の特長", description: "" }] }, null),
  );
  assert.equal(framed.basis.features.origin, "kit");
  assert.deepEqual(framed.basis.features.pending, []);
  assert.equal(framed.content.features.items[0].title, "固定利回り");
});

test("お客様の声が無ければ仮の内容で埋め、仮と記録する", () => {
  const framed = frameLp(lpContext(kit(), {}, null));
  assert.equal(framed.basis.voices.origin, "sample");
  assert.deepEqual(framed.content.voices.items, SAMPLE_VOICES);
  assert.equal(framed.sourced.voices, 0);
});

test("お客様の声があれば一字も変えずに載せる", () => {
  const voices = [{ quote: "安心して持てます。", name: "K.S", role: "40代" }];
  const framed = frameLp(lpContext(kit(), { "proof.voices": voices }, null));
  assert.equal(framed.basis.voices.origin, "workspace");
  assert.deepEqual(framed.content.voices.items, voices);
});

test("特長が3件に足りなければ残りを仮で埋め、節は仮の内容になる", () => {
  const framed = frameLp(lpContext(kit(), { "offering.features": FEATURES.slice(0, 1) }, null));
  assert.equal(framed.content.features.items.length, 3);
  assert.equal(framed.content.features.items[0].title, "固定利回り");
  assert.equal(framed.basis.features.origin, "sample");
});

test("ボタンに収まらない CTA の文言は使わない", () => {
  const long = frameLp(lpContext(kit({ "layout.cta_label": "ご相談はLINEで！お気軽にご連絡ください" }), {}, null));
  assert.equal(long.content.cta.label, "お問い合わせ");
  const short = frameLp(lpContext(kit({ "layout.cta_label": "新規会員登録" }), {}, null));
  assert.equal(short.content.cta.label, "新規会員登録");
});

test("説明が何も無いブランドでも1ページになり、仮の内容と記録される", () => {
  const framed = frameLp(lpContext(kit({}, { description: "" }), {}, null));
  assert.equal(framed.basis.hero.origin, "sample");
  assert.equal(framed.basis.overview.origin, "sample");
  assert.ok(BrandLpBriefSchema.safeParse(brief(kit({}, { description: "" }))).success);
});

// ---- the page

test("フレームだけで作ったブリーフはスキーマを満たし、1つの HTML になる", () => {
  const b = brief(kit(), { "offering.features": FEATURES });
  assert.ok(BrandLpBriefSchema.safeParse(b).success);
  const html = renderBrandLp(b, { logo: null, screen: null });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("固定利回り"));
  assert.ok(!/<script/i.test(html), "the page must work in a sandboxed frame");
});

test("内容に含まれる HTML は文字として出る", () => {
  const b = brief(kit({}, { name: "<b>X</b>", description: '<img src=x onerror="alert(1)">' }));
  const html = renderBrandLp(b, { logo: null, screen: null });
  assert.ok(!html.includes("<b>X</b>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;b&gt;X&lt;/b&gt;"));
});

test("http(s) 以外のリンク先は使わない", () => {
  const b = brief(kit({}, { website: "javascript:alert(1)" }));
  const html = renderBrandLp(b, { logo: null, screen: null });
  assert.ok(!html.includes("javascript:"));
});

test("キットに無い節だけに印が付き、印は指定したときだけ出る", () => {
  const b = brief(kit(), {});
  const plain = renderBrandLp(b, { logo: null, screen: null });
  assert.ok(!plain.includes("data-gap="));
  const marked = renderBrandLp(b, { logo: null, screen: null }, { markGaps: true });
  assert.ok(marked.includes('id="voices" class="voices" data-gap="仮の内容"'));
  assert.ok(marked.includes('<section id="overview">'), "a section from the kit carries no mark");
});

test("画面があるときだけヒーローに画面の枠が出る", () => {
  const b = brief(kit());
  assert.ok(!renderBrandLp(b, { logo: null, screen: null }).includes('class="shot"'));
  const html = renderBrandLp(b, { logo: null, screen: "https://example.test/s.jpg" });
  assert.ok(html.includes('class="shot"'));
  assert.ok(html.includes("funds.jp"));
});

// ---- the pipeline

test("LPの5段は作成時にすべて最新で、キットが変わるとキットも5段もそろって要更新になる", async () => {
  const { lpPipeline } = await import("@/lib/pipeline/brand-lp");
  const b = brief(kit(), { "offering.features": FEATURES });
  const fresh = lpPipeline({ brief: b, createdAt: "2026-11-14T01:00:00.000Z", kitChanged: false, designNotes: 0 });
  assert.deepEqual(fresh.stages.map((stage) => stage.id), ["input", "extract", "structure", "map", "output"]);
  assert.ok(fresh.stages.every((stage) => stage.status === "ready"));
  assert.equal(fresh.upstream.status, "ready");
  const moved = lpPipeline({ brief: b, createdAt: "2026-11-14T01:00:00.000Z", kitChanged: true, designNotes: 2 });
  assert.ok(moved.stages.every((stage) => stage.status === "stale"));
  assert.equal(moved.upstream.status, "stale");
  assert.equal(moved.stages.find((stage) => stage.id === "map")?.summary, "補ったこと 2件");
});

test("構造化の段は、キットに無い節の数を言う", async () => {
  const { lpPipeline } = await import("@/lib/pipeline/brand-lp");
  const b = brief(kit(), { "offering.features": FEATURES });
  const structure = lpPipeline({ brief: b, createdAt: "2026-11-14T01:00:00.000Z", kitChanged: false, designNotes: 0 })
    .stages.find((stage) => stage.id === "structure");
  // features from 推定, voices are stand-ins
  assert.equal(structure?.summary, "推定 1節・仮 1節");
});
