import assert from "node:assert/strict";
import test from "node:test";
import catalog from "@/public/defaults/sfx/catalog.json";
import { eventCmSfxCue } from "./sfx-cues";
import { THEMES } from "@/remotion/kit/theme";
import type { EventCmSceneRole } from "@/remotion/event-cm/types";

// The approved column IS the specification.
//
// The 和 cue sheet went through three listening rounds with the requester and
// was delivered; what those rounds settled is measurable, and a new column
// (a new art direction's instruments) has to land inside the same envelope
// BEFORE anybody presses play. The first corporate draft is the reason: picked
// by label, it matched the approved first-second level exactly and still
// played as noise, because two of its four files were multi-second jingles
// still ringing at −25…−34 dB long after their moment (「効果音が異常に
// 大きい」, 2026-08-26). Levels can be computed; only register (does a piano
// note SUIT this film) is left for the ear.

const SOUNDS = (catalog as unknown as {
  sounds: Record<
    string,
    { headDb: number | null; tailDb: number | null; durationSec: number | null }
  >;
}).sounds;

const RINGING_ROLES: EventCmSceneRole[] = ["logoIn", "title", "program", "guests", "cta"];
const SILENT_ROLES: EventCmSceneRole[] = ["value", "logoOut"];

/** The opening is the one moment a column may leave to the music alone.
 *  The standard film opens without a hit (owner, 2026-08-30): its cue was the
 *  sheet's strongest presence landing inside the BGM's ramp-in. The approved
 *  和 column keeps the 拍子木 it was delivered with. */
const SILENT_OPENINGS = ["corporate"];

/** Every (palette, role) pair that rings, with its resolved cue. */
const ALL_CUES = Object.values(THEMES)
  .map((theme) => theme.sound.cues)
  .filter((cues, index, all) => all.indexOf(cues) === index)
  .flatMap((cues) =>
    RINGING_ROLES.map((role) => {
      const cue = eventCmSfxCue(role, 0, cues);
      return { cues, role, cue };
    }),
  );

const db = (multiplier: number): number => 20 * Math.log10(multiplier);

test("鳴る瞬間と鳴らない瞬間は、どの音の列でも同じ", () => {
  // The moments are the template's structure; the palette only changes the
  // instrument. A column that skips a chapter turn or punctuates the promise
  // has changed the film, not the sound. The one declared exception is the
  // opening (SILENT_OPENINGS above) — asserted exactly, so a column cannot
  // fall silent by accident.
  for (const { cues, role, cue } of ALL_CUES) {
    if (role === "logoIn" && SILENT_OPENINGS.includes(cues)) {
      assert.equal(cue, null, `${cues}: logoIn は鳴らない決定(2026-08-30)`);
      continue;
    }
    assert.ok(cue, `${cues}: ${role} が鳴らない`);
  }
  for (const theme of Object.values(THEMES)) {
    for (const role of SILENT_ROLES) {
      assert.equal(
        eventCmSfxCue(role, 0, theme.sound.cues),
        null,
        `${theme.sound.cues}: ${role} は鳴らない場面`,
      );
    }
  }
});

test("キューの実効音量は、承認済みの列と同じ帯に入る", () => {
  // Head: the file's first-second mean plus the volume the film plays it at.
  // The approved 和 column measures −29.1 … −32.2 dB; a new column sits in the
  // same band or it is a different mix, not a different instrument.
  for (const { cues, role, cue } of ALL_CUES) {
    if (!cue) continue;
    const file = cue.src.split("/").pop() ?? "";
    const sound = SOUNDS[file];
    assert.ok(sound, `${cues}/${role}: ${file} がカタログに無い`);
    assert.ok(sound.headDb !== null, `${cues}/${role}: ${file} の headDb が未測定`);
    const head = (sound.headDb as number) + db(cue.volume);
    assert.ok(
      head >= -34 && head <= -28,
      `${cues}/${role}: ${file} の頭1秒が ${head.toFixed(1)} dB（承認帯は −34〜−28）`,
    );
  }
});

test("キューは1秒で死ぬ（鳴った瞬間の後を引かない）", () => {
  // Tail: the file's post-first-second mean plus the played volume. Every
  // approved 和 cue dies to −46 dB or below; a jingle that keeps sparkling is
  // what 「異常に大きい」 actually was — its head level was fine.
  for (const { cues, role, cue } of ALL_CUES) {
    if (!cue) continue;
    const file = cue.src.split("/").pop() ?? "";
    const sound = SOUNDS[file];
    assert.ok(sound, `${cues}/${role}: ${file} がカタログに無い`);
    // No tail at all (a file within one second) is the best possible answer.
    if (sound.tailDb === null || sound.tailDb === undefined) {
      assert.ok(
        (sound.durationSec ?? 0) <= 1.05,
        `${cues}/${role}: ${file} は1秒超なのに tailDb が無い（npm run sfx:fetch で測り直す）`,
      );
      continue;
    }
    const tail = sound.tailDb + db(cue.volume);
    assert.ok(
      tail <= -45,
      `${cues}/${role}: ${file} が1秒後も ${tail.toFixed(1)} dB で鳴っている（承認済みの列は −46 以下）`,
    );
  }
});

test("章の転換と登壇者は同じ音で鳴る（承認済みの対の規則）", () => {
  for (const theme of Object.values(THEMES)) {
    const chapter = eventCmSfxCue("program", 0, theme.sound.cues);
    const arrival = eventCmSfxCue("guests", 0, theme.sound.cues);
    assert.equal(chapter?.src, arrival?.src, `${theme.sound.cues}: 章と登壇者の楽器が違う`);
  }
});

test("知らない音の列は、和の列に倒れる", () => {
  // The id comes from a theme a newer build may have written.
  const wa = eventCmSfxCue("logoIn", 0, "wa");
  const unknown = eventCmSfxCue("logoIn", 0, "not-a-palette" as never);
  assert.deepEqual(unknown, wa);
});
