import assert from "node:assert/strict";
import test from "node:test";
import { dedupeDeclared } from "./logo-resolve";
import type { DeclaredLogo } from "./ingest";

const declared = (url: string): DeclaredLogo => ({
  url,
  source: "named-img",
  alt: null,
  note: "test",
});

test("capture済みのファイルURLはHTML宣言側から除外する", () => {
  const out = dedupeDeclared(
    [declared("https://a.jp/logo.png"), declared("https://a.jp/other.png")],
    ["https://a.jp/logo.png", null],
  );
  assert.deepEqual(
    out.map((d) => d.url),
    ["https://a.jp/other.png"],
  );
});

test("クエリ文字列の違いは同じファイルとして扱う", () => {
  const out = dedupeDeclared(
    [declared("https://a.jp/logo.png?v=2")],
    ["https://a.jp/logo.png?v=1"],
  );
  assert.deepEqual(out, []);
});

test("captureが無ければ宣言はそのまま残る", () => {
  const out = dedupeDeclared([declared("https://a.jp/logo.png")], []);
  assert.equal(out.length, 1);
});
