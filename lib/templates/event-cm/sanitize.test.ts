import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeFacts } from "./sanitize";
import type { EventFacts } from "./structure";

/**
 * What reading the sake event's planning material actually produced
 * (2026-08-12). Every wrong value below came out of a real document; none is
 * invented for the test.
 */
const READ_FROM_SAKE_MATERIAL: EventFacts = {
  title: "世界が恋する日本酒",
  subtitle: "豊かさとは文化を楽しむこと",
  seriesLabel: "＼パッションアセットの世界／",
  presenter: "WealthPark Lab",
  valueLines: ["本当の豊かさは、文化を楽しめる仲間を持つこと。"],
  valueChip: "本企画が目指す価値",
  programs: ["江戸切子の酒器で、日本酒と器の文化を楽しむ"],
  guests: [
    { name: "宮尾氏", role: "宮尾酒造　当主" },
    { name: "Miss SAKE 2名", role: "" },
  ],
  date: "2026年10月3日",
  weekday: "土",
  time: "13:00〜16:00（予定）",
  venue: "中野坂上　ボードルーム",
  fee: "XXXX円",
  cta: "ホームページはこちら",
  footnote: "レオパレス21 オーナー約40名・社員約10名",
  images: [],
  note: null,
};

const clean = sanitizeFacts(READ_FROM_SAKE_MATERIAL);

test("資料側が未記入のプレースホルダは事実にしない", () => {
  // 「XXXX円」 means the organiser has not set a fee. Putting it on screen
  // states a price of XXXX yen.
  assert.equal(clean.facts.fee, null);
  assert.ok(clean.report.dropped.some((item) => item.field === "fee"));
});

test("資料の見出しを値と取り違えない", () => {
  // 「本企画が目指す価値」 is the label above the value, not the value.
  assert.equal(clean.facts.valueChip, null);
});

test("社内向けのメモは掲載しない", () => {
  // Expected attendance belongs to the plan, not to the announcement.
  assert.equal(clean.facts.footnote, null);
  assert.ok(
    clean.report.dropped.some((item) => item.reason.includes("社内向け")),
  );
});

test("人数を人物として登壇者に入れない", () => {
  // 「Miss SAKE 2名」 is how a plan says two more speakers are coming.
  assert.equal(clean.facts.guests?.length, 1);
  assert.equal(clean.facts.guests?.[0].name, "宮尾氏");
  assert.ok(
    clean.report.dropped.some((item) => item.reason.includes("人数であって")),
  );
});

test("フライヤーの装飾記号を落とす", () => {
  assert.equal(clean.facts.seriesLabel, "パッションアセットの世界");
});

test("正しい値には触らない", () => {
  assert.equal(clean.facts.title, "世界が恋する日本酒");
  assert.equal(clean.facts.subtitle, "豊かさとは文化を楽しむこと");
  assert.equal(clean.facts.date, "2026年10月3日");
  assert.equal(clean.facts.time, "13:00〜16:00（予定）");
  assert.equal(clean.facts.venue, "中野坂上 ボードルーム");
  assert.equal(clean.facts.cta, "ホームページはこちら");
  assert.deepEqual(clean.facts.programs, READ_FROM_SAKE_MATERIAL.programs);
});

test("落としたものは黙って消さず、理由つきで報告する", () => {
  assert.ok(clean.report.dropped.length >= 4);
  for (const item of clean.report.dropped) {
    assert.ok(item.field.length > 0);
    assert.ok(item.value.length > 0);
    assert.ok(item.reason.length > 0);
  }
});

test("他のよくあるプレースホルダも落とす", () => {
  const result = sanitizeFacts({
    ...READ_FROM_SAKE_MATERIAL,
    venue: "〇〇ホール",
    time: "未定",
    cta: "TBD",
  });
  assert.equal(result.facts.venue, null);
  assert.equal(result.facts.time, null);
  assert.equal(result.facts.cta, null);
});

test("null はそのまま null（読めなかったことを消さない）", () => {
  const result = sanitizeFacts({
    ...READ_FROM_SAKE_MATERIAL,
    venue: null,
    guests: null,
  });
  assert.equal(result.facts.venue, null);
  assert.equal(result.facts.guests, null);
});
