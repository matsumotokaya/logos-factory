// The budgets were told to the writer and never checked afterwards. These say
// what the check reports — including what it reports when everything passes,
// which is the case that makes the report worth showing at all.

import assert from "node:assert/strict";
import test from "node:test";
import { eventCmContract, eventCmContractFailures } from "./contract";
import { seedEventCmBrief } from "./seed";
import {
  eventCmNarratedSteps,
  eventCmSceneBudget,
  eventCmSceneKey,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

const NOW = new Date("2026-08-11T09:00:00+09:00");
const BRAND = {
  name: "WealthPark Lab",
  industry: "金融教育メディア",
  description: "投資の本質をテーマに発信する情報メディアです。",
};
const seeded = (): EventCmBrief =>
  seedEventCmBrief(BRAND, { now: NOW, seed: "take-1" }) as EventCmBrief;

const checkById = (brief: EventCmBrief, id: string) => {
  const found = eventCmContract(brief).find((check) => check.id === id);
  assert.ok(found, `${id} がレポートに無い`);
  return found;
};

test("シードした下書きは、シーンの対応も文字数も契約どおり", () => {
  // The seeded lines are written to their budgets on purpose (seed.ts), so a
  // failure here means the draft and the contract have drifted apart.
  const brief = seeded();
  assert.deepEqual(eventCmContractFailures(brief), []);
});

test("合格した検査も数字を出す", () => {
  // A check that only speaks when it fails cannot be told apart from one that
  // never ran.
  const brief = seeded();
  const narrated = eventCmNarratedSteps(brief).length;
  assert.match(checkById(brief, "scenes").detail, new RegExp(`${narrated}シーン`));
  assert.match(checkById(brief, "total-chars").detail, /^\d+字・約[\d.]+秒（予算180〜260字）$/);
});

test("予算を超えたシーンは、そのシーンの予算で報告される", () => {
  // The programme pictures do not share one budget: the first is allowed
  // 45-84 characters and the rest 30-62. Looking the budget up by role alone
  // reported the wrong numbers for every programme after the first.
  const brief = seeded();
  const second = brief.narration.scenes.findIndex(
    (scene) => scene.role === "program" && scene.index === 1,
  );
  assert.ok(second >= 0, "アジェンダ2がシードに無い");
  const scenes = brief.narration.scenes.map((scene, i) =>
    i === second ? { ...scene, text: "あ".repeat(70) } : scene,
  );
  const over = { ...brief, narration: { ...brief.narration, scenes } };

  const budget = eventCmSceneBudget({ role: "program", index: 1 });
  const check = checkById(over, "scene-chars");
  assert.equal(check.ok, false);
  assert.equal(
    check.detail,
    `アジェンダ2 70字（予算${budget.min}〜${budget.max}字・超過）`,
  );
});

test("行の無いシーンと、映像に無い行を名指しする", () => {
  const brief = seeded();
  const dropped = brief.narration.scenes[0];
  const scenes = [
    ...brief.narration.scenes.slice(1),
    { role: "value" as const, index: 7, text: "行き場のない行です。" },
  ];
  const broken = { ...brief, narration: { ...brief.narration, scenes } };

  const check = checkById(broken, "scenes");
  assert.equal(check.ok, false);
  assert.match(check.detail, new RegExp(`行が無い: ${eventCmSceneKey(dropped)}`));
  assert.match(check.detail, /映像に無い行: value#7/);
});
