import assert from "node:assert/strict";
import test from "node:test";
import { bulkRunPlan, stageActions } from "./stage-actions";
import type { PipelineStage, PipelineStageId, PipelineStageStatus } from "./stages";

/**
 * A pipeline in whatever state the test needs, in chain order.
 *
 * Four stages, not the five of `PIPELINE_STAGES`: the video pipeline merges
 * input and extraction into one drawer (lib/pipeline/video.ts), and the labels
 * are the ones that pipeline gives them — a reason string quotes them.
 */
const LABELS: Partial<Record<PipelineStageId, string>> = {
  input: "入力・抽出",
  structure: "構造化",
  map: "マッピング",
  output: "動画",
};

const pipeline = (
  statuses: Partial<Record<PipelineStageId, PipelineStageStatus>>,
): PipelineStage[] =>
  (["input", "structure", "map", "output"] as PipelineStageId[]).map((id) => ({
    id,
    label: LABELS[id] ?? id,
    status: statuses[id] ?? "empty",
    summary: "",
    producedAt: null,
  }));

const READ = { input: "ready", structure: "ready", map: "ready" } as const;

test("資料が無ければ読み取りは押せず、理由を出す", () => {
  const { own } = stageActions({
    stageId: "input",
    stages: pipeline({}),
    hasMaterial: false,
    filmSteps: [],
  });
  assert.equal(own?.enabled, false);
  assert.equal(own?.reason, "先に資料かテキストを追加してください");
});

test("すべて読み取り済みなら読み取りは押せず、理由は出さない", () => {
  // Nothing to do is not a reason: the button is already greyed out and the
  // stage badge says 「読み取り済み」 (2026-09-08).
  const { own } = stageActions({
    stageId: "input",
    stages: pipeline({ input: "ready" }),
    hasMaterial: true,
    filmSteps: [],
  });
  assert.equal(own?.enabled, false);
  assert.equal(own?.reason, null);
});

test("前の段が古いあいだは次へ進めない", () => {
  // Applying a mapping whose structuring is out of date applies the wrong facts.
  const { advance } = stageActions({
    stageId: "structure",
    stages: pipeline({ input: "ready", structure: "stale" }),
    hasMaterial: true,
    filmSteps: [],
  });
  assert.equal(advance?.enabled, false);
  assert.equal(advance?.reason, "構造化が最新になると実行できます");
});

test("資料が1件も無くても映像の段は押せる", () => {
  // The one rule this file exists for. A seeded take has no documents by design
  // (§9.9) and still has a complete brief, so the narration, the reading aloud
  // and the fixing all have something to work on. `hasMaterial` gates reading.
  const { advance } = stageActions({
    stageId: "map",
    stages: pipeline(READ),
    hasMaterial: false,
    filmSteps: ["narration", "voice", "bake"],
  });
  assert.equal(advance?.run, "film");
  assert.equal(advance?.enabled, true);
  assert.equal(advance?.reason, null);
});

test("映像の段のラベルは、実際にやることを並べる", () => {
  // One fixed label would be wrong whenever only one step is left — and the
  // words are the same ones the badge and the player's notice use (§9.7).
  const label = (steps: Parameters<typeof stageActions>[0]["filmSteps"]) =>
    stageActions({ stageId: "map", stages: pipeline(READ), hasMaterial: true, filmSteps: steps })
      .advance?.label;

  assert.equal(label(["narration", "voice", "bake"]), "ナレーションを書く・読み上げる・動画プレビューに反映する");
  assert.equal(label(["bake"]), "動画プレビューに反映する");
  assert.equal(label(["voice", "bake"]), "読み上げる・動画プレビューに反映する");
});

test("映像が最新なら押せず、段の状態ではなく残り工程で判定する", () => {
  // A film can be fixed and still owe work: a recording the narration has outrun
  // is not a stale stage, it is a step nobody has taken. So the answer comes
  // from the pending steps, never from `output.status`.
  const fixed = stageActions({
    stageId: "map",
    stages: pipeline({ ...READ, output: "ready" }),
    hasMaterial: true,
    filmSteps: [],
  });
  assert.equal(fixed.advance?.enabled, false);
  assert.equal(fixed.advance?.reason, null, "反映済みは理由として出さない");

  const owesVoice = stageActions({
    stageId: "map",
    stages: pipeline({ ...READ, output: "ready" }),
    hasMaterial: true,
    filmSteps: ["voice", "bake"],
  });
  assert.equal(owesVoice.advance?.enabled, true, "焼き済みでも読み上げが残れば押せる");
});

test("焼き付けを持たないテンプレートのマッピング段はボタンを出さない", () => {
  // product-cm / event-promo end at the mapping. A button that would call
  // nothing is worse than no button.
  const actions = stageActions({
    stageId: "map",
    stages: pipeline(READ),
    hasMaterial: true,
    filmSteps: null,
  });
  assert.equal(actions.advance, null);
  assert.equal(actions.own, null);
});

test("マッピングが古いあいだは映像にできない", () => {
  // Fixing a film whose facts have not been applied fixes the wrong film.
  const { advance } = stageActions({
    stageId: "map",
    stages: pipeline({ input: "ready", structure: "ready", map: "stale" }),
    hasMaterial: true,
    filmSteps: ["bake"],
  });
  assert.equal(advance?.enabled, false);
  assert.equal(advance?.reason, "マッピングが最新になると実行できます");
});

test("最後の段自身はボタンを持たない", () => {
  // Every drawer offers the step OUT of it; the last one has nowhere to go.
  // Re-running a finished film is the page-level button's job.
  const actions = stageActions({
    stageId: "output",
    stages: pipeline({ ...READ, output: "ready" }),
    hasMaterial: true,
    filmSteps: [],
  });
  assert.equal(actions.own, null);
  assert.equal(actions.advance, null);
});

// ---------------------------------------------------------------------------
// 「未処理2件」と言いながら押せないボタン
//
// Reported from the running app on 2026-08-25: a take was seeded, a voice was
// chosen, the badge said 未処理2件, and the button showed a blocked cursor with
// no explanation. Three separate mistakes met — the gate, the fall-through, and
// where the reason was written — so all three are pinned here.

const READY_STAGES: PipelineStage[] = [
  { id: "input", status: "ready" } as PipelineStage,
  { id: "structure", status: "ready" } as PipelineStage,
  { id: "map", status: "ready" } as PipelineStage,
];

test("資料が無くても、映像側の未処理は実行できる", () => {
  // The exact reported state: nothing to read, two things to apply.
  const plan = bulkRunPlan({ stages: [], sourceCount: 0, filmStepCount: 2 });
  assert.deepEqual(plan.read, [], "読む資料が無いのに読み取りを走らせようとしている");
  assert.equal(plan.redo, false, "未処理があるのに全部やり直しになっている");
});

test("資料が無いときに、読み取りへ落ちない", () => {
  // The fall-through that made the gate look necessary: an empty read-list was
  // read as "nothing pending, so re-run everything" — including the reading it
  // had just been told it could not do.
  const plan = bulkRunPlan({ stages: [], sourceCount: 0, filmStepCount: 0 });
  assert.deepEqual(plan.read, [], "資料ゼロで extract を走らせようとしている");
  assert.equal(plan.redo, true, "やり直しとして扱われていない");
});

test("資料があって全段済みなら、頼み直しは全部を通す", () => {
  const plan = bulkRunPlan({ stages: READY_STAGES, sourceCount: 2, filmStepCount: 0 });
  assert.deepEqual(plan.read, ["extract", "structure", "map"]);
  assert.equal(plan.redo, true);
});

test("読み取りの未処理は依存の順に積む", () => {
  // structure cannot be ready before input is: the map stage has a seeded brief
  // from creation, so its own status can look ready while it waits.
  const plan = bulkRunPlan({
    stages: [
      { id: "input", status: "empty" } as PipelineStage,
      { id: "structure", status: "ready" } as PipelineStage,
      { id: "map", status: "ready" } as PipelineStage,
    ],
    sourceCount: 1,
    filmStepCount: 0,
  });
  assert.deepEqual(plan.read, ["extract", "structure", "map"]);
  assert.equal(plan.redo, false);
});
