import assert from "node:assert/strict";
import test from "node:test";
import { isMaterialScope, promotionRefusal, promotionTo } from "./promotion";

test("この動画の素材はブランドの基盤へ上げられる", () => {
  const decision = promotionTo({ scope: "take" }, "brand");
  assert.equal(decision.can, true);
  assert.equal(decision.can && decision.to, "brand");
});

test("ブランドの素材を動画へ引き込む操作は、まだ無いと言って断る", () => {
  // コピー型(2026-09-08)では正当な操作だが、提供している画面が無い。
  // 黙って通すより、無いと名指しする。
  const decision = promotionTo({ scope: "brand" }, "take");
  assert.equal(decision.can, false);
  assert.ok(decision.can === false && decision.reason.includes("まだありません"));
});

test("すでに基盤にあるものは、そう言って断る", () => {
  const decision = promotionTo({ scope: "brand" }, "brand");
  assert.equal(decision.can, false);
  assert.ok(decision.can === false && decision.reason.includes("すでに"));
});

test("v3のスコープは take と brand の2段だけ", () => {
  // work スコープは 0056 で廃止した（イベントは子Brandになった）。
  assert.equal(isMaterialScope("work"), false);
  assert.equal(promotionTo({ scope: "take" }, "work").can, false);
  assert.equal(promotionTo({ scope: "take" }, "brand").can, true);
});

test("知らないスコープは受け付けない", () => {
  assert.equal(isMaterialScope("brand"), true);
  assert.equal(isMaterialScope("global"), false);
  assert.equal(promotionTo({ scope: "take" }, "global").can, false);
  assert.equal(promotionTo({ scope: "宇宙" }, "brand").can, false);
});

test("権限の断りは、足りない権限を名指しする", () => {
  // RLSは禁止された更新を0行で返すので、断りと不在が同じ形に見える。
  // 「素材が見つかりません」と言うと、人は間違ったものを探しに行く。
  assert.ok(promotionRefusal("brand").includes("管理者"));
  assert.ok(!promotionRefusal("brand").includes("見つかりません"));
});
