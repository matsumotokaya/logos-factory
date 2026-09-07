import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTURE_FRAME,
  FRAME_GROUPS,
  GOAL_FIELDS,
  frameField,
  frameLabel,
  MATERIAL_SLOTS,
} from "./capture-frame";

// The database's own check on brand_knowledge_claims/values.field_path
// (migration 0029). A row the frame asks for that the column would reject is a
// field the product can never store, and the failure would only show up at
// insert time, mid-capture.
const FIELD_PATH = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$/;

test("every frame path is storable as a field_path", () => {
  for (const field of CAPTURE_FRAME) {
    assert.match(field.path, FIELD_PATH, `${field.path} would be rejected by the column`);
  }
});

test("no path appears twice", () => {
  const seen = new Set<string>();
  for (const field of CAPTURE_FRAME) {
    assert.equal(seen.has(field.path), false, `${field.path} is listed twice`);
    seen.add(field.path);
  }
});

test("every field has a label, a use and a group", () => {
  for (const field of CAPTURE_FRAME) {
    assert.ok(field.label.trim(), `${field.path} has no label`);
    assert.ok(field.useFor.trim(), `${field.path} does not say what it is for`);
    const group = FRAME_GROUPS.find((entry) => field.path.startsWith(entry.prefix));
    assert.ok(group, `${field.path} falls under no group heading`);
  }
});

test("the goal is the adoptable half of the frame", () => {
  // Only expression fields can be adopted: adopt_brand_knowledge stamps a fact
  // `confirmed`, and a crawl confirms nothing. A fact in the goal would be a
  // row that can never fill, so the map stage would under-report forever.
  for (const field of GOAL_FIELDS) {
    assert.equal(field.layer, "expression", `${field.path} is a fact and cannot be adopted`);
  }
  const required = CAPTURE_FRAME.filter((field) => field.required);
  for (const field of required) {
    assert.ok(
      GOAL_FIELDS.some((goal) => goal.path === field.path),
      `${field.path} is required but not counted in the goal`,
    );
  }
});

test("a required field is never something only a model can answer", () => {
  // Requiring a VLM/LLM judgement would mean a brand cannot be complete
  // without a paid call, and would make the goal unreachable offline.
  for (const field of CAPTURE_FRAME) {
    if (!field.required) continue;
    assert.equal(field.method, "rule", `${field.path} is required but not measurable`);
  }
});

test("frameField and frameLabel answer for known and unknown paths", () => {
  assert.equal(frameField("palette.primary")?.label, "プライマリカラー");
  assert.equal(frameLabel("palette.primary"), "プライマリカラー");
  assert.equal(frameField("nothing.here"), null);
  // An unnamed path renders as itself rather than disappearing.
  assert.equal(frameLabel("nothing.here"), "nothing.here");
});

test("material slots use the vocabularies the column accepts", () => {
  // 0028's CHECK on brand_materials.kind, and lib/materials/category.ts.
  const KINDS = new Set([
    "logo",
    "font",
    "photo",
    "keyvisual",
    "illustration",
    "audio",
    "video",
    "document",
    "other",
  ]);
  const CATEGORIES = new Set([
    "person",
    "product",
    "screen",
    "place",
    "scenery",
    "mark",
    "graphic",
    "document",
    "texture",
    "other",
  ]);
  for (const slot of MATERIAL_SLOTS) {
    assert.ok(KINDS.has(slot.kind), `${slot.key} has an unknown kind`);
    if (slot.category !== null) {
      assert.ok(CATEGORIES.has(slot.category), `${slot.key} has an unknown category`);
    }
  }
  // A slot name is not a category (asset-normalization §5.0): the key visual
  // slot must not claim to know what is depicted in it.
  const keyvisual = MATERIAL_SLOTS.find((slot) => slot.key === "keyvisual");
  assert.equal(keyvisual?.category, null);
});
