import assert from "node:assert/strict";
import test from "node:test";
import { placeImagesIntoBrief, type ImageMaterial } from "./place-images";
import { treatmentOn } from "@/remotion/kit/mark";
import { STANDARD_THEME, SUMI_THEME } from "@/remotion/kit/theme";
import { markUserEdited, setSuppressed } from "./facts";
import { seedEventCmBrief } from "./seed";
import type { ImageReading } from "./structure";
import type { EventCmBrief } from "@/remotion/event-cm/types";

/**
 * Whether a slot was left alone by the reading.
 *
 * These tests used to say `=== null`, which meant the same thing only while an
 * unfilled slot was an EMPTY one. The template now dresses all three from the
 * default pool (lib/templates/catalog.ts `defaultVisuals`), so an untouched
 * slot holds a stock photograph — and a stock photograph is exactly what a
 * reading is allowed to replace. What the assertions were protecting is that
 * the READING did not put its material here, so that is what they now say.
 */
const notTakenFromMaterial = (photo: { src: string } | null): boolean =>
  !photo?.src.startsWith("material:");

const SEEDED = seedEventCmBrief(
  { name: "WealthPark Lab", industry: "金融教育メディア" },
  { now: new Date("2026-08-11T09:00:00+09:00"), seed: "take-1" },
);

const WITH_GUESTS: EventCmBrief = {
  ...SEEDED,
  guests: [
    { name: "宮尾 佳明", role: "宮尾酒造 十一代目当主", photo: null },
    { name: "大西 美香", role: "Miss SAKE 代表理事", photo: null },
  ],
};

const reading = (over: Partial<ImageReading> & { ref: string }): ImageReading => ({
  role: "scene-photo",
  // Placement reads `role`; `category` is the material's own axis and is not
  // consulted here. Present so the fixture matches the schema.
  category: null,
  caption: "",
  visibleText: [],
  personName: null,
  personEvidence: null,
  personEvidenceRef: null,
  focusX: "centre",
  focusY: "centre",
  confidence: "high",
  reason: "",
  ...over,
});

const material = (id: string, over: Partial<ImageMaterial> = {}): ImageMaterial => ({
  materialId: id,
  label: `${id}.jpg`,
  luminance: 0.2,
  opaque: false,
  aspect: 1.5,
  sent: true,
  ...over,
});

test("氏名の根拠がある顔写真は、その登壇者に入る", () => {
  const result = placeImagesIntoBrief(
    WITH_GUESTS,
    [
      reading({
        ref: "img-1",
        role: "speaker-portrait",
        personName: "宮尾佳明",
        personEvidence: "image-caption",
        focusY: "upper",
      }),
    ],
    [material("img-1")],
    "フライヤー.pdf",
  );

  assert.equal(result.brief.guests[0].photo?.src, "material:img-1");
  assert.equal(result.brief.guests[0].photo?.focus?.y, 0.38);
  assert.equal(result.brief.guests[1].photo, null);
  assert.equal(result.placed[0].path, "guests[0].photo");
  assert.equal(result.brief.provenance?.["guests[0].photo"]?.origin, "extracted");
});

test("誰の顔か根拠が無ければ、置かずに理由を残す", () => {
  const result = placeImagesIntoBrief(
    WITH_GUESTS,
    [reading({ ref: "img-1", role: "speaker-portrait" })],
    [material("img-1")],
    "フライヤー.pdf",
  );

  assert.equal(result.placed.length, 0);
  assert.equal(result.brief.guests[0].photo, null);
  assert.match(result.unused[0].reason, /誰の写真か/);
  // One line per picture: the first reason is the real one, and repeating it
  // at the end as "no free slot" would count one image twice.
  assert.equal(result.unused.length, 1);
});

test("登壇者に居ない人の写真は置かない", () => {
  const result = placeImagesIntoBrief(
    WITH_GUESTS,
    [
      reading({
        ref: "img-1",
        role: "speaker-portrait",
        personName: "田中 太郎",
        personEvidence: "document-text",
      }),
    ],
    [material("img-1")],
    "フライヤー.pdf",
  );

  assert.equal(result.placed.length, 0);
  assert.match(result.unused[0].reason, /登壇者に居ません/);
});

test("キービジュアル・情景・会場が、主役／プログラム／締めへ順に入る", () => {
  const result = placeImagesIntoBrief(
    SEEDED,
    [
      reading({ ref: "img-1", role: "key-visual", caption: "乾杯の様子" }),
      reading({ ref: "img-2", role: "scene-photo", caption: "蔵での実演" }),
      reading({ ref: "img-3", role: "venue", caption: "会場全景" }),
    ],
    [material("img-1"), material("img-2"), material("img-3")],
    "フライヤー.pdf",
  );

  assert.equal(result.brief.visuals.value?.src, "material:img-1");
  assert.equal(result.brief.visuals.programs?.src, "material:img-2");
  assert.equal(result.brief.visuals.closing?.src, "material:img-3");
  assert.equal(result.unused.length, 0);
});

test("同じ画像を2つのスロットには入れない", () => {
  const result = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "key-visual" })],
    [material("img-1")],
    "フライヤー.pdf",
  );

  assert.equal(result.brief.visuals.value?.src, "material:img-1");
  assert.ok(notTakenFromMaterial(result.brief.visuals.programs));
  assert.ok(notTakenFromMaterial(result.brief.visuals.closing));
});

test("確信の持てない画像は勝手に採用しない", () => {
  const result = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "key-visual", confidence: "low" })],
    [material("img-1")],
    "フライヤー.pdf",
  );

  assert.ok(notTakenFromMaterial(result.brief.visuals.value));
  assert.equal(result.placed.length, 0);
});

test("利用者が決めた写真も、消した枠も上書きしない", () => {
  const chosen = markUserEdited(
    {
      ...SEEDED,
      visuals: { ...SEEDED.visuals, value: { src: "material:mine" } },
    },
    "visuals.value",
  );
  const off = setSuppressed(chosen, "visuals.programs", true);

  const result = placeImagesIntoBrief(
    off,
    [
      reading({ ref: "img-1", role: "key-visual" }),
      reading({ ref: "img-2", role: "scene-photo" }),
    ],
    [material("img-1"), material("img-2")],
    "フライヤー.pdf",
  );

  assert.equal(result.brief.visuals.value?.src, "material:mine");
  // Suppressed, so the reading may not write here — the stock picture it was
  // seeded with stays, and `applySuppression` is what takes it off screen.
  assert.ok(notTakenFromMaterial(result.brief.visuals.programs));
  // The slots a person settled are untouched; the one still free may be filled.
  // Either way every picture is accounted for, placed or listed with a reason.
  assert.equal(result.placed.length + result.unused.length, 2);
  assert.ok(result.placed.every((entry) => entry.path === "visuals.closing"));
});

test("資料そのものや質感は、映像のスロットに入れない", () => {
  const result = placeImagesIntoBrief(
    SEEDED,
    [
      reading({ ref: "img-1", role: "document" }),
      reading({ ref: "img-2", role: "unreadable" }),
    ],
    [material("img-1"), material("img-2")],
    "フライヤー.pdf",
  );

  assert.equal(result.placed.length, 0);
  assert.equal(result.unused.length, 2);
  assert.ok(notTakenFromMaterial(result.brief.visuals.value));
});

test("ロゴには描き方ではなく、測った値を記録する", () => {
  // The pipeline READS the artwork; the theme decides how to paint it. A
  // treatment written in here is a mark painted for exactly one ground, so a
  // brief full of them cannot change art direction — which is the whole point
  // of having two. See paint.ts `treatmentOn` for the decision itself.
  const result = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "logo", visibleText: ["宮尾酒造"] })],
    [material("img-1", { luminance: 0.12 })],
    "フライヤー.pdf",
  );

  const added = result.brief.logos.at(-1);
  assert.equal(added?.src, "material:img-1");
  assert.equal(added?.name, "宮尾酒造");
  assert.equal(added?.treatment, undefined, "描き方を固めてはいけない");
  assert.equal(added?.opaque, false);
  assert.equal(added?.luminance, 0.12);

  // The same row, painted both ways. This is what recording the measurement
  // buys: one dark transparent mark, legible on ink AND on the light ground.
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, added!), "knockout");
  assert.equal(treatmentOn(STANDARD_THEME.palette.ground, added!), "light");

  // The real case: a corporate mark supplied as a JPEG, dark artwork on a white
  // plate. It is drawn as it came — plate and all — on either ground, because a
  // filter has no alpha to cut and the alternative was a blank box.
  const opaque = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-2", role: "logo", visibleText: ["レオパレス21"] })],
    [material("img-2", { luminance: 0.93, opaque: true })],
    "フライヤー.pdf",
  );
  const plate = opaque.brief.logos.at(-1);
  assert.equal(plate?.opaque, true);
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, plate!), "light");
  assert.equal(treatmentOn(STANDARD_THEME.palette.ground, plate!), "light");
});

test("測っていない透過マークは、どちらの地でも必ず読める側へ倒す", () => {
  // `null` is NOT MEASURED, not "dark". On ink every pixel goes white; on the
  // light ground every pixel goes black. Both lose the brand's colour, which is
  // the accepted cost of a mark that is legible at all.
  const unmeasured = { opaque: false, luminance: null };
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, unmeasured), "knockout");
  assert.equal(treatmentOn(STANDARD_THEME.palette.ground, unmeasured), "blackout");

  // A pale mark is the mirror case: fine on ink, lost on white. Forced to the
  // far side rather than inverted — `invert` would make two wrong tones of a
  // two-tone mark, and a silhouette is how a mark is credited on a ground it
  // cannot sit on. `invert` remains for a brief that names it.
  const pale = { opaque: false, luminance: 0.9 };
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, pale), "light");
  assert.equal(treatmentOn(STANDARD_THEME.palette.ground, pale), "blackout");

  // A treatment already recorded wins on both grounds. Existing briefs carry
  // one and no measurement, and one of them is a delivered commission.
  const recorded = { opaque: false, luminance: 0.05, treatment: "light" as const };
  assert.equal(treatmentOn(SUMI_THEME.palette.ground, recorded), "light");
});

test("判定が返らなかった画像も、消えずに理由が残る", () => {
  // Eleven images went to the model and ten came back. The eleventh must not
  // simply be absent from every list.
  const result = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "key-visual" })],
    [material("img-1"), material("img-2"), material("img-3", { sent: false, note: "画像の送信上限を超えたため送っていません" })],
    "フライヤー.pdf",
  );

  const unjudged = result.unused.find((entry) => entry.materialId === "img-2");
  assert.match(unjudged?.reason ?? "", /判定が返りません/);
  const unsent = result.unused.find((entry) => entry.materialId === "img-3");
  assert.match(unsent?.reason ?? "", /送信上限/);
  assert.equal(result.placed.length + result.unused.length, 3);
});

test("写真が入ってもナレーションは古くならない", () => {
  const result = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "key-visual" })],
    [material("img-1")],
    "フライヤー.pdf",
  );

  // A photograph changes what the film shows, not what it says.
  assert.equal(result.brief.factsUpdatedAt, SEEDED.factsUpdatedAt);
});

test("すでに入っているロゴでも、描き方が違えば直す", () => {
  // The self-healing case, and the one that repairs what shipped: a plated
  // mark stored as `knockout` renders as a blank white box, and a re-run has
  // to be able to take that back rather than refusing to look at a mark it has
  // seen before.
  const withWrongLogo: EventCmBrief = {
    ...SEEDED,
    logos: [
      ...SEEDED.logos,
      { name: "レオパレス21", src: "material:img-1", treatment: "knockout" },
    ],
  };
  const result = placeImagesIntoBrief(
    withWrongLogo,
    [reading({ ref: "img-1", role: "logo" })],
    [material("img-1", { luminance: 0.93, opaque: true })],
    "フライヤー.pdf",
  );

  // The frozen treatment is CLEARED, not corrected to another frozen value:
  // that is what hands the decision back to the theme.
  assert.equal(result.brief.logos.at(-1)?.treatment, undefined);
  assert.equal(result.brief.logos.at(-1)?.opaque, true);
  assert.equal(result.brief.logos.at(-1)?.luminance, 0.93);
  assert.match(result.placed[0]?.reason ?? "", /測り直しました/);
  // Idempotent: run it again and there is nothing left to fix.
  const again = placeImagesIntoBrief(
    result.brief,
    [reading({ ref: "img-1", role: "logo" })],
    [material("img-1", { luminance: 0.93, opaque: true })],
    "フライヤー.pdf",
  );
  assert.equal(again.placed.length, 0);
  assert.match(again.unused[0]?.reason ?? "", /すでにロゴ/);
});

test("初めて置くマークも、なぜその描き方なのかを事実どおりに記録する", () => {
  // The run log is where someone reads the rule back. It once said "透過の明るい
  // マーク" about a JPEG — artwork that cannot carry transparency at all — and
  // carried a second branch describing the plated-mark knockout that had just
  // been removed. Wording that contradicts the rule is how the rule gets
  // reintroduced.
  const plated = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "logo" })],
    [material("img-1", { luminance: 0.93, opaque: true })],
    "フライヤー.pdf",
  );
  assert.equal(plated.brief.logos.at(-1)?.opaque, true);
  assert.match(plated.placed[0]?.reason ?? "", /地の付いた画像/);

  const darkOnAlpha = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "logo" })],
    [material("img-1", { luminance: 0.1, opaque: false })],
    "フライヤー.pdf",
  );
  const mark = darkOnAlpha.brief.logos.at(-1)!;
  assert.equal(mark.opaque, false);
  assert.equal(mark.luminance, 0.1);
  assert.match(darkOnAlpha.placed[0]?.reason ?? "", /透過した暗いマーク/);
  // The log no longer names a filter, because the filter is not decided here.
  assert.doesNotMatch(darkOnAlpha.placed[0]?.reason ?? "", /白抜き/);
});

test("正規化版があるマークは、正規化版が映像に載る（原本は読み取り側に残る）", () => {
  // 承認された正規化版を無視すると、マッピングを1回まわすたびに余白だらけの原本
  // が戻り、押したボタンが取り消される（docs/asset-normalization.md §11）。
  const result = placeImagesIntoBrief(
    SEEDED,
    [reading({ ref: "img-1", role: "logo", visibleText: ["Miss SAKE"] })],
    [material("img-1", { luminance: 0.2, normalizedId: "img-1-trimmed" })],
    "フライヤー.pdf",
  );
  const added = result.brief.logos.at(-1);
  assert.equal(added?.src, "material:img-1-trimmed");
  // 判定の記録は原本に対して残る。モデルが見たのは原本なので。
  assert.equal(result.placed.at(-1)?.materialId, "img-1");
});

test("マークが2つ以上並んだら、インクの量で大きさを揃える", () => {
  // 実測の2件（labs/freehand/sake-2026/src/freehand/marks.json）。同じ高さで並べる
  // と正方形の印章が格下に見えるので、印章を大きく、横長を小さくする。
  const result = placeImagesIntoBrief(
    SEEDED,
    [
      reading({ ref: "seal", role: "logo", visibleText: ["〆張鶴"] }),
      reading({ ref: "wordmark", role: "logo", visibleText: ["レオパレス21"] }),
    ],
    [
      material("seal", { inkRatio: 0.2966, trimWidth: 246, trimHeight: 246 }),
      material("wordmark", { inkRatio: 0.3283, trimWidth: 800, trimHeight: 183 }),
    ],
    "フライヤー.pdf",
  );
  const seal = result.brief.logos.find((logo) => logo.src === "material:seal");
  const wordmark = result.brief.logos.find((logo) => logo.src === "material:wordmark");
  assert.ok(seal?.scale && wordmark?.scale, "スケールが書かれていない");
  assert.ok(
    (seal?.scale ?? 0) > (wordmark?.scale ?? 0),
    `印章 ${seal?.scale} がワードマーク ${wordmark?.scale} を上回っていない`,
  );
});

test("測っていないマークにスケールを書かない（1で上書きしない）", () => {
  const result = placeImagesIntoBrief(
    SEEDED,
    [
      reading({ ref: "unmeasured-a", role: "logo", visibleText: ["A"] }),
      reading({ ref: "unmeasured-b", role: "logo", visibleText: ["B"] }),
    ],
    [material("unmeasured-a"), material("unmeasured-b")],
    "フライヤー.pdf",
  );
  for (const logo of result.brief.logos) {
    assert.equal(logo.scale, undefined, `${logo.name} に根拠のないスケールが入っている`);
  }
});
