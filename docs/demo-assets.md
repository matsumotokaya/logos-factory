# デモ素材の正本(生成AIで作る・再配布可)

**このサービスのデモに出る素材は、すべて「誰が使っても権利上問題がないもの」でなければならない。**

この文書が持つのは、**権利・置き場所・塗りごとの要件**、そして**いま依頼中のプロンプトだけ**。

> **プロンプトは使い捨て。要件は残す**(2026-08-26 決定)。
>
> 素材が届いたらそのプロンプトは**この文書から削除する**。残すのは「どんな絵が要るか」(スロット・照明族・禁止事項・受け入れ条件)で、それは次の1枚を頼むときにも同じことを言うから。プロンプトの全文は**一度使えば済む使い捨ての道具**で、置いておくと「これは依頼中か、もう届いたのか」が読めなくなる——**この文書の§は「いま何を待っているか」の一覧でなければならない**。
>
> 消えたものが必要になったら `git log -p docs/demo-assets.md` にある。だから削除は情報の破棄ではなく、**入口を現在形に保つ操作**。

## 1. なぜ自分で作るのか

デモに出ていた素材は、**このリポジトリに置けないものに依存していた**——ライセンスストックフォト(AdobeStock)、**実在人物**のポートレート(許諾はその案件限り)、支給BGM、**実在企業のマーク**。だから新しい環境では整形スクリプトを実行しないとレンダーが失敗する。**素材が無いのではなく、配れない素材を指している**のがその状態の正体(実案件 `public/event/sake-2026/` は今もこれ。既定プールとは別物として扱う)。

解き方は既にBGMで1つ通っている: **商用利用可の契約下にある生成AI(Suno / Midjourney)で作れば、生成物なので再配布できる**。

## 2. アートディレクションごとに別のプールを持つ

**素材は塗り(アートディレクション)ごとに作る。1枚の写真を両方で使おうとしない。**

理由は測定で出ている。`sumi` は `rgba(8,6,4)` を strength 0.74 でかぶせて写真を**落とし**、`standard` は `rgba(247,249,252)` を 0.84 でかぶせて**持ち上げる**。だから暗部前提の写真はスタンダードで**灰色の霧**になり(2026-08-26 `npm run themes:compare` で確認——タイトル・アジェンダ・CTAが全部曇った)、明るい写真は墨で平坦になる。写真の側で妥協して中間トーンにすると**両方で悪くなる**(2026-08-23 に一度その方向へ行きかけた)。

| | `sumi`(モダンジャパニーズ) | `standard`(スタンダード) | `luxury`(ラグジュアリー) |
| --- | --- | --- | --- |
| 状態 | **納品水準・検証済み**(freehand v8 で合格、依頼主フィードバック3巡) | 作れるようになった(2026-08-26)。**写真待ち** | 作れるようになった(2026-09-24)。**画像は仮**(依頼主「後で差し替える」) |
| 題材 | 日本文化を学ぶ | ビジネスセミナー | 夜のホールと名器 |
| 照明族 | 右上からの暖色キー・炭黒の地・**左3割が暗部** | 画面外左の大窓からの拡散昼光・白い壁・**左3割が明るく平坦** | 舞台の一灯・ボルドーの黒・**左3割が暗部** |
| カタログの `tone` | `ink` | `light` | `ink` |
| 素材 | **6枚+6名 納品済み**(§4) | **§6 で依頼中** | **5枚**(freehand violin-2026 の生成静止画から左3割の検査に通ったもの)。登壇者は墨の6名を共用 |

READMEの「`standard` が正式版で `sumi` は派生」は**将来の位置づけ**の宣言であって、成熟度の話ではない。

**題材は塗りに従い、実案件には従わない。** モダンジャパニーズ=日本酒ではない。日本酒はニッチすぎて同種のイベントは二度と作られないので、既定プールの題材は普遍的なもの(文化・学び・仕事)にする。**題材が具体的であることは問題ではなく、後で差し替えられることが要件**。

## 3. 既定素材はシステムの一部。バイトはコミットする

**BGM・効果音・写真・マークはコードと一緒に配布され、コードと一緒にデプロイされる**(2026-08-30 依頼主判断)。どこか別に置いてある「データセット」ではない。**利用者がアップロードしたものだけが別管理**(R2・Takeに紐づく)で、そこが唯一の境界。

> **なぜこれが規則なのか**: Vercelはgitからビルドする。gitに入っていない素材は、デプロイ先に存在しない。「開発機では鳴るが本番では鳴らない」は仕様ではなく**バグ**で、素材ごとに置き場所が違う状態がそれを量産していた。

| プール | バイト | 理由 |
| --- | --- | --- |
| `bgm/` `stills/` `portraits/` `marks/` | **gitに入れる** | 自分が生成した、再配布できる素材(Suno / Midjourney の商用プラン、またはコード) |
| `sfx/` | **入れられない** | 効果音ラボが音素材そのものの再配布を禁じており、**このリポジトリは公開**。復元は [scripts/fetch-default-sfx.mjs](../scripts/fetch-default-sfx.mjs) =レシピが担う。**ただし現状は本番で鳴らない**(下記) |
| `video/` | **いまは入れない** | 支給されたストック素材で、**再配布の可否が未確認**(ロイヤリティフリー=使ってよい、であって配ってよい、ではない)。git履歴は取り消せないので、生成物に差し替えるまで入れない(下の注) |

**効果音は本番で鳴らない。** `npm run sfx:sync` はR2の `defaults/sfx/` へアップロードするが、**それを読む実装が無い**——srcは `defaults/sfx/*.mp3` のまま `staticFile()` を通るので、デプロイ先では404になる。**この例外が消える道は2つしかない**:

1. **リポジトリを非公開にする** — 再配布に当たらなくなるので、他の素材と同じくコミットできる。1操作で終わる
2. **効果音を自社生成のものに置き換える** — ストック写真を置き換えたのと同じ手。63音ぶんの作業

どちらも取らないなら、**効果音は開発機だけの機能**であることを製品の仕様として認める必要がある。

**出典が確認できるまで、地の動画は書き出しに乗らない。** カタログの `licensed: false` を[コンポジション](../remotion/event-cm/EventCmComposition.tsx)が読み、レンダー時だけ layer を外す(プレビューでは見える)。**この経路は 2026-08-27 に初めて実装した**——`unlicensedDefaults()` は宣言だけあって誰も呼んでいなかったので、清算されていない素材を足すなら先に除外を書く、という README の条件をここで満たしている。

**生成物はレシピでは復元できない**(同じプロンプトでも同じ絵にならない。曲も同じで、同じプロンプトから同じテイクは出てこない)。だからバイトを持つ方が正しい。SFX だけが逆になるのは、そこだけ禁じられているのが**再配布**だから——復元できるかどうかとは別の話。**そして復元できないからこそ、プロンプトを取っておく意味も薄い**(上の使い捨て規則)。

## 4. 置き場所と現在の在庫

```
public/defaults/
  stills/      背景写真(シーンの地)   .jpg  ← 塗りごと(light-* がスタンダード)
  portraits/   架空の人物              .jpg  ← 同上
  marks/       ダミーロゴ              .svg  ← 生成AIでは作らない(§7)
  video/       地の動画                .mp4  ← gitignore(出典未確認のため)
  devices/     デバイス実景写真        .jpg  ← 空。要求が出たら§5の要件で書く
```

カタログは [lib/assets/defaults.ts](../lib/assets/defaults.ts) の `DEFAULT_ASSETS`。**両方の塗りの素材が同じディレクトリに入る**——分けるのは `tone`(`ink` / `light`)で、テンプレートは塗りごとに asset id を名指しする([lib/templates/catalog.ts](../lib/templates/catalog.ts) の `artDirections[].visuals`)。

| 在庫 | 中身 | `tone` |
| --- | --- | --- |
| `stills/` 6枚 | 茶室2・硯と筆・障子の光と壺・会場(座卓と提灯)・夕暮れの玄関 | `ink` |
| `stills/light-*` 6枚 | 会議室・研修室・机の上・ガラスの廊下2・会場のロビー | `light` |
| `portraits/` 6名 | 40〜70代・スーツ/ジャケット/開襟/藍 | `ink` |
| `portraits/light-*` 6名 | 20〜60代・Tシャツ/ニット/カーディガン/ジャケット/スーツ | `light` |
| `marks/` 4種 | 門・環・三層・組子(コードで作成) | `neutral` |
| `video/end-card-sumi.mp4` | 富士と雲海(エンドカードの地・**仮・差し替え予定**) | `ink` |
| `video/end-card-light.mp4` | 夕暮れの都市(エンドカードの地・**仮・差し替え予定**) | `light` |

**既定値の梯子は4段**(ブランド → テンプレート×塗り → システム → 設計代替)なので、このプールは3段目。埋めなくても完成した動画は出る(墨の地・金縁モノグラム、スタンダードはウォッシュの地)。埋めると全テンプレートの既定が一斉に良くなる。

## 5. 塗りに関係なく守る要件(**ここが残る部分**)

**プロンプトが消えてもこの節は消えない。** 次の1枚を頼むときも同じことを言う。

1. **16:9・横位置・Upscaleして長辺2560px以上。** 生成サイトの素の16:9は約1456pxで、Ken Burns(墨1.04→1.13 / 標準1.02→1.08)で寄ると甘くなる。人物だけ `--ar 4:5`(円形メダリオンと縦長パネルの両方に切れる)
2. **コピーが乗る側を空ける。** どのレイアウトも文字は左(タイトルだけ中央)。だから被写体は中央〜右、CTAの地は左下を空ける。**`negative space on the left` を削らない**
3. **文字・ロゴ・看板・画面の中身を入れない。** 架空の銘柄や社名が写ると「事実」になる。生成AIの文字は崩れ、崩れた文字は「デザインが荒い」ではなく**「読めない偽物」**に見える
4. **背景に顔を入れない。** 人物が写った写真は背景スロットに使えない(v1で実証: `cover` では顔を画角外に追い出せない)。顔が入るのは `guests[n].photo` だけ
5. **セット内で照明句を1文字も変えない。** 揃っていないとカットした瞬間に「別の日に撮った写真」になる。照明句は**塗りごとに1つ**(§2の表)で、そこにコピー側の空きも畳み込んである——光源をコピー側に置けば、そちら側が自然に飛ぶ(標準)/落ちる(墨)
6. **動画化するならカメラを止める。** こちらが寄り引きを掛けるので、素材側でも動かすと**二重に動いて酔う**。動くのは被写体だけ(光・湯気・埃・布)、5〜10秒、**音声は捨てる**(BGM・ナレーション・SFXで設計済み)、ループ前提
7. **人物に氏名を付けない。** [seed.ts](../lib/templates/event-cm/seed.ts) の方針(「人名は発明しない・役割を提案する」)がデモでも効く。架空の顔に架空の氏名を添えると「存在しない人物のプロフィール」になる
8. **エンドカードの地は、洗われる前提で作る。** 締めの1枚は**テーマ自身の地の色で0.6ほど平坦に洗ってから**マークを載せる([remotion/kit/theme.ts](../remotion/kit/theme.ts) の `ThemeEndCard`。承認済みの和モダンの数字は `rgba(8,6,4,0.58)`)。理由は好みではなく、マークの描き方が `palette.ground` から導かれるため——映像を全面のまま出すとその導出が嘘になる。つまり**細部で勝負する絵は無駄になる**: 大きな形・広い階調・中央が静かなもの(マークが中央に立つ)。**実在の場所・看板が写るものは避ける**(今の仮素材が都市の実景で、看板が写っている)
9. **再配布できるかで選ぶ。無料であることとは別。** 「ロイヤリティフリー」は使用許諾であって再配布許諾ではない。既定プールの素材は**他人のMP4に焼かれて配られる**ので、そこが確認できないものは `licensed: false` のまま(プレビュー限定・書き出しから除外)。**迷ったら生成物にする**——自分で生成したものは最初からこの問題を持たない(§1と同じ結論)

**受け入れは目視ではなく実物で確認する。** `npm run themes:compare` → `var/theme-compare/<塗り>-<シーン>.png`。合格条件は**その塗りで**判定する(互いの塗りでの見え方は合否に使わない・§2)。

1. コピー側が被写体側より**暗く静か**(墨)/**明るく平坦**(標準)。取り込み時に測る
2. スクリム越しに写真が写真に見える(黒板/灰色の霧になっていない)
3. 文字が写真の細部を横切っていない
4. Ken Burns の終端で重要なものが切れていない
5. 文字・看板・画面の中身が写っていない
6. 背景写真に顔が入っていない
7. ポートレートが円形メダリオンと縦長パネルの両方で成立し、セット内で地の色が揃っている

## 6. 依頼中: エンドカードの地(2本・仮素材の差し替え)

**いま入っている2本は仮。** 支給されたストック素材(富士と雲海 / 夕暮れの都市)で、ロイヤリティフリーではあるが**再配布の可否が未確認**なので `licensed: false` ——プレビューでは見えるが書き出しMP4とZIPからは外れる。**生成物に差し替える**(依頼主判断・2026-08-28)。差し替えれば §5-9 の問題が消え、`licensed: true` にしてバイトをコミットできる。

**まず静止画で見る。** エンドカードは4秒で、こちらが寄り引きを掛けられるので、**静止画でも成立する**——実際いま使っている都市の映像も、洗った後に残るのは大きな階調だけ。良ければ動画化に進む(§6.3)。静止画で採用する場合は `theme.endCard` が動画前提なので**1行の変更**が要る(Ken Burns はキットに在る)。

**要件は §5、特に 8番。** 洗われるので細部は残らない。中央はマークが立つので静かに。文字・看板・実在の場所は入れない。

### 6.1 墨(モダンジャパニーズ)— 承認済みの「富士と雲海」の置き換え

**`end-card-sumi-01`**

```
A distant mountain silhouette rising above a vast sea of clouds at dawn, seen from far above, the clouds filling the lower two thirds in long soft layers, deep indigo and near-black sky above with one faint band of warm light at the horizon, no foreground objects, the centre of the frame calm and uncluttered, atmospheric haze, extremely wide vista, cinematic still, photorealistic --ar 16:9 --style raw --stylize 150 --no text, letters, signage, buildings, roads, towers, people, birds, watermark, logo, caption, sun disc, lens flare, cartoon, illustration, 3d render, oversaturated
```

**`end-card-sumi-02`**(別案・より抽象)

```
Black sumi ink diffusing slowly through clear water in soft wide tendrils, faint gold particles suspended in it, pure black background, no objects and no hands, the centre of the frame open, high contrast, minimal, macro, cinematic still, photorealistic --ar 16:9 --style raw --stylize 150 --no text, letters, calligraphy characters, kanji, watermark, logo, caption, hands, faces, cartoon, illustration, 3d render, oversaturated
```

### 6.2 スタンダード — 「夕暮れの都市」の置き換え

都市の実景は看板が写るので生成でも避ける。**空と光**にすると、墨(雲海)と対になり、明るく洗っても大きな階調が残る。

**`end-card-light-01`**

```
Sunlit clouds seen from high above, wide soft layers of white and pale blue filling the frame, clean bright daylight, a calm open area through the middle of the frame, no ground and no horizon line, no objects, high-key and airy, cool neutral colour balance, cinematic aerial still, photorealistic --ar 16:9 --style raw --stylize 150 --no text, letters, signage, buildings, aircraft, people, birds, watermark, logo, caption, sun disc, lens flare, dark moody shadows, warm orange cast, cartoon, illustration, 3d render, oversaturated
```

**`end-card-light-02`**(別案・建築)

```
Looking up at a bright glass and pale stone facade of a modern building against an overcast white sky, clean geometric lines receding upward, soft even daylight with no hard shadows, no signage of any kind, the centre of the frame open sky, high-key and airy, cool neutral colour balance, cinematic architectural still, photorealistic --ar 16:9 --style raw --stylize 150 --no text, letters, signage, logos, windows with visible interiors, people, watermark, caption, dark moody shadows, warm orange cast, cartoon, illustration, 3d render, oversaturated
```

### 6.3 動画にする場合(静止画が良ければ・元画像を添付して投げる)

**カメラは止める。動くのは雲だけ。** 8秒以上あれば足りる(締めの板は4秒、ループしない)。

**`end-card-sumi-01` を元に**

```
The sea of clouds drifts very slowly across the frame while the mountain silhouette stays completely still, the light at the horizon shifting almost imperceptibly, locked-off camera, no camera movement, slow motion, photorealistic, no text, letters, watermark, logo, subtitles, camera shake, handheld, zoom, pan, whip pan, morphing shapes, people, birds, aircraft, cartoon, 3d render, oversaturated, strobing, flickering, sudden brightness change
```

**`end-card-light-01` を元に**

```
The cloud layers drift slowly and evenly across the frame, the light staying constant throughout, nothing else moves, locked-off camera, no camera movement, slow motion, photorealistic, no text, letters, watermark, logo, subtitles, camera shake, handheld, zoom, pan, whip pan, morphing shapes, people, birds, aircraft, cartoon, 3d render, oversaturated, strobing, flickering, sudden brightness change
```

### 6.4 受け渡し

| 名前 | 置き場所 |
| --- | --- |
| `end-card-sumi-*` | `public/defaults/video/end-card-sumi.mp4`(または `.jpg`) |
| `end-card-light-*` | `public/defaults/video/end-card-light.mp4`(または `.jpg`) |

**無加工で。** grade と洗いはテーマの層がやる。届いたら `npm run themes:compare` の `*-logoOut.png` で、**マークとクレジットが地に勝っているか**を測って採用する(墨の基準値: 全体の明度0.098・クレジット背後のばらつき0.139)。

## 7. 生成AIで作らないもの

**文字が要るものは生成AIで作らない。** 崩れた文字は「デザインが荒い」ではなく**「読めない偽物」**に見える。

| 欲しいもの | 作り方 | 理由 |
| --- | --- | --- |
| **ダミーロゴ・マーク** | **コードでSVG** | 透過・鋭いエッジ・単色が要る。`treatment`(knockout/invert)は**測った輝度**で決まるのでラスタでは測れない。前例2つ——LPのクライアントロゴウォール(画像を1枚も持たない)と [public/defaults/marks/](../public/defaults/marks/gate.svg)(4種) |
| **架空のダッシュボード** | **コードでHTML/SVG** | 数値・ラベル・凡例が読めないと「ダッシュボード」に見えない |
| **架空の銀行口座画面** | **コードでHTML** | 金額と日付が読めることが全て。崩れた数字は不気味に見える |
| **デバイスモックアップ** | **既存の `deviceMockupHtml()`** | 「このサービスをPCとスマホに映したものを描く実装は1つだけ」という既存の規則([docs/device-mockup-fixes.md](old/device-mockup-fixes.md))。ここに写真を足すと2つ目の実装になる |

生成AIで作れるのは**デバイスが写っている実景写真**だけ(画面の中身は消灯・反射・角度で見せない)。`devices/` はまだ空で、**要求が出たときに §5 の要件でプロンプトを書く**——使わないスロットのプロンプトを置いておくのは、この文書が捨てようとしている種類の在庫。

## 8. 残っていること

- **スタンダードの素材**(§6)。届いたら `DEFAULT_ASSETS` に `tone: "light"` で足し、[catalog.ts](../lib/templates/catalog.ts) の `artDirections` の `standard.visuals` に3スロット+見本写真2枚を書く。**先に登録すると、実体の無いファイルを指した瞬間に Remotion がレンダーを止める**(これは正しい挙動)
- **エンドカードの地を生成物に差し替える**(§6)。差し替え後に `licensed: true` + バイトをコミット + `.gitignore` の1行を外す。**静止画で来る場合は `theme.endCard` に1行**(いまは動画前提)
- **`device` は `ASSET_KINDS` にまだ無い**(`still` / `portrait` / `mark` / `b_roll` は在る)
- **スタンダードの背景6枚がUpscaleされていない**(1456×816)。墨の3枚と同じ残タスク
- **`standard` の既定を先頭にするか**は、§6 の素材で通しを見てから。切り替えは catalog.ts の `artDirections` の順序と `defaultRenders[0].theme` の2箇所(テストが一致を要求する)
- **墨の背景3枚がUpscaleされていない**(素の1456×816)。Ken Burnsで約1.5倍になり眠い
- **sake-2026 のブリーフをデモ素材に向け替えるか**は別判断。実案件3本が乗っているので、既定プールを埋めることと実案件のブリーフを書き換えることは分けて考える

## 9. BGM(Sunoで作る)

**プールは4段の梯子の3段目**(§4 と同じ位置)で、`public/defaults/bgm/` に置きバイトをコミットする。Sunoの商用プランで生成したものは自社のものなので、効果音と違って再配布の制約が無い。カタログは [lib/assets/defaults.ts](../lib/assets/defaults.ts) の `DEFAULT_ASSETS`。

現在の在庫は3本(`shine-through-tokyo` 180秒・`bright-corporate` 40秒・`ink-cinematic` 216秒)。**`bright-corporate` の40秒は短すぎる**——51秒の映画に敷くと必ず1回ループし、継ぎ目の置き場所が無い(README のBGM節)。下のプロンプトで作るものは**すべて2分5秒以上**を確保する。

### 全曲に共通する要件

1. **2分5秒以上。** 映画より長ければループそのものが起きない
2. **頭から鳴る。** 静かに始まるイントロは不可。`strung-up-joy` は頭1.8秒が無音で、`trimBefore` で切る羽目になった(labs/freehand/violin-2026)
3. **ボーカルなし**
4. **旋律が鳴りっぱなしでない。** ナレーションの下で 0.16 まで下がるので、中音域(500Hz〜2kHz)が常に詰まっている曲は声と噛み合う。間のある曲が有利
5. **3〜4本生成して、ナレーションを乗せた状態で選ぶ。** 単体で格好いいかではなく、声が乗って濁らないか
6. 採用したら `scripts/measure-default-bgm.mjs` で実測し、`gain`(ピーク上限1.0)と `durationSec` を `DEFAULT_ASSETS` に書く

### 用途別のプロンプト(Style of Music 欄にそのまま貼る)

**ヴァイオリンのイベント**(文化・芸術・ラグジュアリー寄り。violin-2026 用)

```
Bright uplifting commercial music, featured solo violin melody, warm string section, acoustic piano and light drum kit, pizzicato and glockenspiel accents, major key, positive and elegant, forward-moving and friendly, polished advertising sound, instrumental, 116 BPM
```

**テック系のイベント**(勉強会・カンファレンス・製品発表)

```
Modern tech commercial music, clean synth arpeggios and warm analog pads, muted electric guitar plucks, crisp electronic drums, subtle piano, major key, bright and forward-looking, confident and energetic, polished product launch sound, instrumental, 120 BPM
```

**飲食店・店舗**(ライトでキャッチー。ウクレレと口笛)

```
Light happy commercial music, ukulele strumming and cheerful whistling melody, hand claps and shakers, warm acoustic guitar, glockenspiel, upright bass, major key, sunny and friendly, easygoing and catchy, instrumental, 112 BPM
```

**講演会・セミナー**(真面目・都会的。既存 `bright-corporate` の置き換え候補)

```
Refined urban corporate music, grand piano and muted trumpet, brushed drums and upright bass, warm strings, subtle vibraphone, major key, calm and intelligent, steady and understated, sophisticated business sound, instrumental, 104 BPM
```

### Lyrics 欄(インスト共通・構成の指示)

```
[Intro] main melody states itself right away, no fade-in
[Verse] rhythm section enters, steady and warm
[Chorus] full arrangement lifts, main theme sings brightly
[Break] sparse, only a few instruments, light and open
[Final Chorus] everything returns, bigger, ends cleanly
```

### Exclude Styles 欄(インスト共通)

```
vocals, minor key, dark, suspense, thriller, dramatic tension, sad, melancholic, EDM, trap, lo-fi, distorted guitar
```
