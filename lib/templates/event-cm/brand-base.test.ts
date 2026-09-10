import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_BASE_PATH, brandBaseIsOff, setSuppressed } from "./facts";
import { seedEventCmBrief } from "./seed";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { themeById } from "@/remotion/kit/theme";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const BRANDED = seedEventCmBrief(
  {
    name: "WealthPark Lab",
    industry: "金融教育メディア",
    palette: { accent: "#c8a15a", primary: "#101010" },
    headingFont: "Shippori Mincho",
    logo: {
      src: "material:11111111-1111-4111-8111-111111111111",
      opaque: false,
      luminance: 0.003,
    },
  },
  { now: new Date("2026-08-17T09:00:00+09:00"), seed: "take-1" },
);

/** A collaboration: our mark first, the partner's behind it. */
const WITH_PARTNER: EventCmBrief = {
  ...BRANDED,
  logos: [
    ...BRANDED.logos,
    { name: "leopalace21", src: "material:22222222-2222-4222-8222-222222222222" },
  ],
};

const off = (brief: EventCmBrief) => setSuppressed(brief, BRAND_BASE_PATH, true);

test("基盤オフは記録される（ポインタを外すだけにしない）", () => {
  // オフが値を消すだけだと、次の実行が勝手に戻してしまう。
  // 「基盤は必ず入る」と「オフにできる」の衝突は、読み上げのオフと同じ形。
  assert.equal(brandBaseIsOff(BRANDED), false);
  assert.equal(brandBaseIsOff(off(BRANDED)), true);
});

test("オフにするとブランドの配色・書体が外れ、テンプレートの地に戻る", () => {
  const on = eventCmFilm(BRANDED);
  assert.equal(on.theme.palette.accent, "#c8a15a", "ブランドの金が乗っていない");

  const collab = eventCmFilm(off(BRANDED));
  // The accent returns to whatever art direction the brief names — not to 墨
  // by definition. This assertion used to hardcode SUMI's gold, which was the
  // same thing only while one art direction existed.
  assert.equal(
    collab.theme.palette.accent,
    themeById(BRANDED.artDirection).palette.accent,
  );
  assert.equal(collab.drawn.theme, undefined, "空のテーマではなく未指定にする");
});

test("オフにすると自社のマークが外れ、相手のマークが残る", () => {
  const collab = eventCmFilm(off(WITH_PARTNER));
  assert.deepEqual(
    collab.drawn.logos.map((logo) => logo.name),
    ["leopalace21"],
    "自社のマークが残っている、または相手のマークまで消えている",
  );
});

test("オフにしても事実は消えない（誰が主催かは見た目ではない）", () => {
  const collab = eventCmFilm(off(BRANDED));
  assert.equal(collab.drawn.presenter, BRANDED.presenter);
  assert.equal(collab.drawn.title, BRANDED.title);
  assert.equal(collab.drawn.schedule.date, BRANDED.schedule.date);
  // 音楽はテンプレートのものなので、ブランドを外しても鳴り続ける。
  assert.equal(collab.drawn.bgm, BRANDED.bgm);
});

test("オフにしても映像は成立する（無音の穴を作らない）", () => {
  // マークが1つも無いとき、冒頭・末尾は明朝のクレジットで成立する。
  const collab = eventCmFilm(off(BRANDED));
  assert.ok(collab.scenes.length > 0);
  assert.ok(collab.totalMs > 0);
  assert.deepEqual(collab.drawn.logos, []);
});

test("戻せる（保存された値は消えていない）", () => {
  const back = setSuppressed(off(BRANDED), BRAND_BASE_PATH, false);
  assert.equal(brandBaseIsOff(back), false);
  assert.deepEqual(eventCmFilm(back).drawn.logos, BRANDED.logos);
  assert.equal(eventCmFilm(back).theme.palette.accent, "#c8a15a");
});

test("基盤のオフはナレーションを古くしない（読み上げないものだから）", () => {
  // 何も壊れていないのに警告が出る状態は、警告を無視する習慣を作る。
  assert.equal(off(BRANDED).factsUpdatedAt, BRANDED.factsUpdatedAt);
});
