import assert from "node:assert/strict";
import test from "node:test";
import { parkDecision } from "./source-toggle";

test("画面に出ていない素材は外せる", () => {
  assert.deepEqual(parkDecision("a", new Set(["b"])), { can: true });
});

test("画面に出ている素材は、場所を名指しして断る", () => {
  const decision = parkDecision("a", new Set(["a"]), [{ label: "シーン3 テーマ の背景" }]);
  assert.equal(decision.can, false);
  assert.ok(decision.can === false && decision.reason.includes("シーン3 テーマ の背景"));
});

test("場所を名付けられないテンプレートでも、使用中であることは言う", () => {
  const decision = parkDecision("a", new Set(["a"]));
  assert.equal(decision.can, false);
  assert.ok(decision.can === false && decision.reason.includes("使用中"));
});
