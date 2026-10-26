import assert from "node:assert/strict";
import test from "node:test";
import {
  ADDABLE_VIDEO_TEMPLATES,
  DEFAULT_ADDABLE_VIDEO_STYLE,
  parseVideoStyle,
  styleLabel,
  VIDEO_TEMPLATE_FAMILIES,
  VIDEO_TEMPLATES,
  videoDisplayName,
  videoFamilyIndex,
} from "./templates";
import { LUXURY_THEME, STANDARD_THEME, SUMI_THEME } from "@/remotion/kit/theme";

test("追加ダイアログに出るのは追加できるテンプレートだけ", () => {
  for (const template of ADDABLE_VIDEO_TEMPLATES) {
    assert.equal(VIDEO_TEMPLATES[template.id]?.addable, true);
    assert.ok(videoFamilyIndex(template.id) < VIDEO_TEMPLATE_FAMILIES.length);
  }
});

test("イベント紹介動画のスタイルはアートディレクションで、3つ並ぶ", () => {
  // The dialog's second question: the painting, not a second template.
  const family = VIDEO_TEMPLATE_FAMILIES.find((entry) => entry.name === "イベント紹介動画");
  assert.ok(family);
  assert.deepEqual(
    family.styles.map((style) => [style.templateId, style.artDirection, style.label]),
    // Order is the catalog's (`artDirections`), and the first entry is what the
    // dialog opens on: standard leads from 2026-08-30.
    [
      ["event-cm", STANDARD_THEME.id, STANDARD_THEME.name],
      ["event-cm", SUMI_THEME.id, SUMI_THEME.name],
      ["event-cm", LUXURY_THEME.id, LUXURY_THEME.name],
    ],
  );
  // No two styles in one family may read the same.
  const labels = family.styles.map((style) => style.label);
  assert.equal(new Set(labels).size, labels.length);
});

test("スタイルのキーは往復する", () => {
  for (const family of VIDEO_TEMPLATE_FAMILIES) {
    for (const style of family.styles) {
      assert.deepEqual(parseVideoStyle(style.key), {
        templateId: style.templateId,
        artDirection: style.artDirection,
      });
    }
  }
  assert.ok(DEFAULT_ADDABLE_VIDEO_STYLE.key.length > 0);
});

test("Takeの名前は家族と塗りで組む", () => {
  assert.equal(videoDisplayName("event-cm", "standard"), "イベント紹介動画 - スタンダード");
  assert.equal(videoDisplayName("event-cm", "sumi"), "イベント紹介動画 - モダンジャパニーズ");
  assert.equal(videoDisplayName("event-cm", "luxury"), "イベント紹介動画 - ラグジュアリー");
  // An old take with no painting recorded is named the way it is painted.
  assert.equal(styleLabel("event-cm", null), SUMI_THEME.name);
});
