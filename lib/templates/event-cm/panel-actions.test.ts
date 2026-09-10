import assert from "node:assert/strict";
import test from "node:test";
import { panelDeletion } from "./panel-actions";
import { seedEventCmBrief } from "./seed";
import {
  EVENT_CM_SUPPRESSED_NOTE as SUPPRESSED_NOTE,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-14T09:00:00+09:00"), seed: "take-1" },
);

const WITH_GUESTS: EventCmBrief = {
  ...SEEDED,
  guests: [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null }],
};

test("登壇者のシーンは削除できる（値は残るので戻せる）", () => {
  const decision = panelDeletion(WITH_GUESTS, { role: "guests" });
  assert.equal(decision.can, true);
  assert.equal(decision.can && decision.kind, "suppress");
  assert.equal(decision.can && decision.kind === "suppress" && decision.path, "guests");
});

test("アジェンダは1枚ずつ削除できる（値は残るので戻せる）", () => {
  // Three pictures, whatever the programme list holds. Deleting one used to
  // remove the ITEM, which only worked while the number of pictures followed
  // the number of items (EVENT_CM_PROGRAM_SCENES).
  const decision = panelDeletion(SEEDED, { role: "program", index: 1 });
  assert.equal(decision.can, true);
  assert.equal(decision.can && decision.kind, "suppress");
  assert.equal(
    decision.can && decision.kind === "suppress" && decision.path,
    "program.1",
  );
  assert.ok(
    decision.can && decision.confirm.includes("アジェンダ2"),
    "どの絵を消すのか言っていない",
  );
});

test("プログラムが1つでも、アジェンダは3枚あるので削除できる", () => {
  // The old rule read `programs.length <= 1` and refused. The picture count no
  // longer follows the item count, so an evening with one programme still has
  // two spare pictures to delete.
  const one: EventCmBrief = { ...SEEDED, programs: [SEEDED.programs[0]] };
  assert.equal(panelDeletion(one, { role: "program", index: 2 }).can, true);
});

test("最後に残った1枚は削除できない（空の枠が残るだけになる）", () => {
  const off = { origin: "user" as const, note: SUPPRESSED_NOTE };
  const two: EventCmBrief = {
    ...SEEDED,
    provenance: { ...SEEDED.provenance, "program.1": off, "program.2": off },
  };
  const decision = panelDeletion(two, { role: "program", index: 0 });
  assert.equal(decision.can, false);
  assert.match(decision.can === false ? decision.reason : "", /1つ残ります/);
});

test("構成が固定のシーンは削除できず、理由を言う", () => {
  for (const role of ["logoIn", "title", "value", "cta", "logoOut"] as const) {
    const decision = panelDeletion(SEEDED, { role });
    assert.equal(decision.can, false, `${role} が削除できることになっている`);
    assert.ok(
      decision.can === false && decision.reason.length > 10,
      `${role} の理由が説明になっていない`,
    );
  }
});
