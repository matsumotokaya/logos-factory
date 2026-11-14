import assert from "node:assert/strict";
import test from "node:test";
import { inputOf } from "./inputs";
import { inputClaims } from "./read-inputs";

test("人が入れた素材だけが入力で、読み取りの出力や PDF から出た画像は入力ではない", () => {
  assert.deepEqual(
    inputOf({ source_kind: "upload", derived_from_material_id: null, provenance: { input: "url", read_at: "2026-11-14T00:00:00Z" } }),
    { kind: "url", readAt: "2026-11-14T00:00:00Z" },
  );
  assert.deepEqual(inputOf({ source_kind: "upload", derived_from_material_id: null, provenance: { input: "note" } }), {
    kind: "note",
    readAt: null,
  });
  // Uploaded before the kind was recorded.
  assert.deepEqual(inputOf({ source_kind: "upload", derived_from_material_id: null, provenance: null }), {
    kind: "file",
    readAt: null,
  });
  assert.equal(inputOf({ source_kind: "url_fetch", derived_from_material_id: null, provenance: {} }), null);
  assert.equal(inputOf({ source_kind: "upload", derived_from_material_id: "pdf-1", provenance: {} }), null);
});

test("資料の読み取りは、空の答えを記録しない", () => {
  const claims = inputClaims({
    operator_name: "ファンズ株式会社",
    operator_description: "",
    name: "Funds",
    tagline: " ",
    description: "固定利回りの資産運用サービスです。",
    audience: "",
    offering: "",
    tone: "丁寧で落ち着いた",
    features: [{ title: "1円から", description: "少額で始められます。" }, { title: " ", description: "x" }],
    voices: [],
  });
  const paths = claims.map((claim) => claim.field_path);
  assert.deepEqual(paths, ["identity.legal_name", "offering.name", "offering.description", "voice.tone", "offering.features"]);
  const tone = claims.find((claim) => claim.field_path === "voice.tone");
  // voice.tone is a design judgement: an expression claim must be `suggested` (0029).
  assert.equal(tone?.layer, "expression");
  assert.equal(tone?.confidence, "suggested");
  assert.deepEqual(claims.find((claim) => claim.field_path === "offering.features")?.value, [
    { title: "1円から", description: "少額で始められます。" },
  ]);
});
