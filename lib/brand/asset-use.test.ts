import assert from "node:assert/strict";
import test from "node:test";
import { MATERIAL_CATEGORIES } from "@/lib/materials/category";
import { ASSET_USE, ASSET_USES, CORE_USES, isBrandAsset, readJudgement } from "./asset-use";

test("どの用途も、素材の分類の語彙に写せる", () => {
  for (const use of ASSET_USES) {
    assert.ok((MATERIAL_CATEGORIES as readonly string[]).includes(ASSET_USE[use].category), `${use} → ${ASSET_USE[use].category}`);
  }
});

test("先に見せる用途は、すべてブランドの素材の側にある", () => {
  for (const use of CORE_USES) assert.equal(ASSET_USE[use].tier, "core", use);
  assert.equal(ASSET_USE.editorial.tier, "possible");
  assert.equal(ASSET_USE.partner.tier, "possible");
});

test("記事の画像はチェックされたときだけブランドの素材になる", () => {
  const editorial = readJudgement({ asset: { use: "editorial", note: "記事", model: "m", at: "t" } });
  assert.equal(isBrandAsset(editorial), false);
  const picked = readJudgement({ asset: { use: "editorial", note: "記事", picked: true, model: "m", at: "t" } });
  assert.equal(isBrandAsset(picked), true);
  assert.equal(isBrandAsset(readJudgement({ asset: { use: "leadership", note: "代表", model: "m", at: "t" } })), true);
  assert.equal(readJudgement({ asset: { use: "nonsense" } }), null);
  assert.equal(readJudgement(null), null);
});
