import assert from "node:assert/strict";
import test from "node:test";
import { buildProfile, fontFamilies, socialHandle } from "./profile";

const value = (fieldPath: string, v: unknown) => ({
  fieldPath,
  value: v,
  confidence: "adopted",
  decidedAt: "2026-11-01T00:00:00Z",
});
const claim = (fieldPath: string, v: unknown, confidence = "inferred") => ({
  fieldPath,
  value: v,
  layer: "fact",
  confidence,
  sourceKind: "llm_structuring",
  observedAt: "2026-11-01T00:00:00Z",
});

test("採用された値は推定より優先され、推定だけの項目は推定として出る", () => {
  const profile = buildProfile(
    [value("palette.primary", "#082838")],
    [claim("palette.primary", "#000000"), claim("identity.legal_name", "ファンズ株式会社")],
  );
  assert.deepEqual(profile.get("palette.primary"), {
    value: "#082838",
    state: "adopted",
    confidence: "adopted",
    sourceKind: null,
  });
  assert.equal(profile.get("identity.legal_name")?.state, "claimed");
  assert.equal(profile.get("identity.legal_name")?.sourceKind, "llm_structuring");
  assert.equal(profile.get("contact.telephone"), null);
});

test("確度 unknown の推定は読みとして扱わない", () => {
  const profile = buildProfile([], [claim("contact.email", "", "unknown")]);
  assert.equal(profile.get("contact.email"), null);
});

test("text と list は型が合わないものを返さない", () => {
  const profile = buildProfile(
    [value("layout.nav_items", ["ログイン", "", 3]), value("layout.density", 1.41)],
    [],
  );
  assert.deepEqual(profile.list("layout.nav_items"), ["ログイン"]);
  assert.equal(profile.text("layout.density"), null);
  assert.deepEqual(profile.list("layout.density"), []);
});

test("書体の族名は総称ファミリーと引用符を除いて並ぶ", () => {
  assert.deepEqual(fontFamilies('"Ubuntu", Noto Sans JP, sans-serif'), ["Ubuntu", "Noto Sans JP"]);
  assert.deepEqual(fontFamilies(null), []);
  assert.deepEqual(fontFamilies("system-ui, -apple-system"), []);
});

test("SNSのURLはハンドルに縮める", () => {
  assert.equal(socialHandle("https://www.instagram.com/funds_jp"), "@funds_jp");
  assert.equal(socialHandle("https://x.com/Funds_jp"), "@Funds_jp");
  assert.equal(socialHandle("https://www.youtube.com/@funds"), "@funds");
  assert.equal(socialHandle("https://www.linkedin.com/company/funds-inc/"), "@funds-inc");
  assert.equal(socialHandle("https://www.facebook.com/"), "facebook.com");
  assert.equal(socialHandle("not a url"), "not a url");
});
