import assert from "node:assert/strict";
import test from "node:test";
import { eventCmStoryboard } from "./event-cm";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { fitScene } from "@/remotion/kit/fit";
import { sceneForRole } from "@/remotion/kit/scenes/event-cm";
import { setSuppressed } from "@/lib/templates/event-cm/facts";
import { seedEventCmBrief } from "@/lib/templates/event-cm/seed";
import {
  eventCmTimeline,
  EVENT_CM_INTRO_MS,
  EVENT_CM_OUTRO_MS,
} from "@/remotion/event-cm/timeline";
import {
  EVENT_CM_SUPPRESSED_NOTE,
  eventCmNarratedSteps,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

// The storyboard has one job: describe the film that will actually be made. So
// every test here is a form of "does this agree with the renderer" — the panel
// count, the cuts, and what each picture holds.

const NOW = new Date("2026-08-13T09:00:00+09:00");

const base = (): EventCmBrief =>
  seedEventCmBrief(
    {
      name: "WealthPark Lab",
      industry: "金融教育メディア",
      description: "投資の本質をテーマに発信する情報メディア。",
    },
    { now: NOW, seed: "take-storyboard" },
  );

const GUESTS = [
  { name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: { src: "material:a" } },
  // No portrait: the component's designed stand-in is a monogram, and the
  // storyboard has to say so rather than showing an empty frame.
  { name: "大西 美香", role: "Miss SAKE 代表理事", photo: null },
];

const LINES: Record<string, string> = {
  title: "レオパレス21とWealthPark Labがおくる、世界が恋する日本酒。",
  value: "特別な五種を味わいながら、文化資本への投資を考えます。",
  program: "江戸切子の酒器で飲み比べ、蔵元のトークへ進みます。",
  guests: "宮尾酒造の当主と、ミス・サケ代表理事が語ります。",
  cta: "十月二日金曜日、十七時開始。詳細・お申し込みはこちら。",
};

const briefWith = (extra: Partial<EventCmBrief> = {}): EventCmBrief => {
  const brief = { ...base(), ...extra };
  return {
    ...brief,
    narration: {
      version: 1,
      source: "llm",
      updatedAt: "2026-08-13T00:00:00Z",
      angle: "文化資本への投資を、一杯から考える三十秒",
      // One line per picture, and a distinct one per programme: three pictures
      // that say the same sentence would not be three messages.
      scenes: eventCmNarratedSteps(brief).map(({ role, index }) => ({
        role,
        ...(index === undefined ? {} : { index }),
        text:
          index === undefined
            ? LINES[role]
            : `${index + 1}つ目は、${index + 1}番目のプログラムの内容です。`,
      })),
    },
  };
};

test("映像はロゴで始まりロゴで終わる", () => {
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  const roles = storyboard.panels.map((panel) => panel.role);

  assert.equal(roles[0], "logoIn");
  assert.equal(roles[roles.length - 1], "logoOut");
  // One picture per programme: the seeded brief lists three, so the film has
  // three programme pictures rather than one slide with a numbered list.
  const brief = briefWith({ guests: GUESTS });
  assert.deepEqual(roles, [
    "logoIn",
    "title",
    "value",
    ...brief.programs.map(() => "program"),
    "guests",
    "cta",
    "logoOut",
  ]);
  // And each of them says which programme it is about.
  assert.deepEqual(
    storyboard.panels.filter((panel) => panel.role === "program").map((panel) => panel.index),
    brief.programs.map((_, index) => index),
  );
});

test("ロゴのシーンは無音で、それ以外は必ず1行を持つ", () => {
  // One message per picture. The two mark scenes are the only silent ones, and
  // they are silent by design rather than because nothing was written.
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  for (const panel of storyboard.panels) {
    const silent = panel.role === "logoIn" || panel.role === "logoOut";
    assert.equal(panel.narrated, !silent, `${panel.role} の narrated が違う`);
    assert.equal(
      panel.narration.length > 0,
      !silent,
      `${panel.role} のナレーションの有無が違う`,
    );
    assert.equal(panel.captions.length > 0, !silent, `${panel.role} の字幕の有無が違う`);
  }
});

test("1つの字幕が2つのシーンにまたがらない", () => {
  // The whole reason the structure changed: a line that ran across a cut made
  // the storyboard and the film disagree about how many pictures there are.
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  for (const panel of storyboard.panels) {
    for (const caption of panel.captions) {
      assert.ok(
        caption.fromMs >= panel.fromMs &&
          caption.toMs <= panel.fromMs + panel.durationMs,
        `シーン${panel.no}の外へ出る字幕: ${caption.text}`,
      );
    }
  }
  const texts = storyboard.panels.flatMap((panel) =>
    panel.captions.map((caption) => caption.text),
  );
  assert.equal(new Set(texts).size, texts.length, "同じ字幕が2シーンに出ている");
});

/** The speaker picture, deleted. An empty guest list no longer removes it —
 *  the picture is the template's (EVENT_CM_SCENES). */
const GUESTS_DELETED = {
  guests: { origin: "user" as const, note: EVENT_CM_SUPPRESSED_NOTE },
};

test("登壇者のシーンは、消したときだけ無くなる", () => {
  const withGuests = eventCmStoryboard(briefWith({ guests: GUESTS }));
  const withoutGuests = eventCmStoryboard(
    briefWith({ guests: GUESTS, provenance: GUESTS_DELETED }),
  );
  assert.equal(withGuests.panels.length, withoutGuests.panels.length + 1);
  assert.equal(
    withoutGuests.panels.some((panel) => panel.role === "guests"),
    false,
  );
});

test("通し番号はラベルであって、シーンの identity ではない", () => {
  // The speakers' picture sits before the closing one, so removing it moves the
  // number under the picture that follows. Anything that had remembered「シーン6」
  // would now be pointing at a different picture — which is why the number is a
  // string: it cannot be passed where `index` (which programme) is wanted, and
  // it cannot quietly become a React key or an API argument.
  const withGuests = eventCmStoryboard(briefWith({ guests: GUESTS }));
  const withoutGuests = eventCmStoryboard(
    briefWith({ guests: GUESTS, provenance: GUESTS_DELETED }),
  );

  const numberOfCta = (storyboard: { panels: Array<{ role: string; no: string }> }) =>
    storyboard.panels.find((panel) => panel.role === "cta")?.no;
  assert.notEqual(numberOfCta(withGuests), numberOfCta(withoutGuests));
  assert.equal(typeof numberOfCta(withGuests), "string");
});

test("シーンの境目は隙間なく続き、最後は尺で終わる", () => {
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  storyboard.panels.forEach((panel, index) => {
    if (index === 0) {
      assert.equal(panel.fromMs, 0);
      return;
    }
    const previous = storyboard.panels[index - 1];
    assert.equal(
      panel.fromMs,
      previous.fromMs + previous.durationMs,
      `シーン${panel.no}の開始が前のシーンの終わりと一致しない`,
    );
  });
  const last = storyboard.panels[storyboard.panels.length - 1];
  assert.equal(last.fromMs + last.durationMs, storyboard.totalMs);
});

test("ロゴのシーンの尺はイントロ・アウトロの固定値", () => {
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  assert.equal(storyboard.panels[0].durationMs, EVENT_CM_INTRO_MS);
  assert.equal(
    storyboard.panels[storyboard.panels.length - 1].durationMs,
    EVENT_CM_OUTRO_MS,
  );
});

test("ロゴのシーンは主催のマークを見せ、画像が無くても欠けにはならない", () => {
  // The seeded brief has no logo image. The `logo` component is not "empty" in
  // that case — it has a name, and a name is what it sets, as a mincho credit.
  // So the block reads as filled and the missing *image* is reported per figure.
  // That distinction is why figures exist: "the mark is missing" and "the mark
  // will be typeset instead of drawn" are different facts.
  const storyboard = eventCmStoryboard(briefWith());
  const blocks = storyboard.panels[0].regions.flatMap((region) => region.blocks);
  const logo = blocks.find((block) => block.kind === "logo");
  assert.ok(logo, "冒頭のシーンにロゴが無い");
  assert.equal(logo.state, "filled");
  assert.equal(logo.figures.length, 1);
  assert.equal(logo.figures[0].hasAsset, false);
  assert.equal(logo.figures[0].label, "WealthPark Lab");
});

test("ナレーションがあれば尺の根拠はナレーション、無ければ想定尺", () => {
  assert.equal(eventCmStoryboard(briefWith()).timingSource, "narration");
  const noNarration = {
    ...base(),
    narration: { version: 1 as const, scenes: [], source: "llm" as const, updatedAt: "", angle: "" },
  };
  assert.equal(eventCmStoryboard(noNarration).timingSource, "budget");
});

test("値のある部品は、どのフィールドを映しているか言える", () => {
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  const title = storyboard.panels.find((panel) => panel.role === "title");
  const heading = title?.regions
    .flatMap((region) => region.blocks)
    .find((block) => block.kind === "heading");

  assert.ok(heading, "タイトルのシーンに見出しがない");
  assert.equal(heading.state, "filled");
  assert.deepEqual(
    heading.fields.map((field) => field.path),
    ["title"],
  );
  assert.equal(heading.fields[0].label, "イベント名");
  assert.equal(heading.fields[0].editable, true);
});

test("罫線は誰も埋める枠ではないので数に入らない", () => {
  // With artwork, so the opening plate draws its rule and credit. Without a
  // logo file the mark IS the credit — the typographic fallback prints the
  // presenter's name — and the scene drops both rather than printing that name
  // twice with a rule between the copies.
  const storyboard = eventCmStoryboard(
    briefWith({
      guests: GUESTS,
      logos: [{ name: "レオパレス21", src: "material:mark" }],
    }),
  );
  const panel = storyboard.panels[0];
  const kinds = panel.regions.flatMap((region) =>
    region.blocks.map((block) => block.kind),
  );
  assert.ok(kinds.includes("rule"), "冒頭に罫線がない");
  assert.equal(
    panel.counts.blocks,
    kinds.filter((kind) => kind !== "rule" && kind !== "mark").length,
  );
});

test("日時は3つのフィールドを持つ", () => {
  // 「直す」を押したときにどれを直すのか分からない、という状態を作らないため。
  const datetime = eventCmStoryboard(briefWith())
    .panels.flatMap((panel) => panel.regions.flatMap((region) => region.blocks))
    .find((block) => block.kind === "datetime");
  assert.deepEqual(datetime?.fields.map((field) => field.path), [
    "schedule.date",
    "schedule.time",
    "schedule.weekday",
  ]);
});

test("写真の無い登壇者は「消える」ではなく「代替で描かれる」", () => {
  const guests = eventCmStoryboard(briefWith({ guests: GUESTS })).panels.find(
    (panel) => panel.role === "guests",
  );
  const people = guests?.regions
    .flatMap((region) => region.blocks)
    .find((block) => block.kind === "people");
  assert.equal(people?.state, "filled");
  assert.deepEqual(
    people?.figures.map((figure) => figure.hasAsset),
    [true, false],
  );
});

test("会場が無いシーンは、空欄ではなく最初から存在しない", () => {
  // deliverable-architecture §17.2 — 未定を「未定」と書かない。
  const brief = briefWith();
  const storyboard = eventCmStoryboard({
    ...brief,
    schedule: { ...brief.schedule, venue: null },
  });
  const cta = storyboard.panels.find((panel) => panel.role === "cta");
  const paths = cta?.regions
    .flatMap((region) => region.blocks)
    .flatMap((block) => block.fields.map((field) => field.path));
  assert.equal(paths?.includes("schedule.venue"), false);
});

test("仮に入れた値は映画全体で1回ずつ数える", () => {
  // Two reasons the film-level number is not the sum of the panels':
  //   - `logos` shows on three pictures (both marks and the closing credits),
  //     and it is still one value to check.
  //   - `bgm` shows on none, and is still a value this tool chose.
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  const summed = storyboard.panels.reduce(
    (total, panel) => total + panel.counts.provisional,
    0,
  );
  const showingLogos = storyboard.panels.filter((panel) =>
    panel.regions.some((region) =>
      region.blocks.some((block) =>
        block.fields.some((field) => field.path === "logos"),
      ),
    ),
  ).length;

  assert.ok(showingLogos >= 3, `ロゴを映すシーンが${showingLogos}枚しかない`);
  assert.ok(
    storyboard.counts.provisional < summed,
    "同じ項目が複数のシーンに出ているのに、件数が合計と同じになっている",
  );
  assert.ok(storyboard.counts.provisional > 0);
});

test("絵コンテの尺はタイムラインと同じものを見ている", () => {
  const brief = briefWith({ guests: GUESTS });
  assert.equal(eventCmStoryboard(brief).totalMs, eventCmTimeline(brief).totalMs);
});

test("写真のあるシーンは、その写真を絵コンテでも敷く", () => {
  const brief = briefWith({
    visuals: {
      value: { src: "material:key", focus: { x: 0.5, y: 0.4 } },
      programs: { src: "material:room" },
      closing: null,
    },
  });
  const storyboard = eventCmStoryboard(brief);
  const panelFor = (role: string) =>
    storyboard.panels.find((panel) => panel.role === role);

  assert.equal(panelFor("value")?.backdrop?.src, "material:key");
  assert.deepEqual(panelFor("value")?.backdrop?.focus, { x: 0.5, y: 0.4 });
  assert.equal(panelFor("program")?.backdrop?.src, "material:room");
  // The title stands on the programme photograph as a hero (one photograph,
  // several shots — Freehand's casting, kept in the scene builder).
  assert.equal(panelFor("title")?.backdrop?.src, "material:room");
  // No photograph is not an empty frame: the ink ground is the designed state,
  // and the panel says so by carrying no backdrop at all.
  assert.equal(panelFor("cta")?.backdrop, null);
});

test("地はどのフィールドから来たかを言えるので、その場で直せる", () => {
  const brief = briefWith({
    visuals: {
      value: null,
      programs: { src: "material:room" },
      closing: null,
    },
  });
  const panel = eventCmStoryboard(brief).panels.find((entry) => entry.role === "program");
  const field = panel?.backdrop?.fields[0];
  assert.equal(field?.path, "visuals.programs");
  assert.equal(field?.label, "プログラムの背景");
  assert.equal(field?.editable, true);
});

test("登壇者のシーンは、一人ひとりの写真を直せる場所として差し出す", () => {
  const panel = eventCmStoryboard(briefWith({ guests: GUESTS })).panels.find(
    (entry) => entry.role === "guests",
  );
  const paths = panel!.regions
    .flatMap((region) => region.blocks)
    .flatMap((block) => block.fields)
    .map((field) => field.path);

  assert.ok(paths.includes("guests[0].photo"));
  assert.ok(paths.includes("guests[1].photo"));
});

test("絵コンテは、映像が実際に描くものと同じ部品・同じ大きさを言う", () => {
  // The invariant, checked against the renderer's own decisions rather than
  // against a copy of them: the stage empties suppressed fields and then runs
  // the fitter, and whatever survives that is what the panel must show.
  const long = briefWith({
    guests: GUESTS,
    programs: [
      { title: "百貨店には並ばない、蔵出しの特別な日本酒5種類をテイスティング" },
      {
        title:
          "〆張鶴・宮尾酒造十一代目当主と、Miss SAKE代表理事が語る、知られざる日本酒業界の舞台裏と世界への広がり",
      },
      {
        title:
          "2026 Miss SAKE 2名と学ぶ、日本酒の楽しみ方を広げる2つのワークショップ（飲み順・味わいの表現・テイスティングのコツ）",
      },
    ],
  });

  const storyboard = eventCmStoryboard(long);
  // Independent re-derivation through the kit's own functions — NOT through
  // film.scenes — so this still catches film.ts itself mis-fitting a scene.
  const film = eventCmFilm(long);
  for (const panel of storyboard.panels) {
    const fit = fitScene(
      sceneForRole(panel.role, film.drawn, panel.index).components,
      film.theme,
    );
    const drawn = panel.regions
      .flatMap((region) => region.blocks)
      .map((block) => `${block.kind}:${block.emphasis}`)
      .sort();
    const filmed = fit.placed
      .map((item) => `${item.component.kind}:${item.emphasis}`)
      .sort();
    assert.deepEqual(drawn, filmed, `${panel.role} が映像と違うものを描いている`);
  }
});

test("画面から消した項目は、絵コンテからも消える", () => {
  // Suppressing the speakers removes a whole scene from the film. A storyboard
  // that kept the panel would not merely show one stale block: it would show a
  // picture, its seconds and its narration line that the film does not have.
  const brief = briefWith({ guests: GUESTS });
  const off = setSuppressed(brief, "guests", true);

  assert.ok(eventCmStoryboard(brief).panels.some((panel) => panel.role === "guests"));
  const storyboard = eventCmStoryboard(off);
  assert.equal(
    storyboard.panels.some((panel) => panel.role === "guests"),
    false,
  );
  assert.equal(storyboard.totalMs, eventCmTimeline(eventCmFilm(off).drawn).totalMs);
});

test("マークは絵コンテでも画像として描ける（枠と社名の代用にしない）", () => {
  // The panel used to draw a gold-bordered box with the company name inside it
  // whether or not artwork existed. Readers took the box for the design — and
  // in this art direction gold means "somebody decided this". A figure now
  // carries the picture itself, so the panel can show what the film shows.
  const brief = briefWith({
    logos: [
      { name: "WealthPark Lab", src: "material:mark" },
      { name: "レオパレス21", src: null },
    ],
  });
  const panel = eventCmStoryboard(brief).panels.find((entry) => entry.role === "logoIn");
  const figure = panel!.regions
    .flatMap((region) => region.blocks)
    .find((block) => block.kind === "logo")!.figures[0];

  assert.equal(figure.src, "material:mark");
  assert.equal(figure.hasAsset, true);
  // The panel carries what was measured and asks the theme how to paint it —
  // the same rule the renderer follows, which is the panel's whole claim to
  // honesty. It used to default to `knockout` here, which was right about ink
  // and wrong about every other ground, exactly as the renderer was.
  assert.equal(figure.treatment, undefined);

  const noArt = eventCmStoryboard(
    briefWith({ logos: [{ name: "レオパレス21", src: null }] }),
  ).panels.find((entry) => entry.role === "logoIn");
  const credit = noArt!.regions
    .flatMap((region) => region.blocks)
    .find((block) => block.kind === "logo")!.figures[0];
  assert.equal(credit.src, null);
  assert.equal(credit.hasAsset, false);
});

test("登壇者の写真も、絵コンテがその画像を持つ", () => {
  const panel = eventCmStoryboard(briefWith({ guests: GUESTS })).panels.find(
    (entry) => entry.role === "guests",
  );
  const figures = panel!.regions
    .flatMap((region) => region.blocks)
    .find((block) => block.kind === "people")!.figures;

  assert.equal(figures[0].src, "material:a");
  // No photograph: the medallion draws a monogram, which is the design and not
  // a placeholder — so the panel keeps saying so.
  assert.equal(figures[1].src, null);
  assert.equal(figures[1].hasAsset, false);
});

test("シーンが喋るかどうかは映像の形で決まる（ナレーションの有無ではない）", () => {
  // The bug this exists to catch: three programme pictures appeared silent —
  // no line, no subtitle, no editor to write one in — because the stored narration
  // still held a single unindexed `program` line. A picture that speaks speaks
  // whether or not anybody has written its words yet.
  const brief = briefWith({
    programs: [{ title: "一つ目" }, { title: "二つ目" }, { title: "三つ目" }],
  });
  const stale: EventCmBrief = {
    ...brief,
    narration: {
      ...brief.narration,
      source: "human",
      // Written before the programmes were split into their own pictures.
      scenes: [
        { role: "title", text: "タイトルの行" },
        { role: "value", text: "価値の行" },
        { role: "program", text: "3つのプログラムをまとめて言う行" },
        { role: "cta", text: "申し込みの行" },
      ],
    },
  };

  const storyboard = eventCmStoryboard(stale);
  const programs = storyboard.panels.filter((panel) => panel.role === "program");
  assert.equal(programs.length, 3);
  for (const panel of programs) {
    assert.equal(panel.narrated, true, `プログラム${panel.index} が無音扱いになっている`);
    assert.equal(panel.narration, "", "まだ書かれていない行は空で出る");
  }

  // And the words that no longer have a picture are reported rather than
  // silently dropped: they are still in the brief.
  assert.deepEqual(
    storyboard.orphanLines.map((line) => line.text),
    ["3つのプログラムをまとめて言う行"],
  );
});

test("形が合っていれば、使われていない行は無い", () => {
  const storyboard = eventCmStoryboard(briefWith({ guests: GUESTS }));
  assert.deepEqual(storyboard.orphanLines, []);
});
