import assert from "node:assert/strict";
import test from "node:test";
import {
  captionAt,
  captionsFor,
  splitCards,
  splitSentences,
} from "@/remotion/event-cm/captions";
import { eventCmTimeline, EVENT_CM_INTRO_MS } from "@/remotion/event-cm/timeline";
import {
  EVENT_CM_CAPTIONS_PATH,
  EVENT_CM_SUPPRESSED_NOTE,
  eventCmNarratedSteps,
  type EventCmBrief,
} from "@/remotion/event-cm/types";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { isSpokenFact } from "./facts";
import { seedEventCmBrief } from "./seed";

const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-12T09:00:00+09:00"), seed: "take-1" },
);

/** The narration actually written for the sake event — one line per picture,
 *  starting with the title call. */
const SPOKEN: Record<string, string> = {
  title: "ウェルスパークラボがおくる、パッションアセットの世界。世界が恋する日本酒です。",
  value: "一杯の日本酒から、新しい出会いと学びが始まります。日本文化を味わい、仲間と語り合い、過ごす時間です。",
  program: "江戸切子の酒器で、六種類を飲み比べます。宮尾酒造当主のトークを聞き、味や香りを学びます。",
  guests: "宮尾酒造の当主が、知られざる舞台裏を語ります。",
  cta: "十月三日、土曜日、午後一時から。ご案内は、ホームページをご覧ください。",
};

const written: EventCmBrief = {
  ...SEEDED,
  narration: {
    version: 1,
    scenes: eventCmNarratedSteps(SEEDED).map(({ role, index }) => ({
      role,
      ...(index === undefined ? {} : { index }),
      text: SPOKEN[role],
    })),
    source: "llm",
    updatedAt: "2026-08-12T00:00:00.000Z",
    angle: "…",
  },
};

test("文で割る（句点を残す）", () => {
  assert.deepEqual(splitSentences("あ。い！う？"), ["あ。", "い！", "う？"]);
  assert.deepEqual(splitSentences("句点のない一文"), ["句点のない一文"]);
  assert.deepEqual(splitSentences("  "), []);
});

test("ナレーションがあれば、音声を待たずに字幕が出る", () => {
  // The whole reason subtitles are derived from the narration: a film watched
  // muted must be readable before anyone has paid for TTS.
  const captions = captionsFor(written);
  assert.ok(
    captions.length > written.narration.scenes.length,
    "シーン数より多い＝文単位で割れている",
  );
  // The first thing anyone reads is the title call.
  assert.equal(captions[0].text, "ウェルスパークラボがおくる、パッションアセットの世界。");
});

test("読みは字幕に出ない。画に出るのは書かれた文のほう", () => {
  // The reading exists so the voice can say しめはりつる while the screen keeps
  // 〆張鶴 (types.ts `reading`). Cutting subtitles from the reading instead would
  // spell a two-hundred-year-old brewery in kana — which is the exact damage the
  // field was added to avoid.
  const withReading: EventCmBrief = {
    ...written,
    narration: {
      ...written.narration,
      scenes: written.narration.scenes.map((scene) =>
        scene.role === "guests"
          ? {
              ...scene,
              text: "〆張鶴の当主が、知られざる舞台裏を語ります。",
              reading: "しめはりつるの当主が、知られざる舞台裏を語ります。",
            }
          : scene,
      ),
    },
  };
  const texts = captionsFor(withReading).map((caption) => caption.text);
  assert.ok(
    texts.some((text) => text.includes("〆張鶴")),
    "字幕に書かれた文が出ていない",
  );
  assert.ok(
    !texts.some((text) => text.includes("しめはりつる")),
    "読みが字幕に漏れている",
  );
});

test("ナレーションが無ければ字幕も無い", () => {
  // Not the seeded brief any more: that arrives with a draft line per picture.
  const unwritten = { ...SEEDED, narration: { ...SEEDED.narration, scenes: [] } };
  assert.deepEqual(captionsFor(unwritten), []);
});

test("字幕は重ならず、隙間なく続く", () => {
  const captions = captionsFor(written);
  for (let i = 1; i < captions.length; i += 1) {
    assert.ok(
      captions[i].fromMs >= captions[i - 1].toMs,
      `${i - 1}番目と${i}番目が重なっている`,
    );
  }
  for (const caption of captions) {
    assert.ok(caption.toMs > caption.fromMs, "長さがゼロの字幕がある");
  }
});

test("字幕は冒頭のロゴシーンには出ない", () => {
  const captions = captionsFor(written);
  assert.equal(captions[0].fromMs, EVENT_CM_INTRO_MS);
  assert.equal(captionAt(captions, 0), null);
  assert.equal(captionAt(captions, EVENT_CM_INTRO_MS - 1), null);
});

test("字幕は締めのロゴシーンには残らない", () => {
  // The film ends on the mark, alone. A subtitle still on screen over it would
  // be a line whose picture has already gone.
  const captions = captionsFor(written);
  const timeline = eventCmTimeline(written);
  const last = captions[captions.length - 1];
  assert.equal(last.toMs, timeline.voiceEndMs, "最後の字幕はナレーションの終わりで消える");
  assert.ok(last.toMs < timeline.totalMs);
});

test("長い文には長く出る（文字数で配分する）", () => {
  // Compared inside one scene, and never against the last sentence: that one
  // absorbs the rounding so its subtitle ends exactly where the scene does.
  const brief: EventCmBrief = {
    ...SEEDED,
    narration: {
      version: 1,
      scenes: eventCmNarratedSteps(SEEDED).map(({ role, index }) => ({
        role,
        ...(index === undefined ? {} : { index }),
        text:
          role === "title"
            ? "短い一文。" + "長い方の文はこれくらいの分量があります。" + "締めの一文。"
            : SPOKEN[role],
      })),
      source: "llm",
      updatedAt: "2026-08-12T00:00:00.000Z",
      angle: "…",
    },
  };

  const [short, long] = captionsFor(brief);
  assert.equal(short.text, "短い一文。");
  assert.equal(long.text, "長い方の文はこれくらいの分量があります。");
  assert.ok(
    long.toMs - long.fromMs > short.toMs - short.fromMs,
    "長い文の方が長く表示される",
  );
});

test("どの瞬間にも字幕は最大1枚", () => {
  const captions = captionsFor(written);
  const total = eventCmTimeline(written).totalMs;
  for (let ms = 0; ms < total; ms += 250) {
    const showing = captions.filter(
      (caption) => ms >= caption.fromMs && ms < caption.toMs,
    );
    assert.ok(showing.length <= 1, `${ms}ms に${showing.length}枚出ている`);
  }
});

/** The same narration, with one picture's line replaced. */
const briefWith = (valueText: string): EventCmBrief => ({
  ...written,
  narration: {
    ...written.narration,
    scenes: written.narration.scenes.map((scene) =>
      scene.role === "value" ? { ...scene, text: valueText } : scene,
    ),
  },
});

test("長すぎる一文は、画面を覆う代わりにカードへ割る", () => {
  // The failure this prevents: the band has no line limit, so one 1,200-character
  // "sentence" with no 。 grew a plate that covered the picture it was
  // subtitling. Nothing about the film stops a person writing that line.
  const runOn = "あ".repeat(1200);
  const brief = briefWith(runOn);
  const captions = captionsFor(brief);

  assert.ok(captions.length > 1, "一枚のままになっている");
  assert.ok(
    captions.every((caption) => caption.text.replace(/\s/g, "").length <= 28),
    "28字を超えるカードが残っている",
  );
  // Still bounded by its own scene, and still contiguous.
  const scene = eventCmTimeline(brief).scenes.find((entry) => entry.role === "value")!;
  const own = captions.filter(
    (caption) => caption.fromMs >= scene.fromMs && caption.toMs <= scene.fromMs + scene.durationMs,
  );
  assert.equal(own.length, captions.filter((c) => c.text.startsWith("あ")).length);
});

test("読点があれば、そこで割る", () => {
  const cards = splitCards("百貨店には並ばない蔵出しの日本酒を、五種類、じっくり味わいながら、その楽しみ方を学びます");
  assert.ok(cards.length >= 2);
  assert.ok(cards.every((card) => card.length <= 28));
  // Nothing is lost.
  assert.equal(cards.join(""), "百貨店には並ばない蔵出しの日本酒を、五種類、じっくり味わいながら、その楽しみ方を学びます");
});

test("字幕はオフにできる。言葉も尺も動かない", () => {
  // The narration has two outputs — spoken and shown — and both can be
  // declined. Only the spoken one could until 2026-08-17, which made the pair
  // asymmetric for no reason anyone could state.
  const off: EventCmBrief = {
    ...written,
    provenance: {
      ...written.provenance,
      [EVENT_CM_CAPTIONS_PATH]: { origin: "user", note: EVENT_CM_SUPPRESSED_NOTE },
    },
  };

  assert.ok(eventCmFilm(written).captions.length > 0, "オンのときに字幕が出ていない");
  assert.deepEqual(eventCmFilm(off).captions, []);

  // The point of the feature: what disappears is the DISPLAY. The words are
  // still there, and they still decide how long each picture runs — a film that
  // got shorter when the subtitles went away would be a different film.
  assert.deepEqual(
    eventCmFilm(off).drawn.narration.scenes,
    eventCmFilm(written).drawn.narration.scenes,
  );
  assert.equal(eventCmTimeline(off).totalMs, eventCmTimeline(written).totalMs);
});

test("字幕を切ってもナレーションは古くならない", () => {
  // `factsUpdatedAt` exists to say the words describe an older event. The
  // subtitles ARE the words, letter for letter, so switching them off cannot
  // make them wrong — and a warning that appears when nothing is wrong is a
  // warning people learn to ignore.
  assert.equal(isSpokenFact(EVENT_CM_CAPTIONS_PATH), false);
});

test("端数だけのカードを作らない", () => {
  // The v9 review case. 31 characters filled greedily to the 28 limit left a
  // card holding 「ます。」 — three characters on screen for a beat. The fix at
  // the time was to add a 、 to the sentence, i.e. the author working around
  // the splitter. Deciding how MANY cards first and filling toward that
  // average is what removes the stub.
  const cards = splitCards("知られざる日本酒業界の舞台裏と世界への広がりについて語ります。");
  assert.equal(cards.join(""), "知られざる日本酒業界の舞台裏と世界への広がりについて語ります。");
  assert.equal(cards.length, 2);
  for (const card of cards) {
    assert.ok(card.length <= 28, `28字を超えたカードがある: ${card}`);
    assert.ok(card.length >= 8, `端数だけのカードがある: ${card}`);
  }
});

test("カードの割れ目は語の途中に来ない", () => {
  // The same hole as the mid-word line break (remotion/kit/phrase.ts), in the
  // other 工程: mechanical slicing cut 文節 in half. Cards are packed out of
  // phrase blocks now, so a card may only begin where a phrase does.
  const closesBlock = (text: string) => /[、。，．！？]$/u.test(text);
  for (const sentence of [
    "知られざる日本酒業界の舞台裏と世界への広がりについて語ります。",
    "百貨店には並ばない蔵出しの日本酒を、五種類、じっくり味わいながら、その楽しみ方を学びます",
    "文化資本という考え方を、投資の視点からあらためて見直していく時間になります。",
  ]) {
    const cards = splitCards(sentence);
    assert.equal(cards.join(""), sentence, `文字が落ちている: ${sentence}`);
    for (const [at, card] of cards.entries()) {
      if (at === 0) continue;
      if (!/^[ぁ-ゟ]/u.test(card)) continue;
      assert.ok(
        closesBlock(cards[at - 1]),
        `語の途中で割れている: 「${cards[at - 1]}|${card}」`,
      );
    }
  }
});

test("読点があるときは、まず読点で割る", () => {
  // A reader pauses there anyway, so it beats any boundary inside the clause.
  const cards = splitCards(
    "百貨店には並ばない蔵出しの日本酒を、五種類、じっくり味わいながら、その楽しみ方を学びます",
  );
  assert.ok(cards.length > 1);
  for (const card of cards.slice(0, -1)) {
    assert.ok(/[、]$/u.test(card), `読点で終わっていないカードがある: ${card}`);
  }
});
