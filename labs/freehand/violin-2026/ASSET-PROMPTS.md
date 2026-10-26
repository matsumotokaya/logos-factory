# violin-2026 生成素材のプロンプト

[FINDINGS.md](FINDINGS.md) のショットリストにある生成素材 **A1〜A4 / B1〜B4 / C1〜C3** の11本、モデレーターのダミー **D1**、任意の追加 **E1〜E5**。使い方は「Midjourney のプロンプトをそのまま貼って画像を作り、その画像を image-to-video に渡して動かす」。動画ツールは未定なので、動きの指示は Runway / Kling / Luma / Veo のどれでも読める自然文にしてある。

プロンプトは**情景の描写だけ**で書く。パラメータも否定形の列挙も書かない。アスペクト比は Midjourney 側の設定で持つ。形容詞と技術語を積むほど出力が汚れるので、必要なこと(何が・どこに・どんな光で)だけを短く言う。**コードブロックは1つで完結している**。そのまま貼れる。

事実は [props.json](props.json) の範囲を出ない。会場は未定なので実在のホールを名指ししない。楽器は「アンティークのイタリア製・深い琥珀のニス」までで、実在の名器名を書かない(書くと嘘の写真になる)。

## スタイルバイブル

夜のホールの黒。地は黒だがボルドーを含み、ベルベットの毛並みだけがシャンパンゴールドの淡い艶を返す。光源は暖色が1つだけで、必ず画面の外の高いところから来る。主題以外は溶ける。金は真鍮の黄色ではなく `#d6bc7a` の淡いシャンパン。画面全体が暗く、明るいのは2〜3割だけ。この方針はプロンプトの中では「an old violin with deep amber varnish」「dark red velvet」「lit by one warm light from above right」「the left third of the frame dark」のような**情景の言葉**として出る。色見本や質感の語彙を末尾に並べない。

## 全素材に共通の制約

1. **16:9**。プロンプトには書かず Midjourney 側の設定で持つ。書き出しは静止画が Upscale で2560px以上、動画は1080p目標(闇の多い画なら832×464でも1080pに耐えた実績がある: sake v7)
2. **上下11%は帯で隠れる**。レターボックスの帯(120px)が乗るので、主題も暗部も中央78%の中で成立させる。四隅も使わない(静止画には最大1.12倍の寄りが掛かる)
3. **文字・ロゴ・透かし・看板・字幕を入れない**。プロンプトで禁止せず、出たものを不採用にする
4. **顔を入れない**。登壇者3名は実写があるので、生成に人が写ると嘘になる。手・後ろ姿・シルエットは可。目や耳が一部でも入ったら不採用。プロンプトでは `nobody in the frame` `only the hands` のように情景として言う
5. **片側に暗部を残す**。文字がそこに乗る。側はスロットごとに指定してある。`the left third of the frame dark` の類は情景の一部なので削らない
6. **実在の名器を名指ししない**。`Stradivarius` `Guarneri` と書かない
7. **西洋の宮殿にしない**。日本のイベントなのでホールは現代的な木とブラスでよい。金箔・大理石の柱・バロックのシャンデリアは出さない
8. **楽器の形を検品する**。弦4本・ペグ4本・f字孔が左右対称・駒が f字孔の切れ込みの高さ。寄るほど厳しく見る。崩れると弦楽器を知っている人に一目で分かる
9. **音は使わない**。Veo のように音が付くものはオフにする(BGM・ナレーション・効果音は設計済み)
10. **カメラは止める**。寄り引きはこちらの層が掛ける。素材側でも動くと二重になって酔う(sake v7)。ツールにカメラ制御があれば `static` / `locked` を選ぶ
11. **ループを前提にしない**。クリップは1回だけ再生し、尺が切れる前にカットが来る。「始まって終わる出来事」ではなく「ずっと続いている状態」を頼む
12. **渡すのは無加工の元ファイル**。トリミング・色調整・尺の切り詰めはこちらの層でやる。二重に掛かると戻せない

## 尺と文字の側(一覧)

尺はナレーション(505字・7字/秒)+シーン間0.9秒から出した目安。実寸は書き出しで決まる。

| ID | シーン | 尺 | 文字の側 | 暗部 |
| - | - | - | - | - |
| A1 | `logoIn` 全尺 | 4.0秒 | 中央(マーク) | 中央40% |
| A2 | `title` shot2 | 4.1秒 | 左 | 左1/3 |
| A3 | `value` shot1 | 6.0秒 | 右 | 右1/3 |
| A4 | `value` shot2 | 5.9秒 | 右 | 右1/3 |
| B1 | `program#0` 全尺 | 11.9秒 | 左(右にインセット) | 左1/3 |
| B2 | `program#1` shot1 | 5.6秒 | 左 | 左1/3 |
| B3 | `program#1` shot2 | 5.6秒 | 左 | 左1/3 |
| B4 | `program#2` 全尺 | 11.0秒 | 右(左にインセット) | 右1/3 |
| C1 | `cta` shot1 | 6.1秒 | 中央下 | 下1/3 |
| C2 | `cta` shot2 | 6.1秒 | 中央下 | 下1/3 |
| C3 | `logoOut` 全尺 | 4.0秒 | 中央(マーク) | 中央40% |

**動画は尺+1秒以上を作る**(18フレームのディゾルブが重なる)。B1 と B4 は11秒を1本で持たせるので、**静止画で作って Ken Burns を掛けるのを基本**にする。動画にするなら13秒以上。

## A0 title-key-visual(2026-09-11 追加 → **2026-09-15 生成せず、公式キービジュアル `violin_001.jpg` を採用**。以下のプロンプトは使わなかった記録)

- 地: `title` の1ショット目。**実写の名器写真(ショーケース越し・昼光)を置き換える**——依頼者の指示で、この位置は「ヴァイオリンの定番のキービジュアル」にする
- 尺: 3.3〜4秒。動画なら5秒以上
- 文字: **左**。タイトルが左半分に立つので、**楽器は右半分、左1/3は暗部**
- 置き場所: `public/assets/photo/a0-title-key-visual.jpg` / `public/assets/video/a0-title-key-visual.mp4`
- 届くまでの代役: `a2-strings-macro` の動画(f字孔に光が走る)

### Midjourney

```
An old violin with deep amber varnish lying on dark red velvet, seen from slightly above, the whole instrument in the right half of the frame. One warm light from above right catches the curve of its body. The left half of the frame is dark.
```

### 動き(image-to-video)

```
The warm light slowly passes across the varnish and the reflection travels along the body. Nothing else moves. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

楽器が右半分に収まっていない、左1/3に明るいものがある、弦が4本でない、弓や手が写っているものは不採用。

## A1 opening-curtain

- 地: `logoIn`。WealthPark Lab のマークが中央に立つ
- 尺: 4.0秒(全尺)。動画は5秒以上
- 文字: 中央にマーク。**中央40%を暗部に**。金のボケは左右と上だけに置く
- 置き場所: `public/assets/video/a1-opening-curtain.mp4`(静止画は `public/assets/photo/a1-opening-curtain.jpg`)

### Midjourney

```
A heavy dark red velvet stage curtain in deep folds, seen very close, the fabric almost black. One warm light from above left catches a thin gold sheen on one fold at the far left and one at the far right. Large soft golden bokeh floats in the top corners and the middle of the frame stays dark and empty.
```

### 動き(image-to-video)

```
The velvet breathes in a slow draught and the folds shift by a millimetre. The golden bokeh drifts upward and pulses faintly, and dust floats through the warm light. Nothing else moves and the centre of the frame stays dark. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

中央が明るい、ボケが中央に来ている、房飾りや金モールが付いている(宮殿になる)ものは不採用。中央40%が他より1段以上暗いことを確認する。

## A2 strings-macro

- 地: `title` の2ショット目(1ショット目は実写 `violin-hero_1440w.jpg`)
- 尺: 4.1秒。動画は5秒以上
- 文字: 左。タイトルは shot1 から通しで左半分に立つので、**左1/3は両ショットとも暗部**
- 置き場所: `public/assets/video/a2-strings-macro.mp4` / `public/assets/photo/a2-strings-macro.jpg`

実写の shot1 はガラスケースの中の楽器で、背景が青緑のボケ。**A2 の背景の遠くにも青緑のボケを残す**と、カットしたときに同じ場所の別カットとして繋がる。実写側はこちらの層で彩度を落として寄せる(暫定 `saturate(0.72) brightness(0.88)`、書き出しで測って直す)。

### Midjourney(案1・駒と弦)

```
Close-up of the bridge and the four strings of an old Italian violin with deep amber varnish, the bridge sharp on the right and the strings blurring away to the left, one f-hole soft behind them. Lit by one warm light from above right, a faint blue-green glow far in the background, the left third of the frame dark.
```

### Midjourney(案2・f字孔とニス)

```
Close-up of one f-hole and the amber varnish of an old Italian violin, the carved opening sharp on the right, the wood grain and the worn edge visible, the body curving away into darkness on the left. Lit by one warm light from above right, a faint blue-green glow far in the background, the left third of the frame dark.
```

### 動き(image-to-video)

```
The four strings vibrate in a fine blur, as if the violin has just been sounded, and the vibration fades slowly without ever stopping. Dust drifts through the warm light. No bow, no hand and nobody enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

弦が4本でない、駒の位置が f字孔の切れ込みからずれている、弓や手が写り込んだものは不採用。左1/3で何か起きているものも不採用(タイトルが読めない)。

## A3 hall-chandelier

- 地: `value` の1ショット目
- 尺: 6.0秒。動画は7秒以上
- 文字: 右。3行のコピーが右半分に乗るので**右1/3を暗部**。シャンデリアは中央より左
- 置き場所: `public/assets/video/a3-hall-chandelier.mp4` / `public/assets/photo/a3-hall-chandelier.jpg`

### Midjourney

```
Looking up at the ceiling of a modern concert hall before anyone arrives, a chandelier of thin brass rods and small warm lamps hanging left of centre, pale wood acoustic panels curving around it. The house lights are down, so only the lamps and their reflections in the panels glow, and nobody is there. Lit by one warm light from above left, small warm lamps far out of focus in the background, the right third of the frame dark.
```

### 動き(image-to-video)

```
The small lamps of the chandelier flicker very faintly, as if a dimmer somewhere else in the building were being brought up, and their reflections in the wood panels rise and fall with them. Dust drifts slowly through the light while the chandelier itself hangs still. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

クリスタルが垂れ下がったバロック様式、金箔の天井、大理石の柱が出たら不採用(日本の現代ホールにする)。右1/3に明るい要素が残るものも不採用。

## A4 scroll-macro

- 地: `value` の2ショット目
- 尺: 5.9秒。動画は7秒以上
- 文字: 右(A3 から通し)。渦巻きは左半分、**右1/3は暗部**
- 置き場所: `public/assets/video/a4-scroll-macro.mp4` / `public/assets/photo/a4-scroll-macro.jpg`

### Midjourney

```
Close-up of the carved scroll and pegbox of an old Italian violin with deep amber varnish, the spiral sharp in the left half of the frame and turned three quarters toward the camera, the four ebony pegs blurring behind it, the instrument resting on dark red velvet. Lit by one warm light from above left, small warm lamps far out of focus in the background, the right third of the frame dark.
```

### 動き(image-to-video)

```
The violin does not move. Only the light changes: the highlight on the scroll travels a hair's width, dust drifts through the beam, and the lamps in the background pulse faintly. Nobody and nothing enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

渦巻きの巻きが2重未満、ペグが4本でない、ペグ箱に弦が通っていないものは不採用。ニスが赤すぎて塗装に見えるもの(琥珀の下に木目が見えること)も不採用。

## B1 stage-spotlight

- 地: `program#0`。右に実写のインセット(`terashita_1044w.jpg`・金のヘアライン枠)が乗る
- 尺: 11.9秒(全尺)。**静止画を推奨**(こちらで Ken Burns)。動画にするなら13秒以上
- 文字: 左。見出しとローマ数字 `I` が左に立つので**左1/3を暗部**。光の柱は中央
- 置き場所: `public/assets/photo/b1-stage-spotlight.jpg`(動画は `public/assets/video/b1-stage-spotlight.mp4`)

インセットの実写は白い光の帯が左下から右上へ走る。地の光の柱も**同じ斜め**にすると、枠の中と外が同じ夜に見える。

### Midjourney

```
An empty concert stage seen from the dark stalls, one hard shaft of warm light falling from the upper right onto the polished floor in the middle of the frame, dust turning slowly inside it. A single empty chair and a music stand stand just inside the light, with dark red drapes only suggested behind. The rest of the stage and the whole left third of the frame are dark, and nobody is on stage.
```

### 動き(image-to-video)

```
Dust turns and drifts inside the shaft of light, rising and falling, and the edge of the beam softens and sharpens as haze moves through the air of the hall. The chair and the music stand stay where they are and nobody walks into the light. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

人・シルエット・楽器が光の中に立っているものは不採用(演奏者はインセットの実写が担う)。光の柱が2本以上、客席側が明るいものも不採用。

## B2 three-violins

- 地: `program#1`(音色当てゲーム)の1ショット目
- 尺: 5.6秒。動画は7秒以上
- 文字: 左。ローマ数字 `II` と見出しが左に立つので**左1/3を暗部**。楽器は右寄り
- 置き場所: `public/assets/video/b2-three-violins.mp4` / `public/assets/photo/b2-three-violins.jpg`

**3挺であることが主題**(数億・数千万・数百万の3挺を聴き比べる)。値札や価格の記号は描かない。

### Midjourney(案1・立てて並べる)

```
Three violins standing side by side on dark red velvet, seen from a low angle, each of a different age and colour of varnish: one deep amber and worn, one warm red-brown, one paler and newer. Exactly three instruments, the nearest one sharp and the other two blurred, their scrolls receding to the right. Lit by one warm light from above right, the left third of the frame empty and dark.
```

### Midjourney(案2・真上から)

```
Three violins lying in a row on dark red velvet, seen from directly above, their bodies parallel and their scrolls all pointing to the top of the frame, each of a different age and colour of varnish: one deep amber and worn, one warm red-brown, one paler and newer. Exactly three instruments. Lit by one warm light from above right, the left third of the frame empty and dark.
```

### 動き(image-to-video)

```
The three violins stay completely still. The warm light slowly strengthens and softens as if on a dimmer, a highlight travels a few millimetres along the varnish of the nearest one, and the velvet stirs in a faint draught. No hand and nobody enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

**本数が3挺でないものは不採用**(数が主題)。ヴィオラやチェロが混ざったもの、3挺が同じ色に揃ったもの(違いが見えない)も不採用。

## B3 listening

- 地: `program#1` の2ショット目
- 尺: 5.6秒。動画は7秒以上
- 文字: 左(B2 から通し)。手は右寄り、**左1/3を暗部**
- 置き場所: `public/assets/video/b3-listening.mp4` / `public/assets/photo/b3-listening.jpg`

「自分の耳で確かめる」を顔なしで言う。**横顔も入れない**。

### Midjourney

```
Close-up of a pair of adult hands resting loosely on the armrest of a dark velvet auditorium seat, the head and face out of the frame above, only the hands and the cuff of a dark sleeve in view, rows of empty seats blurred behind. Warm light spills in from the right and catches the knuckles and the brass of the armrest, and the left third of the frame is dark.
```

### 動き(image-to-video)

```
The hands relax by a fraction, the fingers settling on the armrest as a listener's would, and a slow breath shows in the sleeve. The warm light from the right flickers gently, as if the stage lighting were changing far away. The face never comes into the frame. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

指が6本、関節が溶けている、爪の造形が崩れているものは不採用(手の寄りは生成の弱点なので等倍で見る)。顔・耳・髪が1画素でも入ったものも不採用。

## B4 atelier

- 地: `program#2`。左に実写のインセット(`caporali_1400w.jpg`・横長のまま)が乗る
- 尺: 11.0秒(全尺)。**静止画を推奨**。動画にするなら13秒以上
- 文字: 右(インセットが左を占めるため、ここだけ左右が反転する)。ローマ数字 `III` と見出しが右に立つので**右1/3を暗部**。作業台は中央
- 置き場所: `public/assets/photo/b4-atelier.jpg`(動画は `public/assets/video/b4-atelier.mp4`)

インセットの実写は赤茶のマホガニーの室内。**地の木肌も赤茶に寄せる**と枠の中と外が繋がる。**手を入れない**。実在の製作者の写真の隣に生成の手があると「彼の手」に読める。

### Midjourney

```
A violin maker's workbench at night with nobody at it: an unvarnished spruce top clamped in the middle of the bench, curls of wood shavings around it, small gouges and a scraper laid out in a row, an open jar of amber varnish and a brush. The bench and the panelling behind it are warm red-brown mahogany. One warm work lamp above and slightly to the left, no hands and nobody in the frame, the right third of the frame dark.
```

### 動き(image-to-video)

```
One curl of wood shaving stirs and rocks in a draught, and dust hangs and drifts slowly in the light of the work lamp. The varnish in the open jar catches a slowly shifting reflection. The tools and the clamped spruce top do not move, and no hand and no person enters the frame at any point. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

手・人・鏡に映った人影が入ったら不採用。工具が架空の形(のこぎりのような歯、電動工具)のもの、作業台が青白い蛍光灯で照らされているものも不採用。

## C1 reception

- 地: `cta` の1ショット目
- 尺: 6.1秒。動画は7秒以上
- 文字: 中央下。日付(`2026.10.2` / `FRI` / `19:00 START`)を Cormorant の大きな数字で中央に置くので**下1/3を暗部**。器とケースは上半分に寄せる
- 置き場所: `public/assets/video/c1-reception.mp4` / `public/assets/photo/c1-reception.jpg`

ナレーションの「奏者や製作者との懇親の時間も」の地。

### Midjourney

```
A small evening reception in a dark panelled room, a row of champagne coupes and wine glasses standing on a polished dark table in the upper half of the frame, a closed violin case with worn leather and brass catches beside them, nobody in the frame. Lit by one warm light from above right, warm lamps out of focus far in the background, the lower third of the frame dark.
```

### 動き(image-to-video)

```
Fine bubbles rise slowly in the champagne coupes and the surface of the liquid trembles very slightly. The warm lamps in the background pulse and shift out of focus, as if people were moving somewhere far behind the camera. The glasses and the violin case stay where they are and nobody enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

ボトルのラベル、グラスに刻まれた文字、料理の皿が主役になったものは不採用。下1/3に明るい器が残るものも不採用(日付が読めない)。

## C2 hall-doors

- 地: `cta` の2ショット目
- 尺: 6.1秒。動画は7秒以上
- 文字: 中央下(C1 から通し)。**下1/3を暗部**。光は中央から奥へ
- 置き場所: `public/assets/video/c2-hall-doors.mp4` / `public/assets/photo/c2-hall-doors.jpg`

### Midjourney

```
A pair of tall dark wooden doors standing slightly ajar at the end of a dim corridor, warm light from the hall beyond laying a widening wedge across the dark floor toward the camera, and through the gap only a glimpse of warm lamps and the edge of a deep red carpet, plain wood and brass rather than gilding, nobody in the frame. Lit by one warm light from above right, warm lamps out of focus far in the background, the lower third of the frame dark.
```

### 動き(image-to-video)

```
The gap between the doors widens very slowly, by about a hand's width over the whole shot, and the wedge of warm light on the floor broadens with it. Dust drifts through the light. No hand touches the doors and nobody walks through them. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

人が通り抜ける、扉が全開になって奥の全景が見える(会場を名指ししたことになる)、金の彫刻が付いた宮殿の扉になったものは不採用。

## C3 end-bokeh

- 地: `logoOut`。マークが中央に立つ
- 尺: 4.0秒(全尺)。動画は5秒以上
- 文字: 中央にマーク。**中央40%を暗部に**。ボケは上半分と左右
- 置き場所: `public/assets/video/c3-end-bokeh.mp4` / `public/assets/photo/c3-end-bokeh.jpg`

A1 と同じ部品で閉じる。**A1 と同じ画にはしない**(ボケの大きさと配置を変える)。

### Midjourney

```
Darkness with large soft champagne-gold bokeh circles of different sizes drifting across the upper half of the frame and a few small ones near the left and right edges. The faint texture of dark red velvet along the very bottom edge. The centre of the frame is empty and black, and nothing in the picture is a recognisable object.
```

### 動き(image-to-video)

```
The golden bokeh circles drift slowly upward and slightly to the right, passing each other at different speeds, and their brightness pulses gently as they move. The centre of the frame stays empty and nothing resolves into an object. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

ボケが中央に集まっている、光の粒が星形やレンズフレアの筋になっている、色が緑や青に転んでいるものは不採用。

## 同じ素材を2回使わないための追加(2026-09-11。**5本とも 2026-09-15 に静止画で到着し、v7 に入った**)

5つのシーンが**同じ画像を動画と静止画の両方**で使っていて、同じ絵が2度出る。埋めるための4本。C1(懇親)は既にこの文書にあり、CTAの2ショット目に入る。

| 入る場所 | いま何が重複しているか | 新しいID |
| - | - | - |
| `value` 3ショット目 | a3(天井)が動画と静止画 | **A5 salon-circle** |
| `program#0` 3ショット目 | b1(舞台)が動画と静止画 | **B5 violin-on-stand** |
| `program#1` 3ショット目 | b2(3挺)が動画と静止画 | **B6 three-scrolls** |
| `program#2` 2ショット目 | b4(工房)が静止画で2クロップ | **B7 appraisal-desk** |
| `cta` 2ショット目 | e5(客席)が静止画で2クロップ | **C1 reception**(既出) |

## A5 salon-circle

- 地: `value` の3ショット目。**少人数で学ぶ**ことを人を写さずに言う
- 文字: 右
- 置き場所: `public/assets/photo/a5-salon-circle.jpg` / `public/assets/video/a5-salon-circle.mp4`

### Midjourney

```
A small salon room at night with about eight empty chairs arranged in a half circle facing a music stand, warm light from a lamp on the left, the right side of the room in darkness.
```

### 動き(image-to-video)

```
Dust drifts slowly through the warm lamplight and the light flickers very gently. Nobody enters the room. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

椅子が多すぎる(会議室に見える)、人が写っている、右側が明るいものは不採用。

## B5 violin-on-stand

- 地: `program#0` の3ショット目。演奏される前の楽器、という間
- 文字: 左
- 置き場所: `public/assets/photo/b5-violin-on-stand.jpg` / `public/assets/video/b5-violin-on-stand.mp4`

### Midjourney

```
An old violin with deep amber varnish resting on a velvet covered stool on a dark stage, one warm light falling on it from above right, the left half of the stage in darkness.
```

### 動き(image-to-video)

```
Dust drifts through the beam of light and the highlight on the varnish breathes very slowly. Nothing else moves, nobody enters. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

弦が4本でない、楽器が左半分にはみ出している、人や手が写っているものは不採用。

## B6 three-scrolls

- 地: `program#1` の3ショット目。**3挺を比べる**ことを別の寄りで言う(b2 の真俯瞰とは別の絵)
- 文字: 左
- 置き場所: `public/assets/photo/b6-three-scrolls.jpg` / `public/assets/video/b6-three-scrolls.mp4`

### Midjourney

```
Close-up of the carved scrolls of three violins standing in a row, each a different shade of amber varnish, seen from the side, warm light from the right, the left third of the frame dark.
```

### 動き(image-to-video)

```
The warm light slowly travels across the three scrolls one after another. Nothing else moves. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

渦巻きが3つ写っていない、形が崩れている、左1/3に明るいものがあるものは不採用。

## B7 appraisal-desk

- 地: `program#2` の2ショット目。**資産としての楽器**を語る場面なので、鑑定の道具を出す
- 文字: 右
- 置き場所: `public/assets/photo/b7-appraisal-desk.jpg` / `public/assets/video/b7-appraisal-desk.mp4`

### Midjourney

```
A dark wooden desk at night with a magnifying loupe, a pair of white gloves and an old violin lying on its side, a desk lamp lighting them from the left, the right side of the desk in darkness.
```

### 動き(image-to-video)

```
The lamplight flickers very gently and dust drifts above the desk. Nobody enters the frame and nothing is picked up. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

書類の文字が読める(架空の書類は嘘になる)、手や人が写っている、右側が明るいものは不採用。**文字が写っていたら不採用**。

## 連作セット(照明句の固定)

**1シーンを2ショットで繋ぐ3つのセットは、セット内で照明の言葉を変えない。** 言い換えも省略も不可。ここが揃っていないと、カットした瞬間に「別の日に撮った写真」になる(sake v8)。以下の一文は各プロンプトに入っているので、**作り直すときも同じ文字列を使う**。

### `title` セット(shot1 = 実写 → shot2 = A2)

```
Lit by one warm light from above right, a faint blue-green glow far in the background, the left third of the frame dark.
```

shot1 は実写なので生成しない。青緑のボケは実写のガラスケースの環境光から取った。実写側はこちらの層で彩度を落として A2 に寄せる。

### `value` セット(A3 → A4)

```
Lit by one warm light from above left, small warm lamps far out of focus in the background, the right third of the frame dark.
```

引き(ホールの天井)から寄り(渦巻き)へ。同じ夜の同じ建物の中に見せる。

### `cta` セット(C1 → C2)

```
Lit by one warm light from above right, warm lamps out of focus far in the background, the lower third of the frame dark.
```

室内(懇親)から扉(入場)へ。どちらも「奥に暖かい光がある」ことで繋がる。

## D1 podium-standin(登壇者のダミー)

**これはダミーであり、本人ではない。** モデレーターの写真は384×216しか無く、パネルに耐えない。だからといって**実在人物の顔を生成しない**。似顔絵も、雰囲気の似た別人も嘘になる。代わりに「その席がある」ことだけを顔なしで描く。

- 用途: `guests`(13.0秒)のクレジット行の背後、または写真が届くまでの仮置き。パネルの背後に敷くなら静止画でよい
- 文字: 右。氏名と肩書のクレジット行が右に出るので**右1/3を暗部**
- 置き場所: `public/assets/photo/d1-podium-standin.jpg`(動画は `public/assets/video/d1-podium-standin.mp4`)

### Midjourney

```
A lectern seen from the side in a dark hall, a slim microphone on its stem, a glass of water and a closed notebook on top. A warm light from above left falls only on the top of the lectern, so everything above and behind it is in shadow. Nobody at the lectern and nobody in the frame, and the right third of the frame is dark.
```

### 動き(image-to-video)

```
Dust turns slowly in the light over the lectern and the water in the glass trembles very faintly. Nothing else moves and nobody steps into the light at any moment. The camera does not move and the framing at the end is the same as at the start.
```

### 採用基準

人・シルエット・後ろ姿が入ったら不採用(パネルの隣に置くと本人に読まれる)。マイクが2本以上、演台に紙束が積まれて雑然としたものも不採用。**写真が届いたら差し替える。**

## 任意の追加(優先度順)

尺は余っていない。連作を3ショットに増やすとき、あるいは上のどれかが撮れなかったときの替えになる。**上から作る。**

### E1 弓の毛のマクロ(優先度: 高)

`title` か `program#1` の3ショット目。松脂の粉が舞うので動きが作れる。文字は左、左1/3が暗部。

```
Close-up of the taut hair of a violin bow stretched across the frame, the white ribbon sharp on the right and blurring toward the left, the ebony frog just visible at the right edge, a few loose hairs and a haze of rosin dust in the light. Lit by one warm light from above right, no hand holding the bow, the left third of the frame dark.
```

```
The bow hair trembles faintly under tension and rosin dust drifts through the warm light. No hand holds the bow and nobody enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### E2 ケースの内張り(優先度: 高)

C1 と同族。空いたケースは「持ち帰れる資産」を言葉なしで言う。文字は中央下、下1/3が暗部。

```
An open violin case seen from above, the empty velvet interior deep red, the shaped hollow where the instrument lies clearly visible, a spare set of strings coiled in the compartment and a silk cover folded back, worn leather and brass catches around the rim. No instrument inside and nobody in the frame. Lit by one warm light from above right, the lower third of the frame dark.
```

```
The silk cover moves a few millimetres in a faint draught and the nap of the velvet changes tone as the light shifts. Nothing is put into the case and nobody enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### E3 譜面台の光(優先度: 中)

B1 と同族で、B1 が撮れなかったときの替えになる。文字は左、左1/3が暗部。**譜面は白紙のまま**にする(音符を描くと架空の曲になる)。

```
A single black music stand on a dark empty stage, lit by one hard warm shaft of light from the upper right, the desk of the stand empty with no sheet music on it, its chrome stem catching a thin gold line, dust turning in the beam. Nobody on stage and the whole left third of the frame dark.
```

```
Dust turns inside the shaft of light and the edge of the beam breathes. The music stand does not move and nobody walks onto the stage. The camera does not move and the framing at the end is the same as at the start.
```

### E4 松脂(優先度: 中)

B4 と同族。`program#2`(製作の工程)の寄り。文字は右、右1/3が暗部。

```
Close-up of a block of amber violin rosin in its worn wooden holder on a dark workbench, the cracked surface glowing where the light passes through it, fine rosin dust on the bench and a coil of gut string blurred behind. One warm work lamp above and slightly to the left, no hands and nobody in the frame, the right third of the frame dark.
```

```
Rosin dust drifts through the light of the work lamp and the glow inside the block shifts slowly. Nothing is touched and nobody enters the frame. The camera does not move and the framing at the end is the same as at the start.
```

### E5 客席の暗がり(優先度: 低)

B3 と同族。少人数の会であることを空席で言う。文字は左、左1/3が暗部。

```
Rows of empty dark velvet auditorium seats seen from behind at a low angle, only the nearest row in focus, a warm light from the distant stage catching the top edge of each seat back in a thin gold line, the rest of the hall dissolving into darkness. Nobody in the seats and the left third of the frame dark.
```

```
The light from the distant stage slowly rises and falls, running along the gold edge of the seat backs. Nobody sits down and nothing else moves. The camera does not move and the framing at the end is the same as at the start.
```

## 投入後の手順

1. **無加工のまま置く**。動画は `labs/freehand/violin-2026/public/assets/video/<id>.mp4`、静止画は `labs/freehand/violin-2026/public/assets/photo/<id>.jpg`。ファイル名はこの文書の ID(`a1-opening-curtain` など)。静止画を同名で置けば `sources.ts` が拾う
2. **`src/freehand/sources.ts` の該当スロットの `available` を true にする**。placeholder(velvet + bokeh)から本命の地に切り替わる
3. **動画を置いたスロットは Ken Burns を外す**。動画は据える・静止画は動かす(sake v7)。両方掛けると漂って見える
4. **`npm run render`**
5. **placeholder との差を [FINDINGS.md](FINDINGS.md) の「所見」に書く**。良くなった点だけでなく、**変わらなかった素材と、使わなかった素材とその理由**も残す(sake は `sources.ts` の末尾に書いた)
6. 尺が合わずクリップが途中でフリーズしたら、**尺を伸ばさずカットを早める**。フリーズはカットの中では不具合に見える
