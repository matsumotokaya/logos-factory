import assert from "node:assert/strict";
import test from "node:test";
import { videoPipeline, type VideoPipelineInput } from "./video";

const BASE: VideoPipelineInput = {
  template: "event-cm",
  hasBrief: true,
  sourceCount: 1,
  sourcePinnedAt: "2026-08-14T09:00:00Z",
  runs: {
    extract: "2026-08-14T09:10:00Z",
    structure: "2026-08-14T09:20:00Z",
    map: "2026-08-14T09:30:00Z",
  },
  briefUpdatedAt: "2026-08-14T09:30:00Z",
  brief: { title: "イベント" },
  renderStatus: "empty",
  renderUpdatedAt: null,
  artifactCreatedAt: null,
};

const lastStage = (input: VideoPipelineInput) => {
  const stage = videoPipeline(input).stages.find((item) => item.id === "output");
  assert.ok(stage, "最終段が無い");
  return stage;
};

test("焼き付けを持つテンプレートでは、最終段はMP4ではなく動画", () => {
  const stage = lastStage({ ...BASE, bake: { at: "2026-08-14T10:00:00Z", changes: 0 } });
  assert.equal(stage.label, "動画プレビュー");
  assert.equal(stage.status, "ready");
  assert.match(stage.summary, /反映済み/);
  // The chain's last dot must not go green or red because of a file nobody
  // asked for (§9.4): there is no MP4 here at all.
  assert.equal(stage.producedAt, "2026-08-14T10:00:00Z");
});

test("一度も実行していなければ空。MP4の有無は関係しない", () => {
  const stage = lastStage({
    ...BASE,
    bake: { at: null, changes: 0 },
    renderStatus: "ready",
    artifactCreatedAt: "2026-08-14T11:00:00Z",
  });
  assert.equal(stage.status, "empty");
  assert.match(stage.summary, /下書き/);
});

test("絵コンテに未反映の変更があれば stale で、件数を言う", () => {
  const stage = lastStage({ ...BASE, bake: { at: "2026-08-14T10:00:00Z", changes: 2 } });
  assert.equal(stage.status, "stale");
  assert.match(stage.summary, /2件/);
});

test("上流が古ければ、焼き付け済みでも古い", () => {
  const stage = lastStage({
    ...BASE,
    // Read again after the last time it was applied: the mapping stage goes
    // stale, and staleness travels to the end of the chain even though the
    // fixed copy is newer than everything.
    runs: {
      extract: "2026-08-14T09:10:00Z",
      structure: "2026-08-14T09:40:00Z",
      map: "2026-08-14T09:30:00Z",
    },
    bake: { at: "2026-08-14T10:00:00Z", changes: 0 },
  });
  assert.equal(stage.status, "stale");
});

test("焼き付けを持たないテンプレートは、これまでどおりMP4のまま", () => {
  const stage = lastStage({
    ...BASE,
    template: "event-promo",
    renderStatus: "ready",
    artifactCreatedAt: "2026-08-14T10:00:00Z",
  });
  assert.equal(stage.label, "出力");
  assert.match(stage.summary, /MP4/);
  assert.equal(stage.status, "ready");
});

const inputStage = (input: VideoPipelineInput) => {
  const stage = videoPipeline(input).stages.find((item) => item.id === "input");
  assert.ok(stage, "入力段が無い");
  return stage;
};

test("読んだ集合と今の集合が同じなら、読み取り済み", () => {
  const stage = inputStage({ ...BASE, sourceCount: 2, sourceIds: ["a", "b"], readIds: ["a", "b"] });
  assert.equal(stage.status, "ready");
  assert.match(stage.summary, /読み取り済み/);
});

test("資料を外すと、追加と同じく要更新になる", () => {
  // The remaining pin is older than the reading, so a timestamp would say
  // "read". The set says otherwise, and says what changed.
  const stage = inputStage({ ...BASE, sourceCount: 1, sourceIds: ["a"], readIds: ["a", "b"] });
  assert.equal(stage.status, "stale");
  assert.match(stage.summary, /外した1件/);
});

test("資料を足すと要更新で、何件かを言う", () => {
  const stage = inputStage({ ...BASE, sourceCount: 3, sourceIds: ["a", "b", "c"], readIds: ["a"] });
  assert.equal(stage.status, "stale");
  assert.match(stage.summary, /追加2件/);
});

test("外した資料は、下流まで古くする", () => {
  const stages = videoPipeline({ ...BASE, sourceCount: 1, sourceIds: ["a"], readIds: ["a", "b"] }).stages;
  assert.equal(stages.find((stage) => stage.id === "structure")?.status, "stale");
  assert.equal(stages.find((stage) => stage.id === "map")?.status, "stale");
});

test("読んだ集合が記録されていない古い実行では、時刻で判定する", () => {
  const stage = inputStage({ ...BASE, sourceIds: ["a"], readIds: null });
  assert.equal(stage.status, "ready");
});
