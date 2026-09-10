import assert from "node:assert/strict";
import test from "node:test";
import { proposedDate, seedEventCmBrief } from "./seed";
import { archetypeFor } from "./archetypes";
import { templateBgm, templatePortrait, templateVisual } from "@/lib/assets/defaults";
import {
  currentTemplate,
  defaultArtDirection,
  templateDressing,
} from "@/lib/templates/catalog";
import { eventCmGoalState } from "@/lib/pipeline/event-cm";
import { validateBrief } from "@/lib/templates/brief-schemas";
import { STANDARD_THEME, SUMI_THEME, themeById } from "@/remotion/kit/theme";
import {
  eventCmNarratedSteps,
  eventCmSceneBudget,
  eventCmSceneKey,
  narrationIsStale,
  sceneChars,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

/** The real brand, as it stands in the database after the site import. */
const WEALTHPARK_LAB = {
  name: "WealthPark Lab",
  industry: "金融教育メディア",
  description:
    "WealthPark研究所は、投資の本質をテーマに記事、対談、金融経済教育プログラムなどを発信する情報メディアです。",
};

const NOW = new Date("2026-08-11T09:00:00+09:00");
const seedFor = (brand: typeof WEALTHPARK_LAB) =>
  seedEventCmBrief(brand, { now: NOW, seed: "take-1" });

test("シードしたブリーフはテンプレートの形式を満たす", () => {
  // The take is created from exactly this object, so a schema it cannot pass
  // means "add a video" fails with no way to see why from the seeder alone.
  const result = validateBrief("event-cm", seedFor(WEALTHPARK_LAB));
  assert.equal(result.ok, true, result.ok ? "" : result.issues.join(" / "));
});

test("スキーマが拒むのは、映像に置き場のない行だけ", () => {
  const brief = seedFor(WEALTHPARK_LAB);
  const narrated = eventCmNarratedSteps(brief).map((step) => step.role);

  // A half-written narration is legal, and so is the seeded draft.
  assert.equal(validateBrief("event-cm", brief).ok, true);
  assert.equal(
    validateBrief("event-cm", { ...brief, narration: { ...brief.narration, scenes: [] } })
      .ok,
    true,
  );

  // The speaker picture is the template's, so its line is expected from the
  // start — it no longer waits for somebody to be announced.
  assert.equal(narrated.includes("guests"), true);
  assert.equal(
    validateBrief("event-cm", {
      ...brief,
      narration: {
        ...brief.narration,
        scenes: eventCmNarratedSteps(brief).map(({ role, index }) => ({
          role,
          ...(index === undefined ? {} : { index }),
          text: "…",
        })),
      },
    }).ok,
    true,
  );

  // A line for a silent scene has no picture to sit on.
  assert.equal(
    validateBrief("event-cm", {
      ...brief,
      narration: { ...brief.narration, scenes: [{ role: "logoIn", text: "…" }] },
    }).ok,
    false,
  );

  // A role may repeat, but only as consecutive indexed pictures — that is what
  // one-programme-per-picture is. Unindexed repeats are still the same picture
  // written twice.
  assert.equal(
    validateBrief("event-cm", {
      ...brief,
      narration: {
        ...brief.narration,
        scenes: [
          { role: "title", text: "…" },
          { role: "program", index: 0, text: "…" },
          { role: "program", index: 1, text: "…" },
          { role: "cta", text: "…" },
        ],
      },
    }).ok,
    true,
  );
  assert.equal(
    validateBrief("event-cm", {
      ...brief,
      narration: {
        ...brief.narration,
        scenes: [
          { role: "program", index: 1, text: "…" },
          { role: "program", index: 0, text: "…" },
        ],
      },
    }).ok,
    false,
    "番号が戻るのは並び違い",
  );

  // The same scene twice, and scenes out of film order.
  assert.equal(
    validateBrief("event-cm", {
      ...brief,
      narration: {
        ...brief.narration,
        scenes: [
          { role: "title", text: "…" },
          { role: "title", text: "…" },
        ],
      },
    }).ok,
    false,
  );
  assert.equal(
    validateBrief("event-cm", {
      ...brief,
      narration: {
        ...brief.narration,
        scenes: [
          { role: "cta", text: "…" },
          { role: "title", text: "…" },
        ],
      },
    }).ok,
    false,
  );
});

test("事実が新しくなったら、保存を拒まず「ナレーションが古い」と言う", () => {
  // The flow this protects: drop in a flyer that names a speaker. The words are
  // now about an older version of the event, and refusing to save the speaker
  // would be the wrong answer to a fact somebody just supplied.
  //
  // The film no longer gains a PICTURE here — the speaker scene was always
  // there (EVENT_CM_SCENES) — so what goes stale is the facts, not the shape.
  const brief = seedFor(WEALTHPARK_LAB);
  const written: EventCmBrief = {
    ...brief,
    narration: {
      ...brief.narration,
      scenes: eventCmNarratedSteps(brief).map(({ role, index }) => ({
        role,
        ...(index === undefined ? {} : { index }),
        text: "…",
      })),
      updatedAt: "2026-08-13T00:00:00.000Z",
    },
  };
  assert.equal(narrationIsStale(written), false);

  const withGuest: EventCmBrief = {
    ...written,
    guests: [{ name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null }],
    // Stamped by whoever wrote the fact — the mapping stage, or an edit in the
    // fact list. It is what tells the narration it is describing an older event.
    factsUpdatedAt: "2026-08-14T00:00:00.000Z",
  };
  assert.equal(validateBrief("event-cm", withGuest).ok, true, "保存は通る");
  assert.equal(narrationIsStale(withGuest), true, "ナレーションは古いと分かる");
});

test("提案する日付は4週間以上先の最初の金曜日", () => {
  const date = proposedDate(NOW);
  assert.equal(date.getDay(), 5, "金曜日であること");
  const daysOut = Math.round((date.getTime() - NOW.getTime()) / 86_400_000);
  assert.ok(daysOut >= 28, `4週間以上先であること (${daysOut}日後)`);
  assert.ok(daysOut < 35, "先すぎないこと");
});

test("業種から金融向けのイベント型を選ぶ", () => {
  assert.equal(archetypeFor(WEALTHPARK_LAB).id, "finance-talk");
});

test("業種が読めなければ一般セミナーに落ちる", () => {
  assert.equal(archetypeFor({ industry: "", description: "" }).id, "general-seminar");
});

test("シードだけで必須項目が全部埋まる", () => {
  // Including the narration: every picture that speaks arrives with a draft
  // line. 「追加した瞬間に完成した映像が再生される」 used to be true of the
  // pictures and false of the words.
  const state = eventCmGoalState(seedFor(WEALTHPARK_LAB));
  assert.deepEqual(
    state.progress.missingRequired.map((field) => field.path),
    [],
    "残っている必須項目がある",
  );
});

test("推定した値だけが暫定として報告される", () => {
  const state = eventCmGoalState(seedFor(WEALTHPARK_LAB));
  const provisional = state.provisional.map((field) => field.path).sort();

  assert.ok(provisional.includes("schedule.date"));
  assert.ok(provisional.includes("title"));
  assert.ok(provisional.includes("programs"));
  // The brand's own name is not a guess.
  assert.ok(!provisional.includes("presenter"));
});

test("登壇者は、いかにも見本の氏名と所属で提案する", () => {
  // Until 2026-08-30 this said 「氏名は発明しない」 and the seeded guests were
  // 「ゲストスピーカー」 and 「モデレーター」. The owner reversed it: the seeded
  // film is a sample somebody decides from, and a speaker picture captioned
  // with two job categories does not show what the template does with a
  // speaker picture.
  //
  // What replaced the old rule is a narrower one, and it is what this test
  // guards: the name must be UNMISTAKABLY fictional. 山田太郎 is the Japanese
  // John Doe. A plausible name beside a real stock face is still the failure.
  const guests = seedFor(WEALTHPARK_LAB).guests;
  assert.deepEqual(
    guests.map((guest) => guest.name),
    ["山田太郎", "山田花子"],
  );
  // And the name carries NO caveat, because the narration reads names aloud.
  // 「（見本）」 lived here for a day and the voice said it: 「ゲストスピーカー
  // 見本と、モデレーター見本が、対話をつくります」. The caveat belongs to the
  // photograph, which is not a spoken fact.
  assert.ok(
    guests.every((guest) => !guest.name.includes("見本")),
    "読み上げられる名前に「見本」が入っている",
  );
  assert.ok(
    guests.every((guest) => guest.photo?.sample === true),
    "見本写真に見本の印が付いていない",
  );
  // 会社 / 肩書き, on two lines, because that is how a speaker is credited and
  // because both presentations set `role` with white-space: pre-line.
  assert.deepEqual(
    guests.map((guest) => guest.role),
    ["株式会社サンプル\n代表取締役CEO", `${WEALTHPARK_LAB.name}\n広報`],
  );
  // The guest comes from outside and the moderator hosts: only one of them
  // carries an invented company, and the other carries the brand's own name.
  assert.ok(
    guests[1].role.startsWith(WEALTHPARK_LAB.name),
    "モデレーターの所属が自社になっていない",
  );
});

test("登壇者には、見た目の違う見本写真が付く", () => {
  // Two grey-haired men in navy suits is what pool order would have given, and
  // a speaker scene where both panels read as the same person is worse than one
  // with no photographs at all. The template names them (catalog.ts), so this
  // reads the declaration rather than the filenames.
  const template = currentTemplate("event-cm");
  assert.ok(template);
  // In EVERY painting: the standard film has no stills yet, but it does not
  // open its speaker scene on two monograms either.
  for (const artDirection of [SUMI_THEME.id, STANDARD_THEME.id]) {
    const guests = seedEventCmBrief(WEALTHPARK_LAB, { now: NOW, seed: "take-1", artDirection }).guests;
    const declared = templateDressing(template, artDirection).visuals;
    guests.forEach((guest, at) => {
      const asset = templatePortrait(declared[`guests.${at}.photo`]);
      assert.ok(asset, `${artDirection}: guests.${at}.photo に見本写真が宣言されていない`);
      assert.equal(guest.photo?.src, asset.src);
    });
    assert.notEqual(
      guests[0].photo?.src,
      guests[1].photo?.src,
      `${artDirection}: 同じ顔が2枚並んでいる`,
    );
  }

  // Named as this tool's guess, so the fact list says 「仮に入れた値」.
  const brief = seedFor(WEALTHPARK_LAB);
  assert.equal(brief.provenance?.["guests.0.photo"]?.origin, "inferred");
});

test("シードのナレーションは、喋る全シーンに1行ずつ入る", () => {
  const brief = seedFor(WEALTHPARK_LAB);
  assert.deepEqual(
    brief.narration.scenes.map((scene) => eventCmSceneKey(scene)),
    eventCmNarratedSteps(brief).map((step) => eventCmSceneKey(step)),
  );
  assert.equal(brief.narration.source, "seed", "テンプレートが書いた下書き。上書きできる");
  assert.equal(narrationIsStale(brief), false);
});

test("シードのナレーションは事実を語らず、尺の目安に収まる", () => {
  // The lines are spoken and shown as subtitles, and a subtitle carries no
  // 「仮に入れた値」 label — so a draft that stated a date would read as an
  // announcement. They say what their scene is FOR (README「捏造の方針」).
  for (const scene of seedFor(WEALTHPARK_LAB).narration.scenes) {
    assert.doesNotMatch(
      scene.text,
      /[0-9０-９]/,
      `${scene.role} の下書きが数字を語っている: ${scene.text}`,
    );
    const budget = eventCmSceneBudget(scene);
    const chars = sceneChars(scene);
    assert.ok(
      chars >= budget.min && chars <= budget.max,
      `${scene.role} が目安${budget.min}〜${budget.max}字を外れている (${chars}字)`,
    );
  }
});

test("誰も言っていない事実は空のままにする", () => {
  const brief = seedFor(WEALTHPARK_LAB);
  assert.equal(brief.schedule.venue, null, "会場を「未定」と書かない");
  assert.equal(brief.schedule.fee, null);
  assert.equal(brief.footnote, null);
});

test("同じブランドからは毎回同じブリーフが出る", () => {
  // A re-render with no changed input must not produce a different film.
  assert.deepEqual(seedFor(WEALTHPARK_LAB), seedFor(WEALTHPARK_LAB));
});

test("新しい動画は、テンプレートの既定画像で3つの地が埋まる", () => {
  // This used to assert the slots were NULL, and the pool being empty was the
  // only reason that held. Now that it carries pictures, the seed takes tier 2
  // of the ladder (brand → TEMPLATE → system → the composition's designed
  // substitute), and the film opens on a photograph rather than bare ink.
  //
  // The tier-4 premise — a slot the pool cannot fill is still a finished frame
  // — has not gone away and is not tested here; it belongs to the art
  // direction, and lib/kit/themes.test.ts guards it ("どのテーマも素材ゼロの
  // 地を持つ"). Asserting it from an accident of an empty pool is what stopped
  // being possible.
  const brief = seedFor(WEALTHPARK_LAB);
  // The dressing of the painting the seed chose — the template's first
  // (catalog.ts `artDirections`). Both paintings carry a full set of stills,
  // so this does not depend on which one leads.
  const declared = templateDressing(currentTemplate("event-cm")!, brief.artDirection).visuals;

  for (const path of ["visuals.value", "visuals.programs", "visuals.closing"]) {
    const asset = templateVisual(declared[path]);
    assert.ok(asset, `${path} に既定画像が宣言されていない`);
    const key = path.split(".")[1] as "value" | "programs" | "closing";
    assert.equal(brief.visuals[key]?.src, asset.src);
    // Named as this tool's guess, not as the brand's own picture — a stock
    // photograph must show up in the fact list as 「仮に入れた値」.
    assert.equal(brief.provenance?.[path]?.origin, "inferred");
  }

  assert.ok(brief.title.length > 0);
  assert.ok(brief.programs.length > 0);
});

test("新しい動画には最初からBGMが入る", () => {
  // Music is not something a user is asked for; nobody uploads a soundtrack.
  // Which track is the TEMPLATE's decision, so the expectation reads the
  // catalog rather than naming a file — swapping the placeholder for a
  // commissioned track must not break this.
  const brief = seedFor(WEALTHPARK_LAB);
  const declared = templateBgm(
    templateDressing(currentTemplate("event-cm")!, brief.artDirection).bgm,
  );
  assert.ok(declared, "event-cm が既定BGMを宣言していない");
  assert.equal(brief.bgm, declared?.src);
  assert.equal(brief.provenance?.bgm?.origin, "inferred");
});

test("誰も選ばなければ、テンプレートの先頭のアートディレクションで始まる", () => {
  // The add dialog asks which painting; a caller with no opinion (a script)
  // gets the template's first declared one, and that has to be the same id
  // `defaultRenders` writes to the render row — otherwise the brief and
  // `take_renders.theme` disagree about what the film is painted in.
  //
  // Reads the catalog rather than naming a painting, for the same reason the
  // BGM test does: the declaration is the source of truth, not this file.
  // Today that first entry is standard (owner's call, 2026-08-30). 墨 remains
  // what a film with NO art direction recorded is painted in — a different
  // question, guarded by `LEGACY_THEME_ID` in lib/kit/themes.test.ts.
  const template = currentTemplate("event-cm");
  assert.ok(template);
  const declared = defaultArtDirection(template);
  assert.ok(declared, "event-cm が既定のアートディレクションを宣言していない");
  assert.equal(seedFor(WEALTHPARK_LAB).artDirection, declared);
  assert.equal(template.defaultRenders[0]?.theme, declared);
  assert.equal(themeById(declared).id, STANDARD_THEME.id);
});

test("スタンダードを選ぶと、その塗りの服を着て事実は同じ", () => {
  // Same brand, same date, same programmes — the art direction changes how the
  // film is painted and what it is dressed in (music, stock pictures), never
  // what it says. The dressing is read from the catalog, not named here.
  const template = currentTemplate("event-cm");
  assert.ok(template);
  // Both named on purpose. `seedFor` follows the catalog's first entry, which
  // is now standard — reading one of these off the default would compare a
  // painting with itself the next time the order changes.
  const sumi = seedEventCmBrief(WEALTHPARK_LAB, {
    now: NOW,
    seed: "take-1",
    artDirection: SUMI_THEME.id,
  });
  const standard = seedEventCmBrief(WEALTHPARK_LAB, {
    now: NOW,
    seed: "take-1",
    artDirection: STANDARD_THEME.id,
  });
  assert.equal(standard.artDirection, STANDARD_THEME.id);

  const dressing = templateDressing(template, STANDARD_THEME.id);
  assert.equal(standard.bgm, templateBgm(dressing.bgm)?.src);
  assert.notEqual(standard.bgm, sumi.bgm, "塗りが違うのに同じ曲で始まっている");
  for (const path of ["visuals.value", "visuals.programs", "visuals.closing"] as const) {
    const key = path.split(".")[1] as "value" | "programs" | "closing";
    const asset = templateVisual(dressing.visuals[path]);
    assert.equal(standard.visuals[key]?.src ?? null, asset?.src ?? null, `${path} が宣言と違う`);
  }

  // The facts are the facts.
  assert.equal(standard.title, sumi.title);
  assert.deepEqual(standard.programs, sumi.programs);
  assert.deepEqual(standard.schedule, sumi.schedule);
  assert.deepEqual(
    standard.guests.map((guest) => guest.name),
    sumi.guests.map((guest) => guest.name),
  );
});

test("既定のBGMはブランドが違っても同じ", () => {
  // A default that differs between two videos is not a default, it is a
  // surprise. Now structural rather than incidental: the track comes from the
  // template, so the brand cannot reach it (it used to be chosen from the
  // archetype's tone, which is derived from the brand's industry).
  const other = seedEventCmBrief(
    { name: "別のブランド", industry: "SaaS" },
    { now: NOW, seed: "take-zzz" },
  );
  assert.equal(other.bgm, seedFor(WEALTHPARK_LAB).bgm);
});

test("event-promo のフィールドは持たない", () => {
  // `EventCmBrief extends EventBrief` をやめた本体の確認
  // (remotion/event-cm/types.ts、docs/old/event-cm-refactor-plan.md §11.3)。
  //
  // Three fields no event-cm scene draws used to arrive here for free, and the
  // goal and the fact list offered all three to the user. Filling one changed
  // nothing on screen — which is worse than not offering it, because it teaches
  // that this list does not mean anything.
  const brief = seedFor(WEALTHPARK_LAB) as unknown as Record<string, unknown>;
  assert.equal("sideCopy" in brief, false, "sideCopy は event-promo の縦組みコピー");
  const visuals = brief.visuals as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(visuals).sort(),
    ["closing", "programs", "value"],
    "地を受け取るのは3シーンだけ（inkArt / texture は event-promo）",
  );
});

test("古いブリーフを保存すると、死んだフィールドは落ちる", () => {
  // Why §11.3 needed no migration. Every write path saves `validateBrief`'s
  // OUTPUT, and zod strips what the schema does not name — so a brief stored
  // before this change loses the three fields the next time it is saved, and
  // keeps everything else exactly as it was.
  const stored = {
    ...seedFor(WEALTHPARK_LAB),
    sideCopy: "縦組みの補足コピー",
    visuals: {
      ...seedFor(WEALTHPARK_LAB).visuals,
      inkArt: "defaults/art/sumi.png",
      texture: "defaults/photos/slate.jpg",
    },
  };
  const result = validateBrief("event-cm", stored);
  assert.equal(result.ok, true, result.ok ? "" : result.issues.join(" / "));
  if (!result.ok) return;
  const cleaned = result.brief as Record<string, unknown>;
  assert.equal("sideCopy" in cleaned, false);
  assert.deepEqual(
    Object.keys(cleaned.visuals as Record<string, unknown>).sort(),
    ["closing", "programs", "value"],
  );
  // The living fields survive: stripping is not a reset.
  assert.equal(cleaned.title, stored.title);
  assert.equal(cleaned.bgm, stored.bgm);
});
