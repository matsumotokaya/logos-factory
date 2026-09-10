import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAssetChoice,
  applyFactEdit,
  isAssetSlot,
  isSuppressed,
  markUserEdited,
  previewOf,
  setSuppressed,
} from "./facts";
// Suppression's effect on values is only observable through the film — the
// emptying step is private to eventCmFilm on purpose.
import { eventCmFilm } from "@/remotion/event-cm/film";
import { seedEventCmBrief } from "./seed";
import { eventCmGoalState } from "@/lib/pipeline/event-cm";

const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-11T09:00:00+09:00"), seed: "take-1" },
);

test("直した値は「あなたの入力」になり、仮の値として警告されない", () => {
  const before = eventCmGoalState(SEEDED);
  assert.ok(before.provisional.some((field) => field.path === "schedule.date"));

  const edited = markUserEdited(
    applyFactEdit(SEEDED, "schedule.date", ["2026.11.14"])!,
    "schedule.date",
  );
  const after = eventCmGoalState(edited);

  assert.equal(edited.schedule.date, "2026.11.14");
  assert.ok(!after.provisional.some((field) => field.path === "schedule.date"));
});

test("消した項目は「不足」ではなく「決めたこと」として扱われる", () => {
  // Nobody should be asked to go and find a fee they decided not to show.
  const off = setSuppressed(SEEDED, "schedule.fee", true);
  const state = eventCmGoalState(off);

  assert.equal(isSuppressed(off, "schedule.fee"), true);
  assert.ok(!state.fields.some((field) => field.path === "schedule.fee"));
  // 「voice」 is in here because a take is created with the reading switched off
  // (seed.ts, 2026-08-30). It is a SETTING recorded through the same mechanism,
  // not a fact somebody deleted — the list is every suppressed path, and the
  // two kinds have always shared it (`captions` is the other).
  assert.deepEqual(state.suppressed, ["voice", "schedule.fee"]);
});

test("消した項目は描画前に空にされる", () => {
  const off = setSuppressed(SEEDED, "seriesLabel", true);
  assert.equal(SEEDED.seriesLabel.length > 0, true);
  assert.equal(eventCmFilm(off).drawn.seriesLabel, "");
});

test("消してから戻すと元の値が返ってくる", () => {
  // Suppression hides; it never destroys.
  const off = setSuppressed(SEEDED, "valueChip", true);
  const on = setSuppressed(off, "valueChip", false);

  assert.equal(eventCmFilm(off).drawn.valueChip, null);
  assert.equal(eventCmFilm(on).drawn.valueChip, SEEDED.valueChip);
});

test("複数行の項目は1行1件として書き戻される", () => {
  const edited = applyFactEdit(SEEDED, "programs", [
    "基調講演",
    "",
    "  パネルディスカッション  ",
  ]);
  assert.deepEqual(edited?.programs, [
    { title: "基調講演" },
    { title: "パネルディスカッション" },
  ]);
});

test("編集できない項目への書き込みは拒否される", () => {
  assert.equal(applyFactEdit(SEEDED, "voice", ["なにか"]), null);
  assert.equal(applyFactEdit(SEEDED, "logos", ["なにか"]), null);
});

test("一覧の表示は生のJSONではなく読める形にする", () => {
  assert.equal(previewOf(SEEDED, "programs"), SEEDED.programs.map((p) => p.title).join(" / "));
  // Roles, not names — what the seeder proposes for the speaker picture.
  assert.equal(previewOf(SEEDED, "guests"), SEEDED.guests.map((g) => g.name).join("、"));
  assert.equal(previewOf(SEEDED, "schedule.date"), SEEDED.schedule.date);
});

test("音源スロットは選ぶもので、任意の値は書き込めない", () => {
  const chosen = applyAssetChoice(SEEDED, "bgm", "defaults/bgm/ink-cinematic.mp3");
  assert.equal(chosen?.bgm, "defaults/bgm/ink-cinematic.mp3");

  // Clearing is a legitimate choice: a film with no music.
  assert.equal(applyAssetChoice(SEEDED, "bgm", null)?.bgm, null);

  // Only declared asset slots. Text fields are edited, not chosen.
  assert.equal(applyAssetChoice(SEEDED, "title", "x"), null);
  assert.equal(isAssetSlot("bgm"), true);
  assert.equal(isAssetSlot("title"), false);
});

test("音楽を選ぶと「あなたの入力」になる", () => {
  const chosen = markUserEdited(
    applyAssetChoice(SEEDED, "bgm", "defaults/bgm/ink-cinematic.mp3")!,
    "bgm",
  );
  assert.equal(chosen.provenance?.bgm?.origin, "user");
});

test("音楽や写真を選び直しても、ナレーションは古くならない", () => {
  // The warning exists to say "the film is narrating a different event". A
  // music track is not something the narration says, so choosing one must not
  // put that warning on screen.
  const bgm = markUserEdited(SEEDED, "bgm", "2026-08-14T00:00:00.000Z");
  assert.equal(bgm.factsUpdatedAt, SEEDED.factsUpdatedAt);
  const photo = markUserEdited(SEEDED, "visuals.programs", "2026-08-14T00:00:00.000Z");
  assert.equal(photo.factsUpdatedAt, SEEDED.factsUpdatedAt);
  const portrait = markUserEdited(SEEDED, "guests[0].photo", "2026-08-14T00:00:00.000Z");
  assert.equal(portrait.factsUpdatedAt, SEEDED.factsUpdatedAt);

  // A spoken fact still stamps: that is the whole point of the field.
  const date = markUserEdited(SEEDED, "schedule.date", "2026-08-14T00:00:00.000Z");
  assert.equal(date.factsUpdatedAt, "2026-08-14T00:00:00.000Z");
  // And the origin is recorded either way, so no re-run overwrites the choice.
  assert.equal(bgm.provenance?.bgm?.origin, "user");
});

test("項目を消すのも事実の変更（ナレーションが古くなる）", () => {
  // Switching a field off changes what the film says as well as what it draws:
  // a suppressed field is emptied before the narration is written. Without the
  // stamp the deletion was invisible downstream — the narration stayed "current"
  // while describing speakers that were no longer in the film, and bakeState
  // reported nothing to reflect, so the player kept the deleted picture.
  const off = setSuppressed(SEEDED, "guests", true, "2026-08-15T00:00:00.000Z");
  assert.equal(off.factsUpdatedAt, "2026-08-15T00:00:00.000Z");

  const back = setSuppressed(off, "guests", false, "2026-08-15T01:00:00.000Z");
  assert.equal(back.factsUpdatedAt, "2026-08-15T01:00:00.000Z");
});

test("見せるだけの項目と、読み上げそのものは消しても古くならない", () => {
  // Same rule as choosing a track: a warning that appears when nothing is wrong
  // teaches people to ignore warnings. `voice` is here because it IS the
  // narration — switching the reading off must not ask for a rewrite of words
  // nobody is going to speak.
  for (const path of ["bgm", "visuals.closing", "guests[0].photo", "voice", "narration"]) {
    const off = setSuppressed(SEEDED, path, true, "2026-08-15T00:00:00.000Z");
    assert.equal(off.factsUpdatedAt, SEEDED.factsUpdatedAt, path);
  }
});
