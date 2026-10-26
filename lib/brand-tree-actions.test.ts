import assert from "node:assert/strict";
import test from "node:test";
import {
  brandActions,
  deletionConsequence,
  logoActions,
  takeActions,
} from "./brand-tree-actions";

const reasonFor = (actions: ReturnType<typeof brandActions>, id: string) =>
  actions.find((action) => action.id === id)?.blockedReason ?? null;

test("ブランドは中身が空のときだけ削除できる", () => {
  assert.equal(
    reasonFor(brandActions({ logoCount: 0, videoCount: 0, lpCount: 0 }), "delete"),
    null,
  );
  assert.match(
    reasonFor(brandActions({ logoCount: 0, videoCount: 2, lpCount: 1 }), "delete") ?? "",
    /動画・LP3件/,
  );
});

test("ブランドとロゴは複製を持たない", () => {
  // Not a stylistic choice: a copied Brand carries none of what makes it
  // that Brand.
  for (const actions of [
    brandActions({ logoCount: 0, videoCount: 0, lpCount: 0 }),
    logoActions(),
  ]) {
    assert.equal(
      actions.some((action) => action.id === "duplicate"),
      false,
    );
  }
});

test("動画は複製でき、公開中は削除だけが止まる", () => {
  const live = takeActions("video", { published: true });
  assert.equal(reasonFor(live, "duplicate"), null);
  assert.match(reasonFor(live, "delete") ?? "", /公開/);

  const draft = takeActions("video", { published: false });
  assert.equal(reasonFor(draft, "delete"), null);
  assert.equal(draft.find((action) => action.id === "delete")?.label, "動画を削除");
});

test("削除の確認文は名前から始まる1つの文になる", () => {
  // The dialog appends 「この操作は取り消せません。」 to this, so a fragment
  // here shows up as 「秋の展示会」この動画と… on screen.
  for (const kind of ["brand", "logo", "video"] as const) {
    const sentence = deletionConsequence(kind, "秋の展示会");
    assert.match(sentence, /^「秋の展示会」と、/);
    assert.match(sentence, /削除します。$/);
  }
  assert.match(deletionConsequence("logo", "x"), /プレゼンテーション/);
  assert.match(deletionConsequence("video", "x"), /MP4/);
});

test("ロゴ・動画は詳細を先頭に持ち、ブランドは持たない", () => {
  // The info page is the row's only way in, so every leaf offers it, and it
  // sits first because it is the one item that destroys nothing.
  for (const actions of [
    logoActions(),
    takeActions("video", { published: true }),
  ]) {
    assert.equal(actions[0]?.id, "info");
    assert.equal(actions[0]?.blockedReason, null);
    assert.equal(actions[0]?.danger, false);
  }
  assert.equal(
    brandActions({ logoCount: 0, videoCount: 0, lpCount: 0 }).some(
      (action) => action.id === "info",
    ),
    false,
  );
});

test("削除は常に danger、複製は常にそうでない", () => {
  const actions = takeActions("video", { published: false });
  assert.equal(actions.find((action) => action.id === "delete")?.danger, true);
  assert.equal(actions.find((action) => action.id === "duplicate")?.danger, false);
});
