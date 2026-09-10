import assert from "node:assert/strict";
import test from "node:test";
import { titleOffer, UNTITLED_VIDEO } from "./title";

const brief = (title: string, titleDeclined?: string | null) =>
  ({ title, titleDeclined }) as Parameters<typeof titleOffer>[1];

test("名前が未設定なら、読み取ったイベント名を提案する", () => {
  assert.equal(
    titleOffer(UNTITLED_VIDEO, brief("世界が恋する日本酒")),
    "世界が恋する日本酒",
  );
});

test("すでに同じ名前なら聞かない", () => {
  assert.equal(titleOffer("世界が恋する日本酒", brief("世界が恋する日本酒")), null);
  // 前後の空白は名前の違いではない。
  assert.equal(titleOffer(" 世界が恋する日本酒 ", brief("世界が恋する日本酒")), null);
});

test("映像にタイトルが無ければ聞かない", () => {
  assert.equal(titleOffer(UNTITLED_VIDEO, brief("")), null);
  assert.equal(titleOffer(UNTITLED_VIDEO, brief("   ")), null);
});

test("一度断られた名前は二度と聞かない", () => {
  // A prompt that comes back after "no" is not a question, it is nagging.
  assert.equal(
    titleOffer("自分でつけた名前", brief("世界が恋する日本酒", "世界が恋する日本酒")),
    null,
  );
});

test("別の名前が出てきたら、また聞く", () => {
  // Declining one proposal is not a standing instruction to never ask again:
  // the next flyer may be about a different event entirely.
  assert.equal(
    titleOffer("自分でつけた名前", brief("新しいイベント名", "世界が恋する日本酒")),
    "新しいイベント名",
  );
});

test("自分でつけた名前は、勝手には変わらない", () => {
  // The offer is the only path from brief.title to takes.title. Nothing here
  // returns a value that a caller could apply without asking.
  const proposed = titleOffer("秋の会", brief("世界が恋する日本酒"));
  assert.equal(proposed, "世界が恋する日本酒");
  assert.notEqual(proposed, "秋の会");
});
