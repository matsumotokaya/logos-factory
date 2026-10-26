import assert from "node:assert/strict";
import test from "node:test";
import { assetById, DEFAULT_ASSETS, poolGain, poolPlayback, templateBgm } from "./defaults";
import {
  TEMPLATES,
  artDirectionIds,
  currentTemplate,
  templateDressing,
} from "@/lib/templates/catalog";

/**
 * Every (template, painting) a new video take can be dressed for. A template
 * that names no painting (product-cm renders outside the kit) still has ONE
 * dressing — its template-level defaults — and must not fall out of this list.
 */
const VIDEO_DRESSINGS = TEMPLATES.filter((entry) => entry.toolKind === "video").flatMap(
  (template) => {
    const ids = artDirectionIds(template);
    return (ids.length > 0 ? ids : [undefined]).map((artDirection) => ({
      template,
      artDirection: artDirection ?? "(none)",
      dressing: templateDressing(template, artDirection),
    }));
  },
);

test("動画テンプレートはどのアートディレクションでも既定BGMを宣言している", () => {
  // 「新規作成時には一律で自動で入る」ので、未宣言の組があるとその塗りの動画
  // だけ無音で始まる。塗りごとに宣言する形になった（catalog.ts `artDirections`）
  // ので、テンプレート1つにつき1回ではなく塗りの数だけ確かめる。
  assert.ok(VIDEO_DRESSINGS.length > 0);
  for (const { template, artDirection, dressing } of VIDEO_DRESSINGS) {
    assert.ok(dressing.bgm, `${template.id}/${artDirection} が既定BGMを持たない`);
  }
});

test("宣言されたIDはプールに実在し、BGMである", () => {
  // 台帳とプールは別ファイルなので、曲を差し替えるときにIDだけ残る事故が起きる。
  for (const { template, artDirection, dressing } of VIDEO_DRESSINGS) {
    if (!dressing.bgm) continue;
    const asset = assetById(dressing.bgm);
    assert.ok(asset, `${template.id}/${artDirection} の既定BGM ${dressing.bgm} がプールに無い`);
    assert.equal(asset?.kind, "bgm", `${template.id}/${artDirection} の既定BGMがBGMでない`);
  }
});

test("宣言された既定画像もプールに実在する", () => {
  // 実体の無いIDを指した瞬間に Remotion はレンダーを止める（正しい挙動）。だから
  // 止まる前にここで落とす。
  for (const { template, artDirection, dressing } of VIDEO_DRESSINGS) {
    for (const [path, id] of Object.entries(dressing.visuals)) {
      assert.ok(assetById(id), `${template.id}/${artDirection} の ${path} = ${id} がプールに無い`);
    }
  }
});

test("同じテンプレート・同じ塗りなら誰が作っても同じ曲になる", () => {
  // 以前は業種由来の tone で選んでいたので、同じテンプレートの2本が
  // 誰も選んでいない理由で違う曲で始まり得た。
  const eventCm = currentTemplate("event-cm");
  assert.ok(eventCm);
  const first = templateBgm(templateDressing(eventCm).bgm);
  const again = templateBgm(templateDressing(eventCm).bgm);
  assert.ok(first);
  assert.equal(first?.src, again?.src);
});

test("塗りが違えば曲も違ってよい（利用者が選んだ理由がある）", () => {
  // 業種で曲が変わるのは誰も選んでいない差だが、アートディレクションは利用者が
  // ダイアログで選ぶ。和モダンに墨の曲、スタンダードに明るい曲は、その選択に
  // 従っている。
  const eventCm = currentTemplate("event-cm");
  assert.ok(eventCm);
  const sumi = templateDressing(eventCm, "sumi").bgm;
  const standard = templateDressing(eventCm, "standard").bgm;
  assert.ok(sumi && standard);
  assert.notEqual(sumi, standard);
});

test("曲は塗りが持つ（標準は shine-through-tokyo で始まる）", () => {
  // 守っているのは仕組み: 塗りごとに宣言があり、片方を変えても他方は動かない。
  // 標準の塗りが `shine-through-tokyo` で始まるのは 2026-08-30 の依頼主判断。
  const standard = templateDressing(currentTemplate("event-cm")!, "standard").bgm;
  assert.equal(standard, "bgm-shine-through-tokyo");
  // 塗りを選べば、同じテンプレートでも別の曲になる。
  assert.notEqual(
    templateDressing(currentTemplate("event-cm")!, "sumi").bgm,
    standard,
    "塗りごとに宣言する意味が無い",
  );
});

test("宣言が無い・プールが失った場合は無音（別の曲で埋めない）", () => {
  assert.equal(templateBgm(undefined), null);
  assert.equal(templateBgm("bgm-does-not-exist"), null);
  // BGM以外のIDを既定BGMに書いても通さない。
  const notBgm = DEFAULT_ASSETS.find((asset) => asset.kind !== "bgm");
  if (notBgm) assert.equal(templateBgm(notBgm.id), null);
});

test("テンプレートが知らない塗りには何も着せない", () => {
  // 宣言していないIDに墨の茶室を着せると、間違った塗りの写真が出る。設計代替の
  // 地に立つ方が正しい（素材ゼロでも完成品が出る、という前提そのもの）。
  const eventCm = currentTemplate("event-cm");
  assert.ok(eventCm);
  const unknown = templateDressing(eventCm, "not-a-painting");
  assert.equal(unknown.bgm, undefined);
  assert.deepEqual(unknown.visuals, {});
});

test("既定BGMは公開できるものだけ（書き出しで無音にならない）", () => {
  // licensed:false の除外はレンダー側が未実装なので、既定に据えると
  // 清算されていない曲がそのままMP4に焼かれる。
  for (const { template, artDirection, dressing } of VIDEO_DRESSINGS) {
    if (!dressing.bgm) continue;
    assert.equal(
      assetById(dressing.bgm)?.licensed,
      true,
      `${template.id}/${artDirection} の既定BGMが清算されていない`,
    );
  }
});

const POOL_BGM = DEFAULT_ASSETS.filter((asset) => asset.kind === "bgm");

test("長さの分かっている既定BGMは、明示的にループする", () => {
  // Remotion's own `loop` disagrees across the two surfaces: the CLI renderer
  // loops and the browser Player does not. A 40-second track under a 51-second
  // film therefore played to the end in the MP4 and fell silent on screen
  // (measured 2026-08-26). The composition wraps anything with a measured
  // length in `<Loop>`, and `poolPlayback` is what tells it the length —
  // so a pool track that measures its duration must get a loop out of it.
  for (const asset of POOL_BGM) {
    if (!asset.durationSec) continue;
    assert.ok(
      poolPlayback(asset.src).loopSec > 0,
      `${asset.id}: 長さを測っているのにループ長が出ていない`,
    );
  }
});

test("既定BGMは頭から鳴らす（編曲を編集で直さない）", () => {
  // bright-corporate carried `startFromSec: 14` for four days, because its
  // first 14 seconds measure 7–9 dB under its body. That is its build-in, not
  // a fault — and skipping it moved the loop's restart to 0:14, so the film
  // opened mid-phrase and cut back mid-phrase twice (owner, 2026-08-30:
  // 「突然途中でブツッと切れてループが始まる」).
  //
  // The field survives for a genuinely dead head — silence, a count-in — which
  // is a different thing from a quiet opening. If a pool track ever needs one
  // again, listen to the loop before deciding it is right.
  for (const asset of POOL_BGM) {
    assert.equal(
      poolPlayback(asset.src).startFromSec,
      0,
      `${asset.id}: 頭を飛ばしている。編曲ではなく無音の頭か確かめること`,
    );
  }
});

test("音量は1.0を超えない（プレビューと書き出しが一致する範囲）", () => {
  // Remotion documents `volume` as 0–1. Above it the browser preview and the
  // encoder are outside the contract and free to disagree, and a level tuned by
  // ear in the preview then arrives in the MP4 as something else — which is
  // exactly what happened on 2026-08-30 (「MP4に書き出した瞬間めちゃくちゃ
  // 大きな音になってしまいました」).
  //
  // Loudness a track cannot reach inside 1.0 belongs to the file. Remaster it;
  // do not ask the player for gain it is not specified to give.
  for (const asset of DEFAULT_ASSETS) {
    assert.ok(
      poolGain(asset.src) <= 1,
      `${asset.id}: 実効ゲインが1.0を超えている（${poolGain(asset.src).toFixed(3)}）`,
    );
  }
});
