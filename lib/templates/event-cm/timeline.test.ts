import assert from "node:assert/strict";
import test from "node:test";
import {
  eventCmTimeline,
  EVENT_CM_INTRO_MS,
  EVENT_CM_OUTRO_MS,
  EVENT_CM_SCENE_GAP_MS,
} from "@/remotion/event-cm/timeline";
import {
  EVENT_CM_SUPPRESSED_NOTE,
  eventCmNarratedSteps,
  eventCmScenePlan,
  type EventCmBrief,
} from "@/remotion/event-cm/types";
import { seedEventCmBrief } from "./seed";

// The seeded brief names nobody — people are never invented (seed.ts) — but it
// still has the speaker picture, with the roles the seeder proposes on it. The
// film's shape is the template's, not the facts'.
const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-11T09:00:00+09:00"), seed: "take-1" },
);

const GUESTS = [
  { name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null },
  { name: "大西 美香", role: "Miss SAKE 代表理事", photo: null },
];

const withNarration = (brief: EventCmBrief, texts: string[]): EventCmBrief => ({
  ...brief,
  narration: {
    ...brief.narration,
    // One line per narrated PICTURE. A brief that lists three programmes has
    // three programme pictures, so a fixture handing over four lines pads with
    // its last one rather than leaving scenes wordless (which would silently
    // fall back to the budget and make the arithmetic below meaningless).
    scenes: eventCmNarratedSteps(brief).map(({ role, index }, i) => ({
      role,
      ...(index === undefined ? {} : { index }),
      text: texts[i] ?? texts[texts.length - 1] ?? "",
    })),
  },
});

test("録音前の尺は、読みが書かれていればその長さで見る", () => {
  // A subtitle and its reading are not the same length — 「〆張鶴」 is three
  // characters and しめはりつる is six — and the picture holds for as long as the
  // VOICE takes. Estimating from the subtitle would make such a scene short
  // before the recording lands and right afterwards, which on screen looks like
  // the renderer changing its mind.
  const plain = withNarration(SEEDED, ["あ".repeat(40)]);
  const spelledOut: EventCmBrief = {
    ...plain,
    narration: {
      ...plain.narration,
      scenes: plain.narration.scenes.map((scene, index) =>
        index === 0 ? { ...scene, reading: "あ".repeat(120) } : scene,
      ),
    },
  };
  const titleOf = (brief: EventCmBrief) =>
    eventCmTimeline(brief).scenes.find((scene) => scene.role === "title")!;
  assert.ok(
    titleOf(spelledOut).durationMs > titleOf(plain).durationMs,
    "読みが長いのに尺が伸びていない",
  );

  // And the other direction, so this is a rule and not a one-way nudge: a
  // reading shorter than its subtitle shortens the scene.
  const abbreviated: EventCmBrief = {
    ...plain,
    narration: {
      ...plain.narration,
      scenes: plain.narration.scenes.map((scene, index) =>
        index === 0 ? { ...scene, reading: "あ".repeat(10) } : scene,
      ),
    },
  };
  assert.ok(
    titleOf(abbreviated).durationMs < titleOf(plain).durationMs,
    "読みが短いのに尺が縮んでいない",
  );
});

test("ナレーションが無くても全シーンの尺が決まる", () => {
  // This is what makes "add a video" produce something that plays: no LLM
  // call, no render, and still a complete film. The seeded take now arrives
  // WITH a draft, so `budget` is the stage below that — a take whose lines have
  // all been cleared.
  const timeline = eventCmTimeline({
    ...SEEDED,
    narration: { ...SEEDED.narration, scenes: [] },
  });

  assert.equal(timeline.source, "budget");
  assert.deepEqual(
    timeline.scenes.map((scene) => scene.role),
    eventCmScenePlan(SEEDED).map((step) => step.role),
  );
  assert.ok(timeline.scenes.every((scene) => scene.durationMs > 0));
});

test("ロゴで始まりロゴで終わる", () => {
  const timeline = eventCmTimeline(SEEDED);
  const first = timeline.scenes[0];
  const last = timeline.scenes[timeline.scenes.length - 1];

  assert.equal(first.role, "logoIn");
  assert.equal(first.fromMs, 0);
  assert.equal(first.durationMs, EVENT_CM_INTRO_MS);

  assert.equal(last.role, "logoOut");
  assert.equal(last.durationMs, EVENT_CM_OUTRO_MS);
  assert.equal(last.fromMs + last.durationMs, timeline.totalMs);
});

test("ナレーションは2番目のシーンから始まり、締めのロゴの前で終わる", () => {
  const timeline = eventCmTimeline(SEEDED);
  assert.equal(timeline.voiceStartMs, EVENT_CM_INTRO_MS);
  assert.equal(timeline.scenes[1].role, "title");
  assert.equal(timeline.scenes[1].fromMs, EVENT_CM_INTRO_MS);
  assert.equal(timeline.voiceEndMs, timeline.totalMs - EVENT_CM_OUTRO_MS);
});

test("登壇者のシーンは、消したときだけ存在しない", () => {
  // The picture belongs to the template (EVENT_CM_SCENES), so it is there from
  // the start. An empty guest list used to remove it, which meant the film's
  // shape moved whenever the facts did.
  const present = eventCmTimeline(SEEDED).scenes.map((scene) => scene.role);
  const deleted = eventCmTimeline({
    ...SEEDED,
    provenance: {
      ...SEEDED.provenance,
      guests: { origin: "user", note: EVENT_CM_SUPPRESSED_NOTE },
    },
  }).scenes.map((scene) => scene.role);

  assert.equal(present.includes("guests"), true);
  assert.equal(deleted.includes("guests"), false);
  assert.equal(present.length, deleted.length + 1);
});

test("シーンは隙間なく連続する", () => {
  const timeline = eventCmTimeline({ ...SEEDED, guests: GUESTS });
  let expected = 0;
  for (const scene of timeline.scenes) {
    assert.equal(scene.fromMs, expected, `${scene.role} が前のシーンの直後から始まる`);
    expected += scene.durationMs;
  }
  assert.equal(timeline.totalMs, expected);
});

test("ロゴは認識できる長さだけ出る", () => {
  // A mark that appears and vanishes inside a second reads as a glitch.
  assert.ok(EVENT_CM_INTRO_MS >= 3500, "冒頭のロゴが短すぎる");
  assert.ok(EVENT_CM_OUTRO_MS >= 3500, "締めのロゴが短すぎる");
});

test("章のあいだに間がある", () => {
  // Each picture is a chapter. Without air between them the next line starts
  // before the last one has landed.
  const line = "あ".repeat(35);
  const timeline = eventCmTimeline(withNarration(SEEDED, [line, line, line, line]));
  const spokenMs = Math.round((35 / 7) * 1000);
  for (const scene of timeline.scenes) {
    if (scene.role === "logoIn" || scene.role === "logoOut") continue;
    assert.equal(
      scene.durationMs,
      spokenMs + EVENT_CM_SCENE_GAP_MS,
      `${scene.role} に間が入っていない`,
    );
  }
});

test("30秒を超えてよい——正しい尺が要件", () => {
  // The brief asked for "about 30 seconds" and the structure costs more than
  // that: eight seconds of marks plus a pause per chapter. A breathless thirty
  // is the failure, not the length.
  //
  // The ceiling is a RUNAWAY GUARD, not a spec — it catches 「2900字書いたら7分
  // になった」, which the design allows on purpose. It moved from 50s to 70s on
  // 2026-08-25 when the programmes began carrying what they cover
  // (EventProgram.detail) and their budgets grew with them: three agenda
  // pictures that each say something cost about six seconds more than three
  // that say 「主催者が解説します」. Written by the model at the top of its
  // budget the film lands around 55s, so 70 leaves the guard useful. If this
  // has to move again, check that the reason is a decision and not a drift.
  const timeline = eventCmTimeline(SEEDED);
  assert.ok(timeline.totalMs > 30_000, `${timeline.totalMs}ms — 駆け足に戻っている`);
  assert.ok(timeline.totalMs < 70_000, `${timeline.totalMs}ms — 長すぎる`);
});

test("ナレーションを書くと尺がその文字数に従う", () => {
  const short = withNarration(SEEDED, [
    "あ".repeat(28),
    "い".repeat(45),
    "う".repeat(44),
    "え".repeat(36),
  ]);
  const long = withNarration(SEEDED, [
    "あ".repeat(28),
    "い".repeat(45),
    "う".repeat(140),
    "え".repeat(36),
  ]);

  const shortTimeline = eventCmTimeline(short);
  const longTimeline = eventCmTimeline(long);

  assert.equal(shortTimeline.source, "narration");
  const shortProgram = shortTimeline.scenes.find((s) => s.role === "program")!;
  const longProgram = longTimeline.scenes.find((s) => s.role === "program")!;
  assert.ok(longProgram.durationMs > shortProgram.durationMs * 2, "長いナレーションは長いシーンになる");
  assert.ok(longTimeline.totalMs > shortTimeline.totalMs);
});

test("無音のシーンはナレーションの長さに影響されない", () => {
  // Their job is fixed: establish the mark, and let it go. A long narration must
  // not stretch the opening logo.
  const timeline = eventCmTimeline(
    withNarration(SEEDED, ["あ".repeat(200), "い", "う", "え"]),
  );
  assert.equal(timeline.scenes[0].durationMs, EVENT_CM_INTRO_MS);
  assert.equal(
    timeline.scenes[timeline.scenes.length - 1].durationMs,
    EVENT_CM_OUTRO_MS,
  );
});

test("短すぎる一行でも読める最小の尺を確保する", () => {
  const terse = withNarration(SEEDED, ["短い", "短い", "短い", "短い"]);
  const timeline = eventCmTimeline(terse);
  const narrated = eventCmNarratedSteps(SEEDED).map((step) => step.role);
  assert.ok(
    timeline.scenes
      .filter((scene) => narrated.includes(scene.role))
      .every((scene) => scene.durationMs >= 2500),
    "1文字の行が0.3秒のカットにならない",
  );
});

test("音声があれば実測がナレーションの推定を上書きする", () => {
  const roles = eventCmNarratedSteps(SEEDED).map((step) => step.role);
  const written = withNarration(SEEDED, roles.map((_, i) => "あ".repeat(30 + i)));
  const spoken: EventCmBrief = {
    ...written,
    voice: {
      audio: "material:00000000-0000-0000-0000-000000000000",
      track: {
        version: 1,
        generatedAt: "2026-08-11T00:00:00.000Z",
        // As long as the pictures it covers: six seconds and a bit each, for
        // however many narrated pictures this brief has.
        totalMs: roles.length * 6_200,
        sampleRate: 24_000,
        mock: false,
        provider: "gemini",
        voice: "Schedar",
        scenes: roles.map((role, i) => ({
          role,
          text: "",
          startMs: i * 6_200,
          durationMs: 6_200,
        })),
        captions: [],
      },
    },
  };

  const timeline = eventCmTimeline(spoken);
  assert.equal(timeline.source, "voice");
  // The measured track, plus the mark at each end.
  assert.equal(
    timeline.totalMs,
    roles.length * 6_200 + EVENT_CM_INTRO_MS + EVENT_CM_OUTRO_MS,
  );
  assert.equal(timeline.scenes[1].fromMs, EVENT_CM_INTRO_MS);
  assert.equal(timeline.scenes[2].fromMs, 6_200 + EVENT_CM_INTRO_MS);
  assert.equal(timeline.voiceStartMs, EVENT_CM_INTRO_MS);
  assert.equal(timeline.voiceEndMs, roles.length * 6_200 + EVENT_CM_INTRO_MS);
});
