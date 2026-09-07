import assert from "node:assert/strict";
import test from "node:test";
import { attributeFacts } from "./attribution";
import type { EventFacts } from "./structure";

const FACTS: EventFacts = {
  title: "世界が恋する日本酒",
  subtitle: null,
  seriesLabel: null,
  presenter: null,
  valueLines: null,
  valueChip: null,
  programs: ["乾杯", "利き酒"],
  guests: [{ name: "宮尾 佳明", role: "当主" }],
  date: "2026.10.2",
  weekday: null,
  time: null,
  venue: null,
  fee: null,
  cta: null,
  footnote: null,
  images: [],
  note: null,
};

const SOURCES = [
  { materialId: "flyer", mode: "passthrough" as const },
  // Full-width digits and an arrow, the way a pasted note arrives.
  { materialId: "memo", mode: "text" as const, text: "開催日は ２０２６.１０.２（金）。\n乾杯 → 利き酒" },
  { materialId: "broken", mode: "skipped" as const },
];

test("複数の資料に書かれている値は、その全部を根拠に持つ", () => {
  const result = attributeFacts([{ field: "date", refs: ["flyer", "memo"] }], FACTS, SOURCES);
  assert.deepEqual(result.byField.date, ["flyer", "memo"]);
  assert.deepEqual(result.readIds, ["flyer", "memo"]);
  assert.equal(result.dropped.length, 0);
});

test("テキストの資料は本文で検証し、書かれていない値の引用は落とす", () => {
  const result = attributeFacts([{ field: "title", refs: ["memo", "flyer"] }], FACTS, SOURCES);
  assert.deepEqual(result.byField.title, ["flyer"]);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].ref, "memo");
});

test("読んでいない資料のIDは根拠にならない", () => {
  const result = attributeFacts([{ field: "date", refs: ["broken", "ghost"] }], FACTS, SOURCES);
  assert.equal(result.byField.date, undefined);
  assert.equal(result.dropped.length, 2);
});

test("null の項目への引用は無視する", () => {
  const result = attributeFacts([{ field: "venue", refs: ["flyer"] }], FACTS, SOURCES);
  assert.equal(result.byField.venue, undefined);
  assert.equal(result.dropped.length, 0);
});

test("空白と全角の違いは一致を妨げない。一覧は1項目でも本文にあれば根拠", () => {
  const result = attributeFacts(
    [
      { field: "programs", refs: ["memo"] },
      { field: "guests", refs: ["memo"] },
    ],
    FACTS,
    SOURCES,
  );
  assert.deepEqual(result.byField.programs, ["memo"]);
  // The note never names the speaker, so that citation is the one that falls.
  assert.equal(result.byField.guests, undefined);
  assert.equal(result.dropped.length, 1);
});
