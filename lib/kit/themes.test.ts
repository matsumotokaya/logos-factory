import assert from "node:assert/strict";
import test from "node:test";
import {
  captionSafeBottom,
  LEGACY_THEME_ID,
  NEW_FILM_THEME_ID,
  LUXURY_THEME,
  STANDARD_THEME,
  SUMI_THEME,
  THEMES,
  themeById,
} from "@/remotion/kit/theme";
import { groundIsDark, markPainting } from "@/remotion/kit/mark";
import {
  TEMPLATES,
  artDirectionIds,
  defaultArtDirection,
} from "@/lib/templates/catalog";
import { DEFAULT_ASSETS, unlicensedDefaults } from "@/lib/assets/defaults";

test("未設定のアートディレクションは墨に落ちる", () => {
  // Every take that exists predates `brief.artDirection`, and one of them is a
  // delivered commission. Resolving "unset" to the new default would repaint
  // an approved film, so this must never become STANDARD_THEME.
  assert.equal(LEGACY_THEME_ID, SUMI_THEME.id);
  assert.equal(themeById(undefined).id, SUMI_THEME.id);
  assert.equal(themeById(null).id, SUMI_THEME.id);
  assert.equal(themeById("").id, SUMI_THEME.id);
});

test("知らないIDは落ちずに墨へ倒す", () => {
  // The id comes from a database row a newer build may have written. A film in
  // the wrong art direction is recoverable; one that refuses to render is not.
  assert.equal(themeById("themes-not-in-this-build").id, SUMI_THEME.id);
});

test("新規の動画はスタンダードで始まる", () => {
  // 墨 is the derivative: it came first only because the first commission was
  // a 和モダン event.
  assert.equal(NEW_FILM_THEME_ID, STANDARD_THEME.id);
  assert.notEqual(NEW_FILM_THEME_ID, LEGACY_THEME_ID);
});

test("字幕を帯に置くテーマはレターボックスを持つ", () => {
  // `backdrop: "bar"` means the subtitle sits inside chrome. Without bars there
  // is no chrome, and captionSafeBottom would reserve 40px for a band drawn at
  // the frame edge.
  for (const theme of Object.values(THEMES)) {
    if (theme.caption.backdrop === "bar") {
      assert.ok(
        theme.chrome.letterbox,
        `${theme.id}: 帯に字幕を置くならレターボックスが要る`,
      );
    }
  }
});

test("どのテーマも素材ゼロの地を持っている", () => {
  // "素材ゼロでも完成した動画が出る" is a requirement of this template, and with
  // no photograph the ground is all there is. 墨 satisfies it with
  // EventBackground (motion.background), a flat theme needs a wash.
  for (const theme of Object.values(THEMES)) {
    const hasAtmosphere =
      theme.motion.background !== "still" || theme.palette.groundWash !== null;
    assert.ok(hasAtmosphere, `${theme.id}: 素材が無いとき地が平坦になる`);
  }
});

test("墨の承認済みジオメトリは動かない", () => {
  // The three baked takes were approved at these numbers. If a change to the
  // caption or chrome vocabulary moves them, it changed a delivered film.
  assert.equal(SUMI_THEME.chrome.letterbox, 132);
  assert.equal(captionSafeBottom(SUMI_THEME), 172);
  // What KitComponent's panel names clear: max(letterbox + 64, safe bottom).
  assert.equal(
    Math.max((SUMI_THEME.chrome.letterbox ?? 0) + 64, captionSafeBottom(SUMI_THEME)),
    196,
    "登壇者名の下余白は196pxのまま",
  );
});

test("スタンダードは字幕プレートを避ける余白を持つ", () => {
  assert.equal(STANDARD_THEME.chrome.letterbox, null);
  assert.equal(STANDARD_THEME.caption.backdrop, "plate");
  const safe = captionSafeBottom(STANDARD_THEME);
  // The bug this locks: the name used to sit at letterbox+64 = 64px, under a
  // plate reaching ~211px, so it was drawn through the subtitle.
  assert.ok(safe > 64, "プレートは64pxより高く積む");
  assert.equal(Math.max((STANDARD_THEME.chrome.letterbox ?? 0) + 64, safe), safe);
});

test("スタンダードは明るい地に濃い文字、墨はその逆", () => {
  // Not a cosmetic assertion: the directional scrim's tint has to match the
  // direction the type needs. A darkening scrim under dark type is unreadable.
  assert.deepEqual(SUMI_THEME.backdrop.directional?.tint, [8, 6, 4]);
  assert.deepEqual(STANDARD_THEME.backdrop.directional?.tint, [247, 249, 252]);
});

test("数字と音の様式はテーマが持ち、墨は和、スタンダードは企業", () => {
  // Both used to be the template's: 一二三 in a seal box and 拍子木・和太鼓 for
  // every film, which on a corporate webinar are a costume. The theme names
  // the register and the scene / cue sheet read it.
  assert.equal(SUMI_THEME.ornament.numerals, "kanji-seal");
  assert.equal(STANDARD_THEME.ornament.numerals, "arabic");
  assert.equal(SUMI_THEME.sound.cues, "wa");
  assert.equal(STANDARD_THEME.sound.cues, "corporate");
});

test("ラグジュアリーは墨の色替えではない", () => {
  // The Freehand Lab's acceptance test for this painting: set beside 墨, it
  // must not read as the same template recoloured. Each of these is a choice
  // 墨 made the other way.
  assert.notEqual(LUXURY_THEME.palette.ground, SUMI_THEME.palette.ground);
  assert.notEqual(LUXURY_THEME.palette.accent, SUMI_THEME.palette.accent);
  assert.notEqual(LUXURY_THEME.displayFont, SUMI_THEME.displayFont);
  assert.equal(LUXURY_THEME.ornament.numerals, "roman-ring");
  assert.equal(LUXURY_THEME.motion.background, "bokeh");
  assert.equal(LUXURY_THEME.sound.cues, "luxe");
  // Latin first, so the micro-labels and numerals are set in the serif and the
  // Japanese falls through to the mincho.
  assert.match(LUXURY_THEME.displayFont, /^"Cormorant Garamond", "Zen Old Mincho"/);
});

test("テンプレートが宣言するアートディレクションは全部存在し、先頭は既定レンダーと一致する", () => {
  // The add dialog offers what the catalog declares (catalog.ts
  // `artDirections`), so an id with no theme behind it would let a user order
  // a painting nobody can paint — and `themeById` would quietly hand them 墨.
  // The first entry is what a take gets when nobody chooses; the render row is
  // written from `defaultRenders`, so the two must name the same painting.
  // Only templates painted by the kit name a theme; product-cm's renderer has
  // its own palette and declares none (`theme: ""`), which is not a gap here.
  for (const template of TEMPLATES.filter((entry) => entry.toolKind === "video")) {
    const ids = artDirectionIds(template);
    for (const id of ids) {
      assert.ok(id in THEMES, `${template.id}: アートディレクション ${id} のテーマが無い`);
    }
    if (template.artDirections) {
      assert.ok(ids.length > 0, `${template.id}: 塗りを1つも宣言していない`);
      assert.equal(
        defaultArtDirection(template),
        template.defaultRenders[0]?.theme,
        `${template.id}: 先頭の塗りと defaultRenders の theme が食い違う`,
      );
    }
  }
  // The one template that chooses its painting today.
  const eventCm = TEMPLATES.find((entry) => entry.id === "event-cm");
  assert.deepEqual(eventCm && artDirectionIds(eventCm), [
    STANDARD_THEME.id,
    SUMI_THEME.id,
    LUXURY_THEME.id,
  ]);
});

test("組版はアートディレクションごとに違う", () => {
  // Gothic carries more ink per character than mincho, so the same size reads
  // heavier. Sharing a scale between the two would make one of them wrong.
  assert.notEqual(STANDARD_THEME.displayFont, SUMI_THEME.displayFont);
  assert.ok(STANDARD_THEME.scale.hero.size < SUMI_THEME.scale.hero.size);
});

// ---------------------------------------------------------------------------
// 地と同じ色のものを描かない
//
// The recurring defect in this repository is not a wrong filter — it is
// drawing something the same colour as what is behind it. It has now happened
// to a white mark on the standard ground, to a white rectangle in the closing
// credits, and to a near-black SVG on ink. These lock the rule that prevents
// the whole class, on both grounds, so a third art direction inherits it.

/** Every ground the product can paint on. */
const GROUNDS = Object.values(THEMES).map((theme) => ({
  id: theme.id,
  ground: theme.palette.ground,
  dark: groundIsDark(theme.palette.ground),
}));

test("測った透過ロゴは、どちらの地でも地の反対側に出る", () => {
  for (const { id, ground, dark } of GROUNDS) {
    for (const luminance of [0, 0.003, 0.2, 0.8, 1]) {
      const painting = markPainting(ground, { opaque: false, luminance });
      assert.equal(painting.draw, "artwork", `${id}: 透過ロゴが描かれていない`);
      if (painting.draw !== "artwork") continue;
      // Where the mark ends up, given the filter that was chosen.
      const painted =
        painting.treatment === "knockout"
          ? 1
          : painting.treatment === "blackout"
            ? 0
            : painting.treatment === "invert"
              ? 1 - luminance
              : luminance;
      assert.notEqual(
        painted >= 0.45,
        !dark,
        `${id}: 輝度${luminance}のロゴが地と同じ側に描かれる`,
      );
    }
  }
});

test("測っていないロゴは、素のままでは描かれない", () => {
  // `opaque ?? true` used to answer "not measured" with "opaque", which routed
  // it to `light` — drawn as supplied. That is how a 0.003 SVG landed unchanged
  // on ink and vanished, with the measurement sitting in brand_materials all
  // along. Unmeasured must reach the treatment that cannot fail.
  for (const { id, ground, dark } of GROUNDS) {
    for (const mark of [{}, { opaque: null }, { luminance: null }, { opaque: null, luminance: null }]) {
      const painting = markPainting(ground, mark);
      assert.equal(painting.draw, "artwork", `${id}: 未測定ロゴが描かれない`);
      if (painting.draw !== "artwork") continue;
      assert.equal(
        painting.treatment,
        dark ? "knockout" : "blackout",
        `${id}: 未測定ロゴが ${painting.treatment} で描かれている`,
      );
    }
  }
});

test("地と同じ明度の不透明ロゴは描かず、名前で出す", () => {
  // No filter can save this one: `knockout` paints the plate white and
  // `blackout` paints it black, so either way it is a rectangle. A rectangle is
  // a different defect, not a fix — the credit line is legible on any ground.
  const onInk = markPainting(SUMI_THEME.palette.ground, { opaque: true, luminance: 0.02 });
  assert.equal(onInk.draw, "credit");

  const onWhite = markPainting(STANDARD_THEME.palette.ground, {
    opaque: true,
    luminance: 0.98,
  });
  assert.equal(onWhite.draw, "credit");

  // The same artwork on the OTHER ground is fine as supplied, plate and all.
  const contrasting = markPainting(STANDARD_THEME.palette.ground, {
    opaque: true,
    luminance: 0.02,
  });
  assert.deepEqual(
    contrasting.draw === "artwork" ? contrasting.treatment : null,
    "light",
  );
});

test("記録された描き方は、証明できる衝突のときだけ上書きされる", () => {
  // Rule 1 exists to protect a delivered commission: its briefs carry a
  // treatment and no measurement, so nothing can be proven and nothing moves.
  const approved = markPainting(SUMI_THEME.palette.ground, { treatment: "light" });
  assert.deepEqual(
    approved.draw === "artwork" ? approved.treatment : null,
    "light",
    "測定が無いのに、記録された描き方を上書きしている",
  );

  // With a measurement, "light" on ink for a near-black transparent mark is
  // provably invisible — and a record is not a reason to draw nothing.
  const provable = markPainting(SUMI_THEME.palette.ground, {
    treatment: "light",
    opaque: false,
    luminance: 0.003,
  });
  assert.deepEqual(
    provable.draw === "artwork" ? provable.treatment : null,
    "knockout",
  );
});

test("どのテーマも組版の言語を宣言する", () => {
  // `word-break: auto-phrase` is inert without a language, and inert silently.
  // That silence is what made the effect look impossible in Remotion, so the
  // language is a required field rather than an optional one — a new art
  // direction cannot ship without answering it.
  for (const theme of Object.values(THEMES)) {
    assert.ok(
      typeof theme.lang === "string" && theme.lang.length > 0,
      `${theme.id}: 組版の言語が宣言されていない`,
    );
  }
});

test("エンドカードの動画は、地の色で洗ってから使う", () => {
  // The mark's treatment is derived from `palette.ground` (remotion/kit/mark.ts),
  // so footage drawn at full presence makes that derivation a lie — a knocked-out
  // white mark on a bright sky, or a near-black one on a dark one. The approved
  // 和モダン film washes 0.58 of ink over its Fuji clip before the mark goes
  // down; every art direction has to wash in ITS OWN ground for the same reason,
  // and in the same direction.
  for (const theme of Object.values(THEMES)) {
    if (!theme.endCard) continue;
    assert.ok(theme.endCard.video.length > 0, `${theme.id}: 動画のパスが空`);
    const wash = theme.endCard.wash;
    const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(wash);
    assert.ok(rgb, `${theme.id}: wash は rgba() で書く（${wash}）`);
    if (!rgb) continue;
    const [, r, g, b, a] = rgb;
    const washLuma = (Number(r) * 0.299 + Number(g) * 0.587 + Number(b) * 0.114) / 255;
    assert.equal(
      washLuma >= 0.5,
      !groundIsDark(theme.palette.ground),
      `${theme.id}: 地と逆の色で洗っている（マークが消える）`,
    );
    // Enough of it to actually decide the ground: the approved film uses 0.58.
    assert.ok(
      Number(a) >= 0.5,
      `${theme.id}: wash が薄すぎて、地の色がマークの描き方を決められない（${a}）`,
    );
  }
});

test("承認済みの墨のエンドカードは、ラボの数字のまま", () => {
  // Carried from labs/freehand/sake-2026/src/freehand/scenes.tsx, which is the
  // film the client approved across three rounds. If these move, a delivered
  // film changed.
  assert.equal(SUMI_THEME.endCard?.grade, "saturate(0.85) brightness(0.85)");
  assert.equal(SUMI_THEME.endCard?.wash, "rgba(8,6,4,0.58)");
});

test("清算されていない既定素材は、レンダーから外れる経路を持つ", () => {
  // `unlicensedDefaults` had no caller until the first asset needed it. If this
  // ever returns nothing for an unlicensed entry, the promise the BGM dialog
  // makes (「書き出したMP4では無音になります」) is not kept by anything.
  const unlicensed = DEFAULT_ASSETS.filter((asset) => !asset.licensed);
  for (const asset of unlicensed) {
    assert.deepEqual(
      unlicensedDefaults([asset.src]).map((entry) => entry.id),
      [asset.id],
      `${asset.id}: 除外の対象として引けない`,
    );
  }
  // And a cleared asset must never be excluded.
  const cleared = DEFAULT_ASSETS.filter((asset) => asset.licensed).map((a) => a.src);
  assert.deepEqual(unlicensedDefaults(cleared), []);
});
