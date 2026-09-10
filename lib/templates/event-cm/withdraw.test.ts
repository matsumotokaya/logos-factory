import assert from "node:assert/strict";
import test from "node:test";
import { withdrawMaterials, WITHDRAWN_NOTE } from "./withdraw";
import { seedEventCmBrief } from "./seed";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const FALLBACK = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-11T09:00:00+09:00"), seed: "take-1" },
);

const NOW = "2026-09-07T00:00:00.000Z";

/** A brief after a flyer, a pasted note and one photograph were read. */
const READ: EventCmBrief = {
  ...FALLBACK,
  title: "世界が恋する日本酒",
  schedule: { ...FALLBACK.schedule, date: "2026.10.2", weekday: "FRI", venue: "渋谷" },
  cta: "申込はWebで",
  visuals: { ...FALLBACK.visuals, value: { src: "material:img-1" } },
  provenance: {
    ...FALLBACK.provenance,
    title: { origin: "extracted", source: "flyer.pdf", sources: ["flyer"] },
    "schedule.date": { origin: "extracted", source: "flyer.pdf、memo", sources: ["flyer", "memo"] },
    "schedule.venue": { origin: "user" },
    // Recorded before attribution existed: a label and no ids.
    cta: { origin: "extracted", source: "flyer.pdf" },
    "visuals.value": { origin: "extracted", source: "flyer.pdf", sources: ["img-1"] },
  },
};

test("根拠の資料がすべて外れた値は、仮の値に戻る", () => {
  const result = withdrawMaterials(READ, new Set(["memo", "img-1"]), FALLBACK, NOW);
  assert.equal(result.brief.title, FALLBACK.title);
  assert.equal(result.brief.provenance?.title?.origin, "inferred");
  assert.equal(result.brief.provenance?.title?.note, WITHDRAWN_NOTE);
  assert.ok(result.withdrawn.some((entry) => entry.path === "title"));
  // The narration announced the old title, so it is now out of date.
  assert.equal(result.brief.factsUpdatedAt, NOW);
});

test("別の資料にも書かれている値は、その資料を根拠に残る", () => {
  const result = withdrawMaterials(READ, new Set(["memo", "img-1"]), FALLBACK, NOW);
  assert.equal(result.brief.schedule.date, "2026.10.2");
  assert.deepEqual(result.brief.provenance?.["schedule.date"]?.sources, ["flyer", "memo"]);
});

test("人が入れた値と、由来が記録されていない値は触らない", () => {
  const result = withdrawMaterials(READ, new Set(["memo", "img-1"]), FALLBACK, NOW);
  assert.equal(result.brief.schedule.venue, "渋谷");
  assert.equal(result.brief.cta, "申込はWebで");
});

test("外された素材を指すスロットは、テンプレートの既定に戻る", () => {
  const result = withdrawMaterials(READ, new Set(["flyer", "memo"]), FALLBACK, NOW);
  assert.deepEqual(result.brief.visuals.value, FALLBACK.visuals.value);
  assert.ok(result.withdrawn.some((entry) => entry.path === "visuals.value"));
  // A picture is seen, not said: the narration is not made stale by it.
  assert.equal(result.brief.factsUpdatedAt, READ.factsUpdatedAt);
  // And the facts that flyer and memo back are untouched.
  assert.equal(result.brief.title, "世界が恋する日本酒");
});

test("何も外れていなければ何も変えない", () => {
  const result = withdrawMaterials(READ, new Set(["flyer", "memo", "img-1"]), FALLBACK, NOW);
  assert.deepEqual(result.brief, READ);
  assert.deepEqual(result.withdrawn, []);
});
