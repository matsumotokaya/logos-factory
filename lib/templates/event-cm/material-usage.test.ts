import assert from "node:assert/strict";
import test from "node:test";
import { eventCmMaterialUsage } from "./material-usage";
import { seedEventCmBrief } from "./seed";
import { materialUri } from "@/lib/takes/material-uri";
import { collectMaterialPaths } from "@/lib/takes/material-uri";
import {
  EVENT_CM_SUPPRESSED_NOTE,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-16T09:00:00+09:00"), seed: "take-1" },
);

const MARK = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const PORTRAIT = "33333333-3333-4333-8333-333333333333";
const HERO = "44444444-4444-4444-8444-444444444444";
const MUSIC = "55555555-5555-4555-8555-555555555555";

// The real shapes, not convenient ones. A photograph is an EventPhoto — the
// pointer sits at `.src` next to a focus point — so a fixture holding a bare
// string tests a brief that cannot exist, and passed while the code looked for
// `guests.0.photo` instead of `guests.0.photo.src`.
const FULL: EventCmBrief = {
  ...SEEDED,
  logos: [
    { name: "WealthPark Lab", src: materialUri(MARK) },
    { name: "leopalace21", src: materialUri(PARTNER) },
  ],
  guests: [
    {
      name: "宮尾 佳明",
      role: "宮尾酒造 十一代目当主",
      photo: { src: materialUri(PORTRAIT), focus: { x: 0.5, y: 0.35 } },
    },
  ],
  visuals: { ...SEEDED.visuals, value: { src: materialUri(HERO) } },
  bgm: materialUri(MUSIC),
};

test("先頭のマークは冒頭・締め・末尾の3シーンを名乗る", () => {
  const usage = eventCmMaterialUsage(FULL);
  const label = usage.get(MARK)?.[0].label ?? "";
  // 実際に3回画面に出るので、そう言う（README「ロゴは冒頭・締め・末尾の3シーン」）。
  assert.ok(label.includes("オープニング"), label);
  assert.ok(label.includes("CTA"), label);
  assert.ok(label.includes("エンドカード"), label);
});

test("2つ目以降のマークはロゴ列のシーンだけを名乗る", () => {
  const label = eventCmMaterialUsage(FULL).get(PARTNER)?.[0].label ?? "";
  assert.ok(label.includes("CTA"), label);
  assert.ok(!label.includes("オープニング"), `出ないシーンを名乗っている: ${label}`);
});

test("登壇者の写真はその人の名前で言う", () => {
  const label = eventCmMaterialUsage(FULL).get(PORTRAIT)?.[0].label ?? "";
  assert.ok(label.includes("登壇者紹介"), label);
  assert.ok(label.includes("宮尾 佳明"), label);
});

test("背景とBGMも居場所を持つ", () => {
  const usage = eventCmMaterialUsage(FULL);
  assert.ok((usage.get(HERO)?.[0].label ?? "").includes("テーマ"));
  assert.equal(usage.get(MUSIC)?.[0].label, "BGM");
});

test("シーン番号は実際の構成に従う（シーンを消せば番号がずれる）", () => {
  // An empty guest list no longer changes the shape — the picture is the
  // template's (EVENT_CM_SCENES). Deleting it does.
  const deleted: EventCmBrief = {
    ...FULL,
    provenance: {
      ...FULL.provenance,
      guests: { origin: "user", note: EVENT_CM_SUPPRESSED_NOTE },
    },
  };
  const withGuest = eventCmMaterialUsage(FULL).get(HERO)?.[0].label ?? "";
  const noGuest = eventCmMaterialUsage(deleted).get(HERO)?.[0].label ?? "";
  // テーマは登壇者より前なので番号は動かない。動いてはいけない。
  assert.equal(withGuest, noGuest);

  // 一方 CTA は登壇者シーンの後ろなので、消せば1つ前に繰り上がる。
  const ctaWith = eventCmMaterialUsage(FULL).get(PARTNER)?.[0].label ?? "";
  const ctaWithout = eventCmMaterialUsage(deleted).get(PARTNER)?.[0].label ?? "";
  assert.notEqual(ctaWith, ctaWithout, "構成が変わっても同じ番号を名乗っている");
});

test("使われていない素材は一覧に現れない（ブリーフが持っていないものは持っていない）", () => {
  const usage = eventCmMaterialUsage({ ...FULL, bgm: null });
  assert.equal(usage.get(MUSIC), undefined);
});

test("同じ素材が2箇所にあれば2件返る（重複を畳まない）", () => {
  const twice: EventCmBrief = {
    ...FULL,
    // 同じ写真を地にも使った状態。実際に2回描かれるので2件と答える。
    visuals: { ...FULL.visuals, value: { src: materialUri(PORTRAIT) } },
  };
  assert.equal(eventCmMaterialUsage(twice).get(PORTRAIT)?.length, 2);
});

test("パスの走査は添字とネストを保つ", () => {
  const paths = collectMaterialPaths(FULL);
  assert.deepEqual(paths.get(MARK), ["logos.0.src"]);
  assert.deepEqual(paths.get(PARTNER), ["logos.1.src"]);
  // 写真はオブジェクトなので、ポインタは1階層深い。
  assert.deepEqual(paths.get(PORTRAIT), ["guests.0.photo.src"]);
  assert.deepEqual(paths.get(HERO), ["visuals.value.src"]);
});

test("語彙が知らないパスは、素知らぬ顔をせず自分を名乗る", () => {
  // 「出ていません」と言ってしまうと、映像が描いている素材について嘘をつく。
  const odd = { ...FULL, theme: { markSrc: materialUri("99999999-9999-4999-8999-999999999999") } };
  const usage = eventCmMaterialUsage(odd as unknown as EventCmBrief);
  const label = usage.get("99999999-9999-4999-8999-999999999999")?.[0].label;
  assert.equal(label, "theme.markSrc");
});
