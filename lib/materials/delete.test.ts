import assert from "node:assert/strict";
import test from "node:test";
import { collectFamily } from "./delete";

// What has to leave with a file. `derived_from_material_id` is ON DELETE SET
// NULL (migration 0028), so anything the walk misses does not fail loudly — it
// reappears in the inventory as a parentless row with no way to remove it.

const row = (id: string, parent: string | null = null) => ({
  id,
  label: `${id}.png`,
  r2_key: `brands/b/takes/t/materials/${id}`,
  derived_from_material_id: parent,
});

test("a file with nothing derived from it is its own family", () => {
  const rows = [row("photo"), row("flyer"), row("img1", "flyer")];
  assert.deepEqual(
    collectFamily(rows, "photo").map((entry) => entry.id),
    ["photo"],
  );
});

test("a PDF leaves with every image taken out of it", () => {
  const rows = [row("flyer"), row("img1", "flyer"), row("img2", "flyer"), row("other")];
  assert.deepEqual(
    collectFamily(rows, "flyer").map((entry) => entry.id),
    ["flyer", "img1", "img2"],
  );
});

test("descent is transitive: a normalised copy of an extracted image goes too", () => {
  const rows = [row("flyer"), row("img1", "flyer"), row("img1-trimmed", "img1")];
  assert.deepEqual(
    collectFamily(rows, "flyer").map((entry) => entry.id),
    ["flyer", "img1", "img1-trimmed"],
  );
  // Deleting the middle of the chain takes what hangs off it, not its parent.
  assert.deepEqual(
    collectFamily(rows, "img1").map((entry) => entry.id),
    ["img1", "img1-trimmed"],
  );
});

test("a cycle cannot hang the walk", () => {
  // The schema forbids self-derivation (materials_no_self_derivation) but says
  // nothing about a two-row loop, and a request that never returns is worse
  // than a family that comes back short.
  const rows = [row("a", "b"), row("b", "a")];
  assert.deepEqual(
    collectFamily(rows, "a").map((entry) => entry.id),
    ["a", "b"],
  );
});

test("an id that is not in the rows yields nothing", () => {
  assert.deepEqual(collectFamily([row("a")], "missing"), []);
});
