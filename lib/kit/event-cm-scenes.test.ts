import assert from "node:assert/strict";
import test from "node:test";
import { sceneForRole } from "@/remotion/kit/scenes/event-cm";
import { fitScene } from "@/remotion/kit/fit";
import { LAYOUTS, overCapacity } from "@/remotion/kit/layout";
import { LUXURY_THEME, STANDARD_THEME, SUMI_THEME, themeForBrand } from "@/remotion/kit/theme";
import { treatmentOn } from "@/remotion/kit/mark";
import {
  EVENT_CM_PROGRAM_SCENES,
  EVENT_CM_SUPPRESSED_NOTE as SUPPRESSED_NOTE,
  eventCmNarratedSteps,
  eventCmSceneBudget,
  eventCmSceneKey,
  eventCmScenePlan,
  type EventCmBrief,
} from "@/remotion/event-cm/types";
import { seedEventCmBrief } from "@/lib/templates/event-cm/seed";

// The acceptance test for the whole rewrite: can the vocabulary rebuild
// 世界が恋する日本酒? The brief below is the real one, copied from the take in
// the database (24f44bd0), with material references standing in for the files.

const SAKE: EventCmBrief = {
  presenter: "レオパレス21 × WealthPark Lab",
  seriesLabel: "「文化資本と投資」シリーズ 第3弾",
  title: "世界が恋する日本酒",
  subtitle: "〜次世代へつなぐ、文化資本への投資〜",
  valueLines: ["百貨店には並ばない、", "蔵出しの特別な日本酒。"],
  valueChip: "特別な5種を、テイスティングで",
  programsHeading: "3つのプログラム",
  programs: [
    { title: "蔵出しの特別な日本酒5種類をテイスティング" },
    { title: "十一代目当主 × Miss SAKE代表理事が語る、日本酒業界の舞台裏" },
    { title: "2026 Miss SAKE 2名と学ぶ、楽しみ方を広げるワークショップ" },
  ],
  guestsHeading: "ゲスト",
  guests: [
    { name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: { src: "material:a" } },
    { name: "大西 美香", role: "一社）Miss SAKE 代表理事", photo: { src: "material:b" } },
    {
      name: "加藤 航介",
      role: "モデレーター\nWealthPark研究所 代表",
      photo: { src: "material:c" },
    },
  ],
  schedule: { date: "2026.10.2", weekday: "FRI", time: "17:00 START", venue: null, fee: null },
  cta: "詳細・お申し込みはこちら",
  footnote: "20歳以上より参加可・お一人からご家族まで歓迎",
  logos: [
    { name: "レオパレス21", src: "material:d", scale: 0.82 },
    { name: "WealthPark Lab", src: "material:e", scale: 0.8, treatment: "invert" },
    { name: "〆張鶴", src: "material:f", scale: 1.25 },
    { name: "Miss SAKE", src: "material:g", scale: 1.35 },
  ],
  visuals: {
    value: { src: "material:i", focus: { x: 0.5, y: 0.45 } },
    programs: { src: "material:j", focus: { x: 0.55, y: 0.68 } },
    closing: { src: "material:k", focus: { x: 0.45, y: 0.5 } },
  },
  bgm: "material:m",
  narration: { version: 1, scenes: [], source: "llm", updatedAt: "", angle: "" },
};

const allScenes = (brief: EventCmBrief) =>
  eventCmScenePlan(brief).map((step) => sceneForRole(step.role, brief));

test("日本酒のブリーフはすべてのシーンに中身がある", () => {
  for (const step of eventCmScenePlan(SAKE)) {
    const scene = sceneForRole(step.role, SAKE);
    assert.ok(scene.components.length > 0, `${step.role} が空`);
  }
});

test("ロゴの描き方はシーンが決めず、地が決める", () => {
  // The kit once ignored `treatment` entirely and drew a black brand SVG as a
  // black mark on ink. The fix forced `knockout` here — right for the only
  // ground that existed, and the reason a standard film opened on an invisible
  // white mark. So the scene now CARRIES what was measured and the theme
  // decides (paint.ts `treatmentOn`).
  const measured = {
    ...SAKE,
    logos: [{ name: "宮尾酒造", src: "material:d", opaque: false, luminance: 0.05 }],
  };
  const mark = sceneForRole("logoIn", measured).components.find(
    (component) => component.kind === "logo",
  );
  assert.ok(mark && mark.kind === "logo");
  assert.equal(mark.treatment, undefined, "シーンが描き方を固めている");
  assert.equal(mark.opaque, false);
  assert.equal(mark.luminance, 0.05);
  // One mark, both grounds, no rewrite of the brief in between.
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, mark), "knockout");
  assert.equal(treatmentOn(STANDARD_THEME.palette.ground, mark), "light");

  // The brief's own instruction still wins where it has one — existing briefs
  // carry one, and one of those is a delivered commission.
  const stated = sceneForRole("logoIn", {
    ...SAKE,
    logos: [{ name: "レオパレス21", src: "material:d", treatment: "light" }],
  }).components.find((component) => component.kind === "logo");
  assert.ok(stated && stated.kind === "logo");
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, stated), "light");

  // The closing credits row goes through the same rule, mark by mark.
  const row = sceneForRole("cta", measured).components.find(
    (component) => component.kind === "logoRow",
  );
  assert.ok(row && row.kind === "logoRow");
  assert.equal(
    row.logos.every(
      (logo) => TREATMENTS.has(treatmentOn(SUMI_THEME.palette.ground, logo)),
    ),
    true,
    "クレジット列に描き方の決まらないロゴがある",
  );
});

const TREATMENTS = new Set(["light", "invert", "knockout", "blackout"]);

test("登壇者の絵はテンプレートが持ち、消したときだけ消える", () => {
  // The speaker picture is the template's, not the facts'. An empty guest list
  // used to remove it, which made the film's shape move underneath a narration
  // that had already been written and recorded.
  assert.equal(
    eventCmScenePlan(SAKE).filter((step) => step.role === "guests").length,
    1,
  );
  const noGuests: EventCmBrief = { ...SAKE, guests: [] };
  assert.equal(
    eventCmScenePlan(noGuests).filter((step) => step.role === "guests").length,
    1,
    "登壇者が空でも絵は残る（消すのは削除の操作）",
  );
  const deleted: EventCmBrief = {
    ...SAKE,
    provenance: {
      ...SAKE.provenance,
      guests: { origin: "user", note: SUPPRESSED_NOTE },
    },
  };
  assert.equal(
    eventCmScenePlan(deleted).filter((step) => step.role === "guests").length,
    0,
  );
});

test("実データのどのシーンも、部品を落とさずに組める", () => {
  // The whole promise of the fitter: real copy, real lengths, nothing spills
  // and nothing silently disappears.
  for (const scene of allScenes(SAKE)) {
    const fit = fitScene(scene.components, SUMI_THEME);
    assert.deepEqual(
      fit.dropped.map((component) => component.kind),
      [],
      `${scene.layout} で部品が落ちた`,
    );
  }
});

test("どのシーンも配置の容量に収まる", () => {
  for (const scene of allScenes(SAKE)) {
    assert.deepEqual(
      overCapacity(scene).map((component) => component.kind),
      [],
      `${scene.layout} が容量超過`,
    );
  }
});

test("どのシーンにも主役は最大1つ", () => {
  for (const scene of allScenes(SAKE)) {
    const heroes = fitScene(scene.components, SUMI_THEME).placed.filter(
      (item) => item.emphasis === "hero",
    );
    assert.ok(heroes.length <= 1, `${scene.layout} に主役が${heroes.length}個`);
  }
});

test("配置が一種類に偏らない（スライドデッキに見えないこと）", () => {
  // An earlier version of this test forbade two adjacent scenes from sharing a
  // layout, and the film failed it on its opening pair — a quiet centred
  // series card resolving into the centred title. That is a build, not
  // repetition, and the original hand-composed film does the same thing. What
  // actually reads as a slide deck is one arrangement carrying everything.
  const layouts = allScenes(SAKE).map((scene) => scene.layout);
  const counts = new Map<string, number>();
  for (const layout of layouts) counts.set(layout, (counts.get(layout) ?? 0) + 1);

  assert.ok(counts.size >= 3, `配置が${counts.size}種類しかない`);
  for (const [layout, count] of counts) {
    assert.ok(
      count <= layouts.length / 2,
      `${layout} が${count}/${layouts.length}シーンを占めている`,
    );
  }
});

test("未確定の事実は画面に出ない", () => {
  const cta = sceneForRole("cta", SAKE);
  const texts = cta.components.flatMap((component) =>
    component.kind === "body" ? [component.text] : [],
  );
  // venue と fee は null。「未定」も空欄も出さない。
  assert.ok(!texts.some((text) => text.includes("未定")));
  assert.equal(
    cta.components.some((component) => component.kind === "datetime"),
    true,
  );
});

test("写真があれば地として敷き、無ければ墨の地のまま", () => {
  // The sake film's own treatment: the promise stands ON its photograph, the
  // programme list stands IN the room it was photographed in.
  const value = sceneForRole("value", SAKE);
  assert.equal(value.backdrop?.photo.src, "material:i");
  assert.equal(value.backdrop?.weight, "hero");

  const program = sceneForRole("program", SAKE);
  assert.equal(program.backdrop?.photo.src, "material:j");
  assert.equal(program.backdrop?.weight, "support");

  const cta = sceneForRole("cta", SAKE);
  assert.equal(cta.backdrop?.photo.src, "material:k");
  assert.equal(cta.backdrop?.weight, "support");

  // The two silent plates never take one: they exist to show whose film this
  // is, and a photograph behind the mark answers a different question.
  assert.equal(sceneForRole("logoIn", SAKE).backdrop, undefined);
  assert.equal(sceneForRole("logoOut", SAKE).backdrop, undefined);

  const bare: EventCmBrief = {
    ...SAKE,
    visuals: { value: null, programs: null, closing: null },
  };
  for (const role of ["value", "program", "cta"] as const) {
    assert.equal(sceneForRole(role, bare).backdrop, undefined);
  }
});

test("地の減光はテーマが決める（シーンは役割だけを言う）", () => {
  assert.ok(SUMI_THEME.backdrop.opacity.hero > SUMI_THEME.backdrop.opacity.support);
  const [from, to] = SUMI_THEME.backdrop.push;
  assert.ok(to > from, "寄りが止まっている");
});

test("素材がゼロでも全シーンが成立する", () => {
  const bare: EventCmBrief = {
    ...SAKE,
    guests: SAKE.guests.map((guest) => ({ ...guest, photo: null })),
    logos: SAKE.logos.map((logo) => ({ ...logo, src: null })),
    visuals: { value: null, programs: null, closing: null },
    bgm: null,
  };
  for (const scene of allScenes(bare)) {
    const fit = fitScene(scene.components, SUMI_THEME);
    assert.deepEqual(fit.dropped, [], `${scene.layout} が素材ゼロで壊れた`);
    assert.ok(fit.placed.length > 0, `${scene.layout} が空になった`);
  }
});

test("シードしたWealthPark Labのブリーフも同じ条件を満たす", () => {
  const seeded = seedEventCmBrief(
    {
      name: "WealthPark Lab",
      industry: "金融教育メディア",
      palette: { primary: "#080808", background: "#ffffff", text: "#000000" },
      headingFont: "Zen Kaku Gothic New",
      bodyFont: "Zen Kaku Gothic New",
    },
    { now: new Date("2026-08-11T09:00:00+09:00"), seed: "take-1" },
  );
  const theme = themeForBrand(SUMI_THEME, seeded.theme ?? {});
  // Colour only: the brand's gothic must NOT displace the template's mincho.
  // The sake film rendered in the brand face and it was the first thing that
  // broke the art direction (Freehand Lab, 2026-08-18) — the same rule the LP
  // templates carry ("色だけ継いで組版は継がない").
  assert.equal(theme.displayFont, SUMI_THEME.displayFont, "組版はテンプレートのもの");

  for (const scene of allScenes(seeded)) {
    const fit = fitScene(scene.components, theme);
    assert.deepEqual(fit.dropped, [], `${scene.layout} で部品が落ちた`);
  }
});

test("すべての配置が実際に使われているわけではない（未使用は今後の余地）", () => {
  const used = new Set(allScenes(SAKE).map((scene) => scene.layout));
  const unused = Object.keys(LAYOUTS).filter((layout) => !used.has(layout as never));
  // Not a failure — a record. Left-right splits are unused by this film, so
  // the next template that needs one is exercising untested ground.
  assert.ok(unused.length > 0);
});

test("プログラムが複数あれば、1つずつ1シーンで紹介する", () => {
  const plan = eventCmScenePlan(SAKE);
  const roles = plan.map((step) => step.role);
  // Three programmes, three programme pictures — and the speaker scene still
  // exists because speakers were announced.
  assert.deepEqual(roles, [
    "logoIn",
    "title",
    "value",
    "program",
    "program",
    "program",
    "guests",
    "cta",
    "logoOut",
  ]);
  assert.deepEqual(
    plan.filter((step) => step.role === "program").map((step) => step.index),
    [0, 1, 2],
  );

  // Each picture shows its own programme, numbered, and nothing about the
  // others: the number reads as "which of how many" without a word.
  const second = sceneForRole("program", SAKE, 1);
  const lines = second.components.find((component) => component.kind === "lines");
  assert.deepEqual(lines?.kind === "lines" ? lines.lines : [], [SAKE.programs[1].title]);
  const stat = second.components.find((component) => component.kind === "stat");
  // Plain kanji in a seal box: digits read as pagination, bare kanji as bars.
  assert.equal(stat?.kind === "stat" ? stat.value : null, "二");
  assert.equal(stat?.kind === "stat" ? stat.unit : null, "PROGRAM 2 / 3");
  assert.equal(stat?.kind === "stat" ? stat.variant : null, "seal");
  for (const scene of [sceneForRole("program", SAKE, 0), second]) {
    const fit = fitScene(scene.components, SUMI_THEME);
    assert.deepEqual(fit.dropped, [], "プログラムのシーンで部品が落ちている");
  }
});

test("数字の様式はアートディレクションが決める", () => {
  // The seal is a 和 device: in a gothic face 「一」 is a thick blue bar, which
  // is what the first standard render showed. So the theme owns the register
  // (theme.ts `ornament.numerals`) and the scene emits the matching variant —
  // 一二三 in a seal for 墨, 01 02 03 as a bare ordinal for standard.
  const seal = sceneForRole("program", SAKE, 1, SUMI_THEME).components.find(
    (component) => component.kind === "stat",
  );
  assert.equal(seal?.kind === "stat" ? seal.value : null, "二");
  assert.equal(seal?.kind === "stat" ? seal.variant : null, "seal");

  const ordinal = sceneForRole("program", SAKE, 1, STANDARD_THEME).components.find(
    (component) => component.kind === "stat",
  );
  assert.equal(ordinal?.kind === "stat" ? ordinal.value : null, "02");
  assert.equal(ordinal?.kind === "stat" ? ordinal.unit : null, "PROGRAM 2 / 3");
  assert.equal(ordinal?.kind === "stat" ? ordinal.variant : null, "ordinal");

  // Without an explicit theme the scene reads the brief's own art direction,
  // which is what the film would resolve to — so a caller cannot get 墨's
  // numerals on a standard brief by forgetting the argument.
  const fromBrief = sceneForRole("program", { ...SAKE, artDirection: "standard" }, 2).components.find(
    (component) => component.kind === "stat",
  );
  assert.equal(fromBrief?.kind === "stat" ? fromBrief.value : null, "03");

  // ラグジュアリー: I II III in a ring.
  const ring = sceneForRole("program", SAKE, 2, LUXURY_THEME).components.find(
    (component) => component.kind === "stat",
  );
  assert.equal(ring?.kind === "stat" ? ring.value : null, "III");
  assert.equal(ring?.kind === "stat" ? ring.variant : null, "ring");

  // And nothing falls off the stage in any register.
  for (const theme of [SUMI_THEME, STANDARD_THEME, LUXURY_THEME]) {
    const fit = fitScene(sceneForRole("program", SAKE, 0, theme).components, theme);
    assert.deepEqual(fit.dropped, [], `${theme.id}: プログラムのシーンで部品が落ちている`);
  }
});

test("プログラムが1つでも、アジェンダは3枚のまま", () => {
  // The picture count is the TEMPLATE's (EVENT_CM_PROGRAM_SCENES), not the
  // item count. An evening with one programme deletes the two it does not use
  // — which is a decision somebody makes, not a shape the facts impose.
  const one: EventCmBrief = { ...SAKE, programs: [SAKE.programs[0]] };
  const plan = eventCmScenePlan(one);
  assert.equal(
    plan.filter((step) => step.role === "program").length,
    EVENT_CM_PROGRAM_SCENES,
  );
  assert.deepEqual(
    plan.filter((step) => step.role === "program").map((step) => step.index),
    [0, 1, 2],
    "どの絵のことか言えない枚がある",
  );

  // An empty slot keeps its numeral and says nothing else. It used to borrow
  // the WHOLE list, so a one-programme evening said the same thing three times.
  const empty = sceneForRole("program", one, 2);
  assert.ok(
    empty.components.some((component) => component.kind === "stat"),
    "何枚目かを言っていない",
  );
  assert.ok(
    !empty.components.some((component) => component.kind === "list"),
    "空のスロットが一覧を借りている",
  );
});

test("プログラムのシーンは、その分だけナレーションの行を要求する", () => {
  const steps = eventCmNarratedSteps(SAKE);
  assert.deepEqual(steps.map(eventCmSceneKey), [
    "title",
    "value",
    "program#0",
    "program#1",
    "program#2",
    "guests",
    "cta",
  ]);
  // The first programme picture gets more room because it also introduces the
  // set; the others say one thing each.
  assert.ok(eventCmSceneBudget(steps[2]).max > eventCmSceneBudget(steps[3]).max);
});
