import assert from "node:assert/strict";
import test from "node:test";
import * as cheerio from "cheerio";
import { extractDeclaredLogos } from "./ingest";

const BASE = new URL("https://example.co.jp/");

function extract(html: string) {
  return extractDeclaredLogos(cheerio.load(html), BASE);
}

test("JSON-LDのOrganization.logoを最優先で拾う", () => {
  const out = extract(`
    <script type="application/ld+json">
      {"@type":"Organization","name":"Example","logo":"https://example.co.jp/assets/logo.svg"}
    </script>
    <header><img src="/img/mark.png" alt=""></header>
  `);
  assert.equal(out[0].source, "json-ld");
  assert.equal(out[0].url, "https://example.co.jp/assets/logo.svg");
});

test("JSON-LDの@graphとImageObject形式も解決する", () => {
  const out = extract(`
    <script type="application/ld+json">
      {"@graph":[{"@type":"Corporation","logo":{"@type":"ImageObject","url":"/logo-square.png"}}]}
    </script>
  `);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://example.co.jp/logo-square.png");
});

test("altが日本語の「ロゴ」でもnamed-imgとして拾う", () => {
  const out = extract(`
    <header><div class="header_nav"><a href="/">
      <img src="/wp-content/uploads/BEST　ロゴ.png" alt="BEST株式会社ロゴ">
    </a></div></header>
  `);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "named-img");
  assert.match(out[0].note, /ヘッダー/);
  assert.match(out[0].note, /BEST株式会社ロゴ/);
});

test("ヘッダー内の無名imgはheader-imgとして拾い、本文の写真は拾わない", () => {
  const out = extract(`
    <header><a href="/"><img src="/mark.svg" alt=""></a></header>
    <main><img src="/photos/office.jpg" alt="オフィス"></main>
  `);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "header-img");
});

test("data: URIとURL重複は除外し、apple-touch-iconは最後に来る", () => {
  const out = extract(`
    <link rel="apple-touch-icon" href="/touch.png">
    <header>
      <img src="data:image/png;base64,AAAA" alt="logo">
      <img src="/logo.png" alt="site logo">
      <img src="/logo.png" alt="site logo duplicate">
    </header>
  `);
  assert.deepEqual(
    out.map((c) => c.source),
    ["named-img", "apple-touch-icon"],
  );
  assert.equal(out[0].url, "https://example.co.jp/logo.png");
});

test("宣言が何もないページは空配列", () => {
  assert.deepEqual(extract("<main><p>hello</p></main>"), []);
});
