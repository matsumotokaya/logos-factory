import assert from "node:assert/strict";
import test from "node:test";
import { videoState } from "./asset";

// How far along a video is, asked once for every template. The list and the
// detail screen each used to answer this, branching on the template id, and
// they had drifted apart.

const EVENT = { template: "event-cm", hasRender: false, hasBrief: true };

test("書き出したMP4があれば「MP4あり」", () => {
  assert.equal(videoState({ ...EVENT, hasRender: true }), "mp4_ready");
});

test("動画はブリーフだけで再生できる（追加した瞬間から）", () => {
  assert.equal(videoState(EVENT), "preview_ready");
  assert.equal(videoState({ ...EVENT, hasBrief: false }), "empty");
});

test("未知のテンプレートも同じ規則で答える", () => {
  assert.equal(videoState({ ...EVENT, template: "future-template" }), "preview_ready");
});
