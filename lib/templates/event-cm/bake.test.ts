import assert from "node:assert/strict";
import test from "node:test";
import {
  bakeChanges,
  bakeState,
  describeChanges,
  filmStatus,
  voiceIsOff,
  pendingFilmSteps,
  renderIsBehind,
  voiceReadsNarration,
  voiceUsesNarrator,
} from "./bake";
import { setSuppressed } from "./facts";
import { seedEventCmBrief } from "./seed";
import { eventCmFilm } from "@/remotion/event-cm/film";
import {
  EVENT_CM_CAPTIONS_PATH,
  EVENT_CM_SUPPRESSED_NOTE,
  EVENT_CM_VOICE_PATH,
  eventCmSceneKey,
  eventCmSpoken,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

/** A take exactly as it is created: the reading switched off (seed.ts). */
const SEEDED_TAKE = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-14T09:00:00+09:00"), seed: "take-1" },
);

/**
 * The same take with the reading switched ON.
 *
 * Most of this file is about the recording — what makes it stale, what it owes,
 * when it stops being pending — and none of that is reachable with the voice
 * off. Switching it on is what a user does the moment they want one, so it is
 * the honest base for those tests. The two tests about the OTHER state name
 * `SEEDED_TAKE` explicitly.
 */
const SEEDED = setSuppressed(SEEDED_TAKE, EVENT_CM_VOICE_PATH, false);

/** A brief whose narration covers every narrated picture of its own film. */
function written(brief: EventCmBrief, at: string): EventCmBrief {
  const scenes = eventCmFilm(brief)
    .scenes.filter((scene) => scene.narrated)
    .map((scene) => ({
      role: scene.role,
      ...(scene.index === undefined ? {} : { index: scene.index }),
      text: `${scene.key}の行`,
    }));
  return {
    ...brief,
    narration: { version: 1, scenes, source: "llm", updatedAt: at, angle: "" },
  };
}

/** That narration, read aloud — recorded the way the endpoint records it: the
 *  SPOKEN copy of each line, with no reading stored beside it
 *  (app/api/brands/[id]/videos/[videoId]/voice/route.ts). */
function spoken(brief: EventCmBrief, at: string): EventCmBrief {
  return {
    ...brief,
    voice: {
      audio: "material:00000000-0000-0000-0000-000000000001",
      track: {
        version: 1,
        generatedAt: at,
        totalMs: 34000,
        sampleRate: 24000,
        mock: true,
        provider: "mock",
        voice: "Zephyr",
        captions: [],
        scenes: brief.narration.scenes.map((scene, index) => ({
          role: scene.role,
          ...(scene.index === undefined ? {} : { index: scene.index }),
          text: eventCmSpoken(scene),
          startMs: index * 5000,
          durationMs: 4000,
        })),
      },
    },
  };
}

test("一度も実行していない動画は「未実行」で、差分は数えない", () => {
  const state = bakeState(SEEDED, null);
  assert.equal(state.baked, false);
  assert.deepEqual(state.changes, []);
});

test("焼き付けた版と同じなら差分は無い", () => {
  const brief = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  assert.deepEqual(bakeState(brief, brief).changes, []);
});

test("差分は変わった項目の名前で言う（何件、ではなく何が）", () => {
  const baked = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");

  const date: EventCmBrief = {
    ...baked,
    schedule: { ...baked.schedule, date: "2026.11.14" },
  };
  assert.deepEqual(
    bakeChanges(date, baked).map((change) => [change.path, change.label]),
    [["schedule.date", "開催日"]],
  );

  const rewritten: EventCmBrief = {
    ...baked,
    narration: {
      ...baked.narration,
      scenes: baked.narration.scenes.map((scene, index) =>
        index === 0 ? { ...scene, text: "別の言葉" } : scene,
      ),
    },
  };
  assert.deepEqual(
    bakeChanges(rewritten, baked).map((change) => change.path),
    ["narration"],
  );

  assert.deepEqual(
    bakeChanges(spoken(baked, "2026-08-14T13:00:00Z"), baked).map((c) => c.path),
    ["voice"],
  );
});

test("BGMを差し替えたら「BGM」1件の差分になる", () => {
  // The event this whole model was rebuilt for. Choosing a track moved none of
  // the three stamps the old comparison read — `factsUpdatedAt` deliberately
  // ignores music — so the badge said 0 while the player kept the old song.
  const baked = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  const swapped: EventCmBrief = {
    ...baked,
    bgm: "material:00000000-0000-0000-0000-0000000000bb",
  };

  const changes = bakeChanges(swapped, baked);
  assert.deepEqual(
    changes.map((change) => [change.path, change.label]),
    [["bgm", "BGM"]],
  );
  // And it costs nothing to reflect: music is not read aloud, so no rewriting
  // and no second TTS bill — just the fixing step.
  assert.deepEqual(changes[0].needs, ["bake"]);
  assert.deepEqual(pendingFilmSteps(swapped, baked), ["bake"]);
});

test("写真の差し替えも、言う言葉は変えないので読み直さない", () => {
  const baked = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  const photo: EventCmBrief = {
    ...baked,
    visuals: { ...baked.visuals, value: { src: "material:abc" } },
  };
  assert.deepEqual(
    bakeChanges(photo, baked).map((change) => [change.label, change.needs]),
    [["主役の写真", ["bake"]]],
  );
});

test("比較は保存形。署名URLに置き換わった版を比べてはいけない", () => {
  // Why this module is called by API routes and never by the browser (§3.3).
  // Stored, a track is `material:<uuid>` for ever; the copy the client receives
  // has a URL signed afresh on every load. Comparing THOSE would report the
  // music and every photograph as changed on a page refresh.
  const stored: EventCmBrief = {
    ...spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z"),
    bgm: "material:00000000-0000-0000-0000-0000000000bb",
  };
  assert.deepEqual(bakeChanges(stored, stored), []);

  const resolved: EventCmBrief = {
    ...stored,
    bgm: "/api/brands/b/takes/t/materials/m/bgm.mp3?key=k&sig=NEW",
  };
  assert.deepEqual(
    bakeChanges(resolved, stored).map((change) => change.path),
    ["bgm"],
    "署名URL版を比べると偽の差分が出る——だからサーバーで保存形を比べる",
  );

  // The recording is the exception that proves the rule: its pointer is signed
  // too, so it is compared by the stamp on the recording instead.
  const reSigned: EventCmBrief = {
    ...stored,
    voice: { ...stored.voice!, audio: "/api/…/voice.wav?sig=NEW" },
  };
  assert.deepEqual(bakeChanges(reSigned, stored), []);
});

test("声を選ぶのは設定。読み上げ直しは要るが、書き直しは要らない", () => {
  // Choosing a voice used to start text-to-speech on the spot: a minute of
  // waiting, then a player that had not changed. It is now a setting like the
  // music — saved instantly, listed as unreflected, and read aloud when the one
  // button runs. The words are untouched, so the writer stays out of it.
  const baked = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  const picked: EventCmBrief = { ...baked, narrator: "male-1" };

  assert.deepEqual(
    bakeChanges(picked, baked).map((change) => [change.label, change.needs]),
    [["ボイスの声", ["voice", "bake"]]],
  );
  assert.deepEqual(pendingFilmSteps(picked, baked), ["voice", "bake"]);
});

test("選んだ声で読まれていなければ、焼き付け済みでも読み上げが残る", () => {
  // The setting and the recording are two facts, and only comparing them keeps
  // a film from carrying a voice nobody chose: fixing the take with the two
  // disagreeing would otherwise settle it for ever.
  const brief: EventCmBrief = {
    ...spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z"),
    narrator: "male-1",
  };
  assert.equal(voiceUsesNarrator(brief), false, "録音はZephyr、設定はmale-1");
  assert.deepEqual(bakeChanges(brief, brief), [], "焼き付けとは一致している");
  assert.deepEqual(pendingFilmSteps(brief, brief), ["voice", "bake"]);
});

test("未反映は名前で言い、多すぎるときだけ畳む", () => {
  // A number alone ("12件") does not answer the only question worth asking.
  // But a structuring run can rewrite a dozen fields, and a notice that grows
  // into a wall stops being read.
  const change = (label: string) => ({ path: label, label, needs: ["bake" as const] });
  assert.equal(describeChanges([change("BGM")]), "BGM");
  assert.equal(
    describeChanges([change("BGM"), change("主役の写真"), change("ナレーション")]),
    "BGM、主役の写真、ナレーション",
  );
  assert.equal(
    describeChanges([
      change("BGM"),
      change("主役の写真"),
      change("ナレーション"),
      change("開催日"),
      change("会場"),
    ]),
    "BGM、主役の写真、ナレーション、他2件",
  );
});

test("絵コンテと一致していることと、やることが無いことは別", () => {
  // Found on real data: a take whose narration no longer covers its pictures had
  // zero differences from the played film — it had been fixed in that state —
  // while the button still owed three steps. Calling that 「最新の状態です」 put
  // a green banner directly above a badge reading 未処理3件.
  const settled = { baked: true, changes: [] };
  assert.equal(filmStatus(settled, []), "settled");
  assert.equal(filmStatus(settled, ["narration", "voice", "bake"]), "matched");

  const change = { path: "bgm", label: "BGM", needs: ["bake" as const] };
  assert.equal(filmStatus({ baked: true, changes: [change] }, ["bake"]), "behind");

  // Never run outranks everything: it is an invitation, not a warning.
  assert.equal(filmStatus({ baked: false, changes: [] }, ["bake"]), "unrun");
});

test("読み上げは、いま書かれている言葉と一致するときだけ「合っている」", () => {
  const brief = written(SEEDED, "2026-08-14T10:00:00Z");
  assert.equal(voiceReadsNarration(brief), false, "録音が無いのに一致と言っている");

  const recorded = spoken(brief, "2026-08-14T10:05:00Z");
  assert.equal(voiceReadsNarration(recorded), true);

  const edited: EventCmBrief = {
    ...recorded,
    narration: {
      ...recorded.narration,
      scenes: recorded.narration.scenes.map((scene, index) =>
        index === 1 ? { ...scene, text: "書き直した行" } : scene,
      ),
      source: "human",
      updatedAt: "2026-08-14T11:00:00Z",
    },
  };
  assert.equal(voiceReadsNarration(edited), false);
});

test("読みのある行は、字幕ではなく読みと録音を比べる", () => {
  // 「〆張鶴」 is the case this exists for: the subtitle keeps the kanji and the
  // recording says しめはりつる. Comparing the recording to the SUBTITLE would
  // report a perfectly current take as stale forever — and no amount of
  // re-recording could ever clear it, because the voice is never going to say
  // those characters.
  const base = written(SEEDED, "2026-08-14T10:00:00Z");
  const withReading: EventCmBrief = {
    ...base,
    narration: {
      ...base.narration,
      scenes: base.narration.scenes.map((scene, index) =>
        index === 1 ? { ...scene, text: "〆張鶴の話", reading: "しめはりつるの話" } : scene,
      ),
    },
  };
  const recorded = spoken(withReading, "2026-08-14T10:05:00Z");
  assert.equal(voiceReadsNarration(recorded), true, "読みどおりに録ったのに古いと言っている");

  // Editing only the subtitle leaves the recording right: nothing that was said
  // has changed. This is the whole point of splitting the two — otherwise every
  // spelling fix would cost a TTS call.
  const subtitleOnly: EventCmBrief = {
    ...recorded,
    narration: {
      ...recorded.narration,
      scenes: recorded.narration.scenes.map((scene, index) =>
        index === 1 ? { ...scene, text: "〆張鶴（しめはりつる）の話" } : scene,
      ),
      source: "human",
      updatedAt: "2026-08-14T11:00:00Z",
    },
  };
  assert.equal(voiceReadsNarration(subtitleOnly), true, "字幕だけ直したのに録り直しを求めている");

  // Editing the reading changes what will be said, so the recording is stale.
  const readingChanged: EventCmBrief = {
    ...recorded,
    narration: {
      ...recorded.narration,
      scenes: recorded.narration.scenes.map((scene, index) =>
        index === 1 ? { ...scene, reading: "しめはりづるの話" } : scene,
      ),
      source: "human",
      updatedAt: "2026-08-14T11:00:00Z",
    },
  };
  assert.equal(voiceReadsNarration(readingChanged), false);

  // And clearing it means the narrator is back to reading the kanji, which the
  // recording never did.
  const cleared: EventCmBrief = {
    ...recorded,
    narration: {
      ...recorded.narration,
      scenes: recorded.narration.scenes.map((scene, index) => {
        if (index !== 1) return scene;
        const { reading: _dropped, ...rest } = scene;
        return rest;
      }),
      source: "human",
      updatedAt: "2026-08-14T11:00:00Z",
    },
  };
  assert.equal(voiceReadsNarration(cleared), false, "読みを消したのに録音が最新だと言っている");
});

test("作ったばかりの動画は、何も owing していない", () => {
  // The state the owner objected to (2026-08-30): a take opened seconds after
  // it was created showed two outstanding steps against a film nobody had
  // touched. Neither was real. The words are written (a draft line on every
  // picture that speaks), the reading is switched OFF — which is a decision,
  // not a gap — and an unbaked take plays and exports exactly what it holds,
  // because both the player and the renderer read `baked ?? working`.
  assert.deepEqual(pendingFilmSteps(SEEDED_TAKE, null), []);
});

test("ボイスをつけた瞬間に、読み上げと反映が要る", () => {
  // And this is when the count is correct: asking for a reading is what makes
  // one owed. The words are not the missing thing — the draft is not stale —
  // so 「ナレーション」 is not offered.
  assert.deepEqual(pendingFilmSteps(SEEDED, null), ["voice", "bake"]);
});

test("1行も無ければ、書く・読む・反映するの3手", () => {
  const unwritten: EventCmBrief = {
    ...SEEDED,
    narration: { ...SEEDED.narration, scenes: [] },
  };
  assert.deepEqual(pendingFilmSteps(unwritten, null), ["narration", "voice", "bake"]);
});

test("手で直したナレーションは書き直さないし、件数にも入れない", () => {
  const brief = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  const edited: EventCmBrief = {
    ...brief,
    narration: { ...brief.narration, source: "human", updatedAt: "2026-08-14T11:00:00Z" },
    factsUpdatedAt: "2026-08-14T12:00:00Z",
  };
  // Facts moved under a hand-written narration: the film is out of date, and the
  // button still must not offer to rewrite words somebody typed.
  assert.equal(pendingFilmSteps(edited, brief).includes("narration"), false);
});

test("ナレーションをオフにした動画で、実行が勝手に音声を戻さない", () => {
  const brief = written(SEEDED, "2026-08-14T10:00:00Z");
  assert.ok(pendingFilmSteps(brief, brief).includes("voice"));

  const off = setSuppressed(brief, "voice", true);
  assert.equal(voiceIsOff(off), true);
  assert.equal(pendingFilmSteps(off, off).includes("voice"), false);
});

test("ナレーションを書き直すなら、読み上げと反映も必ず続く", () => {
  const stale: EventCmBrief = {
    ...spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z"),
    factsUpdatedAt: "2026-08-14T12:00:00Z",
  };
  assert.deepEqual(pendingFilmSteps(stale, stale), ["narration", "voice", "bake"]);
});

test("全部揃って焼き付け済みなら、やることは無い", () => {
  const brief = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  assert.deepEqual(pendingFilmSteps(brief, brief), []);
});

test("シーンが増えた直後は、ナレーションから追いつかせる", () => {
  const brief = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  const withGuest: EventCmBrief = {
    ...brief,
    guests: [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null }],
  };
  // The film gained a picture, so the narration has the wrong set of lines —
  // exactly the state `narrationStaleness` calls "shape".
  const keys = eventCmFilm(withGuest)
    .scenes.filter((scene) => scene.narrated)
    .map((scene) => scene.key);
  assert.ok(keys.includes(eventCmSceneKey({ role: "guests" })));
  assert.deepEqual(pendingFilmSteps(withGuest, brief), ["narration", "voice", "bake"]);
});

test("シーンを削除した直後も、ナレーションから追いつかせる", () => {
  // The mirror of the test above, and the one that was broken: deleting the
  // speakers is a suppression, and suppressions used not to stamp the facts —
  // so the film lost a picture while every stamp stayed put. The badge said 0,
  // the notice said nothing was pending, and the player went on showing the
  // deleted picture until somebody pressed the button a second time.
  const guests = [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null }];
  const brief = spoken(
    written({ ...SEEDED, guests }, "2026-08-14T10:00:00Z"),
    "2026-08-14T10:05:00Z",
  );
  assert.deepEqual(pendingFilmSteps(brief, brief), []);

  const deleted = setSuppressed(brief, "guests", true, "2026-08-14T11:00:00Z");
  // Switching a field off is a change TO THAT FIELD: it is emptied before the
  // film is drawn and before the words are written, so it is named as 登壇者
  // rather than lumped into a generic "facts".
  assert.deepEqual(
    bakeChanges(deleted, brief).map((change) => [change.path, change.label]),
    [["guests", "登壇者"]],
  );
  assert.deepEqual(pendingFilmSteps(deleted, brief), ["narration", "voice", "bake"]);
});

test("読む言葉が無いのに読み上げを予告しない", () => {
  // Hand-authored and still empty: the narration step will not run (it never
  // overwrites human words) and there is nothing to speak, so listing 読み上げ
  // would promise a step that can only answer 「先にナレーションを書いてください」.
  const empty: EventCmBrief = {
    ...SEEDED,
    narration: { version: 1, scenes: [], source: "human", updatedAt: "", angle: "" },
  };
  // Never baked is not owed work either — the film plays what it holds.
  assert.deepEqual(pendingFilmSteps(empty, null), []);
  assert.deepEqual(pendingFilmSteps(empty, empty), []);
  assert.deepEqual(pendingFilmSteps(empty, empty, { redo: true }), ["bake"]);
});

test("MP4は、焼き付けより古いときだけ古いと言う", () => {
  assert.equal(renderIsBehind("2026-08-14T10:00:00Z", "2026-08-14T11:00:00Z"), true);
  assert.equal(renderIsBehind("2026-08-14T12:00:00Z", "2026-08-14T11:00:00Z"), false);
  assert.equal(renderIsBehind(null, "2026-08-14T11:00:00Z"), false);
  assert.equal(renderIsBehind("2026-08-14T10:00:00Z", null), false);
});

test("字幕の切り替えは反映だけで済む（書き直しも読み直しも要らない）", () => {
  // The subtitles are the narration shown, letter for letter. Switching them
  // off changes who can read the words and not one of the words, so neither the
  // writer nor the reader has anything to do — which is what makes this cost
  // nothing and finish in seconds, like swapping the music.
  const recorded = spoken(written(SEEDED, "2026-08-14T10:00:00Z"), "2026-08-14T10:05:00Z");
  const off: EventCmBrief = {
    ...recorded,
    provenance: {
      ...recorded.provenance,
      [EVENT_CM_CAPTIONS_PATH]: { origin: "user", note: EVENT_CM_SUPPRESSED_NOTE },
    },
  };

  assert.deepEqual(bakeState(recorded, recorded).changes, [], "何も変えていないのに差分が出る");
  assert.deepEqual(
    bakeState(off, recorded).changes.map((change) => [change.label, change.needs]),
    [["字幕", ["bake"]]],
  );
  // The one button agrees: nothing is written and nothing is read aloud.
  assert.deepEqual(pendingFilmSteps(off, recorded), ["bake"]);
});
