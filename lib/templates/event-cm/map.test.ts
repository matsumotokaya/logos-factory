import assert from "node:assert/strict";
import test from "node:test";
import { mapFactsIntoBrief } from "./map";
import { markUserEdited, setSuppressed } from "./facts";
import { seedEventCmBrief } from "./seed";
import { validateBrief } from "@/lib/templates/brief-schemas";
import {
  eventCmNarratedSteps,
  eventCmSceneKey,
  narrationIsStale,
  narrationStaleness,
  type EventCmBrief,
} from "@/remotion/event-cm/types";
import type { EventFacts } from "./structure";

const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-11T09:00:00+09:00"), seed: "take-1" },
);

const withNarration = (brief: EventCmBrief, at: string, source: "llm" | "human" = "llm"): EventCmBrief => ({
  ...brief,
  narration: {
    version: 1,
    scenes: eventCmNarratedSteps(brief).map(({ role, index }) => ({
      role,
      ...(index === undefined ? {} : { index }),
      text: "…",
    })),
    source,
    updatedAt: at,
    angle: "…",
  },
});

const EMPTY_FACTS: EventFacts = {
  title: null,
  subtitle: null,
  seriesLabel: null,
  presenter: null,
  valueLines: null,
  valueChip: null,
  programs: null,
  guests: null,
  date: null,
  weekday: null,
  time: null,
  venue: null,
  fee: null,
  cta: null,
  footnote: null,
  images: [],
  note: null,
};

const NOW = "2026-08-12T00:00:00.000Z";

test("資料が言っていることを反映し、由来を「資料から読んだ」にする", () => {
  const result = mapFactsIntoBrief(
    SEEDED,
    { ...EMPTY_FACTS, title: "世界が恋する日本酒", date: "2026.10.2", weekday: "FRI" },
    "フライヤー.pdf",
    NOW,
  );

  assert.equal(result.brief.title, "世界が恋する日本酒");
  assert.equal(result.brief.schedule.date, "2026.10.2");
  assert.equal(result.brief.schedule.weekday, "FRI");
  assert.equal(result.brief.provenance?.title?.origin, "extracted");
  assert.equal(result.brief.provenance?.title?.source, "フライヤー.pdf");
  assert.deepEqual(result.applied.map((field) => field.path).sort(), [
    "schedule.date",
    "title",
  ]);
});

test("資料が言っていない項目は、仮の値のまま残す", () => {
  // null means "no new information", not "the material says this is empty".
  const result = mapFactsIntoBrief(SEEDED, EMPTY_FACTS, "メモ", NOW);

  assert.equal(result.brief.title, SEEDED.title);
  assert.deepEqual(result.applied, []);
  assert.equal(result.brief.factsUpdatedAt, undefined, "何も変わらなければ刻印しない");
});

test("人が決めた値は資料でも上書きしない", () => {
  const edited = markUserEdited(SEEDED, "title");
  const result = mapFactsIntoBrief(
    edited,
    { ...EMPTY_FACTS, title: "資料にあるタイトル" },
    "フライヤー.pdf",
    NOW,
  );

  assert.equal(result.brief.title, SEEDED.title);
  assert.deepEqual(result.keptUserValues, ["イベント名"]);
});

test("消すと決めた項目は資料でも復活しない", () => {
  const off = setSuppressed(SEEDED, "seriesLabel", true);
  const result = mapFactsIntoBrief(
    off,
    { ...EMPTY_FACTS, seriesLabel: "第3弾" },
    "フライヤー.pdf",
    NOW,
  );

  assert.notEqual(result.brief.seriesLabel, "第3弾");
});

test("登壇者は資料に書いてあれば入る（シードが置くのは見本の氏名）", () => {
  // The seeder proposes an unmistakably fictional pair so the speaker picture
  // shows what it does with a speaker (seed.ts rule 2, revised 2026-08-30).
  // Reading real people from a document replaces them outright — that is the
  // half of this that never changed, and it is what makes the placeholder
  // safe: it never survives contact with a fact.
  //
  // The name is CLEAN. The stock portrait's caveat lives on the photograph
  // (`EventPhoto.sample`) because a name is a spoken fact: with 「（見本）」 in
  // here the narration came out as 「ゲストスピーカー見本と、モデレーター見本
  // が、対話をつくります」 — the film saying the word "sample" out loud.
  assert.deepEqual(
    SEEDED.guests.map((guest) => guest.name),
    ["山田太郎", "山田花子"],
  );
  assert.ok(
    SEEDED.guests.every((guest) => !guest.name.includes("見本")),
    "読み上げられる名前に「見本」が入っている",
  );
  const result = mapFactsIntoBrief(
    SEEDED,
    {
      ...EMPTY_FACTS,
      guests: [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主" }],
    },
    "フライヤー.pdf",
    NOW,
  );

  assert.equal(result.brief.guests.length, 1);
  assert.equal(result.brief.guests[0].name, "宮尾 佳明");
  assert.equal(result.brief.guests[0].photo, null);
});

test("資料を読み直しても、登壇者に置かれた写真は消えない", () => {
  // The bug this exists to catch: the guest list was rebuilt from the facts on
  // every run with `photo: null`, so a portrait placed by the image pass
  // disappeared the next time somebody read the flyer.
  const withPhoto: EventCmBrief = {
    ...SEEDED,
    guests: [
      { name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: { src: "material:abc" } },
    ],
  };
  const result = mapFactsIntoBrief(
    withPhoto,
    {
      ...EMPTY_FACTS,
      // Same person, spelt without the space — and now with a fuller title.
      guests: [
        { name: "宮尾佳明", role: "宮尾酒造 十一代目当主・杜氏" },
        { name: "大西 美香", role: "Miss SAKE 代表理事" },
      ],
    },
    "フライヤー.pdf",
    NOW,
  );

  assert.equal(result.brief.guests.length, 2);
  assert.deepEqual(result.brief.guests[0].photo, { src: "material:abc" });
  assert.equal(result.brief.guests[1].photo, null);
});

test("事実が変わるとナレーションが古くなる", () => {
  // The bug this exists to catch: reading a flyer changed the event and left
  // the film narrating the seeded proposal.
  const written = withNarration(SEEDED, "2026-08-11T10:00:00.000Z");
  assert.equal(narrationIsStale(written), false);

  const result = mapFactsIntoBrief(
    written,
    { ...EMPTY_FACTS, title: "世界が恋する日本酒" },
    "フライヤー.pdf",
    NOW,
  );

  assert.equal(narrationIsStale(result.brief), true);
});

test("項目を手で直してもナレーションが古くなる", () => {
  const written = withNarration(SEEDED, "2026-08-11T10:00:00.000Z");
  const edited = markUserEdited(written, "schedule.date", NOW);
  assert.equal(narrationIsStale(edited), true);
});

test("1行も書かれていないナレーションは「古い」にならない", () => {
  const unwritten: EventCmBrief = {
    ...SEEDED,
    narration: { ...SEEDED.narration, scenes: [] },
  };
  const result = mapFactsIntoBrief(
    unwritten,
    { ...EMPTY_FACTS, title: "世界が恋する日本酒" },
    "フライヤー.pdf",
    NOW,
  );
  assert.equal(result.brief.narration.scenes.length, 0);
  assert.equal(narrationIsStale(result.brief), false);
});

test("シードの下書きは、資料を読んだ時点で古くなる", () => {
  // The seeded draft says what each picture is FOR and no facts, so the moment
  // a document supplies a title it is describing an older version of the film.
  // That is the signal the mapping stage rewrites on.
  assert.equal(narrationIsStale(SEEDED), false, "読む前は古くない");
  const result = mapFactsIntoBrief(
    SEEDED,
    { ...EMPTY_FACTS, title: "世界が恋する日本酒" },
    "フライヤー.pdf",
    NOW,
  );
  assert.equal(narrationIsStale(result.brief), true);
});

test("ナレーションの1行だけを直せる（役割で対応し、位置で対応しない）", () => {
  // What the PATCH endpoint does, as data: the narration holds the narrated roles
  // for this brief, so an edit is looked up by role and the rest is carried
  // over. Indexing by array position used to line line 1 up against scene 0 and
  // demand words for the two silent mark scenes.
  const brief: EventCmBrief = {
    ...SEEDED,
    guests: [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null }],
    narration: {
      version: 1,
      source: "llm",
      updatedAt: NOW,
      angle: "…",
      // The template's pictures, not this brief's: the shape stopped depending
      // on who is announced or how many programmes are listed (EVENT_CM_SCENES).
      scenes: eventCmNarratedSteps({}).map(({ role, index }) => ({
        role,
        ...(index === undefined ? {} : { index }),
        text: index === undefined ? `${role}の行` : `${role}${index}の行`,
      })),
    },
  };

  const steps = eventCmNarratedSteps(brief);
  const previous = new Map(
    brief.narration.scenes.map((scene) => [eventCmSceneKey(scene), scene.text]),
  );
  const edited = new Map([["value", "書き直した価値の行"]]);
  const scenes = steps.map((step) => {
    const key = eventCmSceneKey(step);
    return { ...step, text: edited.get(key) ?? previous.get(key) ?? "" };
  });

  assert.deepEqual(
    scenes.map(eventCmSceneKey),
    steps.map(eventCmSceneKey),
    "ナレーションの並びは映像の並びと同じ",
  );
  const value = scenes.find((scene) => scene.role === "value")!;
  assert.equal(value.text, "書き直した価値の行");
  assert.equal(scenes.find((scene) => scene.role === "title")!.text, "titleの行");
  assert.ok(scenes.every((scene) => scene.text), "空の行が残っている");
});

test("ナレーションは1行だけでも保存できる（書きかけは正常な状態）", () => {
  // What the PATCH endpoint does now, as data. It used to demand a line for
  // every narrated picture, so the moment the film gained a picture nobody had
  // written yet — three programmes replacing one — every single-line save was
  // refused with 「空のシーンがあります」.
  const brief: EventCmBrief = {
    ...SEEDED,
    narration: { version: 1, source: "llm", updatedAt: NOW, angle: "", scenes: [] },
  };
  const steps = eventCmNarratedSteps(brief);
  assert.ok(steps.length > 2, "このブリーフは複数のシーンを持つ");

  const edited = new Map([[eventCmSceneKey(steps[2]), "3シーン目だけ書いた"]]);
  const scenes = steps
    .map((step) => ({
      role: step.role,
      ...(step.index === undefined ? {} : { index: step.index }),
      text: edited.get(eventCmSceneKey(step)) ?? "",
    }))
    .filter((scene) => scene.text.length > 0);

  // Stored as one line, in the film's order, and legal to save.
  assert.equal(scenes.length, 1);
  assert.equal(
    validateBrief("event-cm", { ...brief, narration: { ...brief.narration, scenes } }).ok,
    true,
  );
  // Still reported as unfinished, which is what the screen warns about.
  assert.equal(
    narrationIsStale({ ...brief, narration: { ...brief.narration, scenes } }),
    true,
  );
});

test("消した項目は、映像の形の判定にも反映される", () => {
  // The warning nobody could clear: the film was drawn from the suppressed
  // brief (no speaker picture, six lines) while staleness was judged from the
  // stored one (speakers present, seven lines expected), so a freshly written
  // and recorded narration was reported as out of date for ever.
  const withGuests: EventCmBrief = {
    ...SEEDED,
    guests: [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null }],
  };
  assert.ok(
    eventCmNarratedSteps(withGuests).some((step) => step.role === "guests"),
    "登壇者が居ればそのシーンがある",
  );

  // Deleted first, written afterwards — which is the real order, and the order
  // the stamps have to be in for the narration to count as current. Switching a
  // field off IS a change to the facts (facts.ts `setSuppressed`).
  const off = setSuppressed(withGuests, "guests", true, "2026-08-11T00:00:00.000Z");
  assert.equal(
    eventCmNarratedSteps(off).some((step) => step.role === "guests"),
    false,
    "消した登壇者のシーンがまだ数えられている",
  );

  // A narration written for the film as drawn is therefore not stale.
  const written: EventCmBrief = {
    ...off,
    narration: {
      version: 1,
      source: "human",
      updatedAt: NOW,
      angle: "…",
      scenes: eventCmNarratedSteps(off).map(({ role, index }) => ({
        role,
        ...(index === undefined ? {} : { index }),
        text: "読み上げる言葉",
      })),
    },
  };
  assert.equal(narrationStaleness(written), null, "正しいナレーションが古い扱いになっている");
});

test("食い違いの種類を言い分ける（形が違う／事実が新しい）", () => {
  const base: EventCmBrief = {
    ...SEEDED,
    factsUpdatedAt: "2026-08-14T00:00:00.000Z",
    narration: {
      version: 1,
      source: "llm",
      updatedAt: "2026-08-13T00:00:00.000Z",
      angle: "…",
      scenes: eventCmNarratedSteps(SEEDED).map(({ role, index }) => ({
        role,
        ...(index === undefined ? {} : { index }),
        text: "…",
      })),
    },
  };
  // Right set of lines, written before the facts changed.
  assert.equal(narrationStaleness(base), "facts");

  // Wrong set of lines: a picture has no line, or a line has no picture.
  const shape: EventCmBrief = {
    ...base,
    narration: { ...base.narration, scenes: base.narration.scenes.slice(0, 2) },
  };
  assert.equal(narrationStaleness(shape), "shape");
});

test("由来は素材IDで残る。名指しの無い項目は、読んだ資料すべてが根拠", () => {
  const result = mapFactsIntoBrief(
    SEEDED,
    { ...EMPTY_FACTS, title: "世界が恋する日本酒", venue: "渋谷" },
    "フライヤー.pdf、メモ",
    NOW,
    { byField: { title: ["flyer"] }, readIds: ["flyer", "memo"] },
  );
  assert.deepEqual(result.brief.provenance?.title?.sources, ["flyer"]);
  assert.deepEqual(result.brief.provenance?.["schedule.venue"]?.sources, ["flyer", "memo"]);
  // The label is still there for people.
  assert.equal(result.brief.provenance?.title?.source, "フライヤー.pdf、メモ");
});

test("由来の記録が無い実行では、ラベルだけを書く", () => {
  const result = mapFactsIntoBrief(
    SEEDED,
    { ...EMPTY_FACTS, title: "世界が恋する日本酒" },
    "フライヤー.pdf",
    NOW,
  );
  assert.equal(result.brief.provenance?.title?.sources, undefined);
});
