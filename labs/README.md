# Labs — 表現R&Dの研究所群

このプロダクトの勝負どころは**最初の体験**——アップロードされたロゴが立派に見えること——にある。「AIがあれば何でもできる」時代に、動くだけでは驚きにならない。**自分の作ったロゴの価値がプレゼンテーションされる**という実用価値こそが差別化であり、それを作るための研究開発を、独立したラボ群として運用する。

`/labs` で研究所インデックスを開く(noindex)。カタログの正本は [directory.ts](directory.ts)。

## 共通の判断基準

**「ロゴが立派に見えるか」**。派手なエフェクトでロゴが埋もれる表現は失敗。静かでもロゴの造形が際立つ表現が成功。全ラボ・全実験がこの基準に従う。

## 二つのモード + 統合(ラボ分類の考え方)

ラボは技術ジャンルではなく、**「ロゴに触れるか、触れないか」**で分類する。2026-07 の再編でこの整理に至った(経緯の詳細は [generative/README.md](generative/README.md) の「経緯」節)。

### 保証モード — ロゴを1ピクセルも崩さない(プロダクトの根幹)

決定論的な処理だけでできており、出力のロゴ不変が**保証される**。ガイドライン・定番モックアップ・印刷入稿物など「絶対に崩せない用途」を担い、**通常業務で使うのはこちら**。「このプラットフォームはロゴの扱い方を心得ている」という信頼の証明であり、内部は複雑なワークフローの積み重ねになる。ジャンルは2つ:

1. **プレゼンテーション表現**(Motion Lab): SVG・JavaScript・3D空間によるアルゴリズム表現。限界費用ゼロ
2. **ワークフロー合成**(Workflow Lab): テンプレート+決定論的合成エンジン、その先の Photoshop・Figma・ヘッドレスBlender 連携。既存のロゴをそのまま使ったプレゼンテーションを作る

### 探索モード — 生成AIで可能性を解放する

その信頼の上で、生成AIにロゴを**解釈・変形させることを仕様として許容**し、決定論では作れない表現(風化した看板・ネオン・刺繍・シネマティック)を探す。見た目・情緒のインパクトを最大化できる代わりに、プロの現場で使えるかは**使う側がリスクとリターンを判断**し、生成の実費もかかる。ハーネスの定義は「逸脱の禁止」ではなく**「逸脱を制御し、計測し、見せる」**——逸脱スコアボードが全生成物に忠実度を付けて返す。画像と動画は同じラボで扱う(動画生成はほぼ必ず参照画像を起点にするため、「作ったブランドイメージを動かす」までが一連の流れ)。

### 統合モード — 最終アウトプットへ束ねる

複数のソースとアセットを統合し、プロモーションビデオ・CM・バナー・LPという**マーケティングの最終アウトプット**に仕立てる領域。この領域の主役だったCampaign Labは2026-07-20に製品面 CM Maker へ卒業し、CM Maker は 2026-10-26 に削除した(成果物はブランドから作る形へ作り直す。[docs/template-contract.md](../docs/template-contract.md))。

## 体験のレイヤー = コストと課金の階段

技術の階層は、そのままコスト・希少性・課金の階段になっている。下層は限界費用ゼロで全員に配り、上層は重課金で提供する。

| レイヤー | 内容 | モード | 担当ラボ | 課金 |
|---|---|---|---|---|
| 1 | 静的: 高品質ガイドラインテンプレートへのロゴ配置 | 保証 | 本体プレゼン + Motion Lab | 無料 |
| 2 | SVG/3Dモーション(アルゴリズムで実行) | 保証 | **Motion Lab** | 無料 |
| 2.5 | 非生成AIの高品質合成(テンプレート合成とBlender焼き込みが稼働中、runtime Blenderは手動運用、Photoshopは計画) | 保証 | **Workflow Lab** | 無料〜低中(無料体験の画像セットはここで変動費ゼロ成立) |
| 3〜4 | 生成AIハーネス(画像+ショートビデオ、逸脱スコアボード付き) | 探索 | **Generative Lab** | 中〜重(無料キャンペーンは原価計算前提) |
| 5+ | ブランドからLP・30秒プロモ・CM・バナーへ統合 | 統合 | ブランド配下の成果物(`/brands/[id]`)。旧 CM Maker は 2026-10-26 削除 | 最重課金 |

### 課金API(コスト正本)

課金が発生する外部APIの一覧は [cost-sources.ts](cost-sources.ts) が正本で、`/labs` 最上部の**コスト節**に表示される。将来ここを**月次コストダッシュボード**にする(現状は静的表示、ライブ集計は未実装)。

- **Gemini 2.5 Flash Image(Nano Banana / Google AI Studio)** — 本体プレゼン シーン10の写実モックアップ。≈$0.039/枚(目安)。**原価ログ未実装**(ダッシュボード化前に計測追加が必要)
- **GPT-5.6(OpenAI)** — ブランドの分析(サイトの文章から運営・提供内容・種別を構造化)とロゴ候補の裁定。原価ログはまだ持たない
- **FLUX.2 pro (Together AI)** — Generative Lab 主エンジン。$0.03/枚(実測)。原価ログ有
- **Recraft V4.1/V3** — Generative Lab 派生生成機。$0.035/枚(実測)。原価ログ有
- **Gemini 3 Pro Image(Vertex AI)** — Generative Lab 対話修正層。Phase E3で接続予定(現状 未配線=課金なし)
- **基盤費**: Supabase(DB/Auth/Storage)は per-call ではなくインフラ月額(現状 無料枠内)

原価ログ有のソースは `var/*/jobs.jsonl` にジョブコストを記録する。本体Geminiは未計測のため、公開前に使用量記録を追加する。新しい課金APIを足すときは必ず cost-sources.ts に追記する。

## 現在地と次の一手

- ✅ **Motion Lab**: 全16実験が実装済み(2026-07-12時点)。残タスクは採用判断(星評価・研究ノート)と、採用実験の本体プレゼンへの移植、組み合わせ検証(v2)
- ✅ **Workflow Lab**(旧称 Image Lab、2026-07-12改称): 基盤要件書 Phase 1(2Dテンプレートフォーマット+決定論的合成エンジン+テンプレート3種+原価計測)が稼働中。**Phase 2 = Blender焼き込みパイプラインの第1弾が稼働**(2026-07-14実装: `mug-ceramic` テンプレート+uvWarp合成モード)——重いプロツールはテンプレート制作時のみ・ランタイムは決定論エンジンのみという型で、フォトリアルなマーチャンダイズを保証モード・変動費ゼロで実現した。次はテンプレート拡充(ボトル・キャップ・看板等)と採用判断、その後にQAゲート(Phase 2.5)
- ✅ **Generative Lab**: Phase E1(プロバイダ抽象化+FLUX.2/Recraft統合+表現テンプレート8種+プリセット3段ダイヤル+原価計測・監査ログ)が稼働中(2026-07-12)。実APIキーでの実機検証済み(2026-07-13、両エンジン成功・ダイヤル実効性を一次確認)。次は Phase E2(逸脱スコアボード+ロゴ領域検出)
- 🎓 **Campaign Lab → CM Maker**: 2026-07-20 に製品面へ卒業し、2026-10-26 に CM Maker ごと削除した。ラボの資料も同日に削除(git の `722c192` 時点に残っている)

## 研究所一覧

| ラボ | URL | モード | 状態 | テーマ |
|---|---|---|---|---|
| [Motion Lab](motion/README.md) | `/labs/motion` | 保証 | ✅ 稼働中(16実験) | SVG・CSS・Canvas・Three.js・Lottie によるアルゴリズム表現 |
| [Workflow Lab](workflow/README.md) | `/labs/workflow` | 保証 | ✅ 稼働中(Phase 1) | 決定論的合成+プロツール連携(旧称 Image Lab。旧URL `/labs/image` はリダイレクト) |
| [Generative Lab](generative/README.md) | `/labs/generative` | 探索 | ✅ 稼働中(Phase E1) | 生成AIハーネス: 3エンジン・表現テンプレート・ダイヤル4軸・逸脱スコアボード・ショートビデオ |
| Event PV | `/labs/event`(正規の置き場所は `/brands/[id]/video/[videoId]`) | 統合 | ✅ 稼働中(v1) | イベント・セミナー軸の30秒PV。ナレーションなし・BGMとタイポで成立させ、**素材ゼロでも完成品が出る**ことを要件にしたテンプレート。詳細は[ルートREADMEの「イベントPVテンプレート」](../README.md#イベントpvテンプレートevent-promo)。**納品済みイベントの参照物は [event/sake-2026/](event/sake-2026/README.md)** — 次のイベントはここのブリーフと素材割り当てを写して作る |
| [Freehand Lab](freehand/README.md) | —(画面を持たない) | 探索 | ✅ 稼働中(1本目 `sake-2026` の Phase B を持ち帰り済み) | テンプレートの制約を外して1本作り、**差分から要件を取る**。言葉・BGM・構成はそのままで、**デザインとアニメーションと素材の使い方だけ**を作り直す。持ち帰り方は現物を見てから決める(成果: event-cm =「イベント紹介動画 - モダンジャパニーズ」) |

## ディレクトリ構成

```
labs/
  README.md          # このファイル(研究所群の全体像・モード分類・共有レイアウトの正本)
  directory.ts       # 研究所カタログの正本(名前・モード・状態・研究範囲)
  shared/            # 全ラボ共通のページ骨格(LabShell / LabExplainer / FilterChips)
  motion/            # Motion Lab 本体(core / experiments / components)
  workflow/          # Workflow Lab 本体(core / engine / templates / components)
  generative/        # Generative Lab 本体(core / engine / templates / components)
  campaign/          # Campaign Lab の引き継ぎ資料・CLI・音声パイプライン
  event/             # イベントPVの素材整形スクリプト(決定論。ロゴのノックアウト等)
  freehand/          # 書き出したプロジェクトを自由に作り込む実験場。ソースはコミット・素材は除外・型チェック対象外
  <slug>/            # 新しいラボはここに独立したディレクトリを作る
app/labs/page.tsx        # 研究所インデックス(モード別グルーピング)
app/labs/motion/page.tsx # 稼働中ラボの薄いルート(workflow / generative も同様)
app/labs/[slug]/page.tsx # 準備中ラボのプレースホルダーページ
next.config.ts           # 旧URLリダイレクト(/lab → /labs/motion、/labs/image → /labs/workflow、/labs/campaign → /campaigns)。静的ページ内redirect()は本番でHTTPリダイレクトにならないため必ずここに書く
app/api/labs/workflow/*   # Workflow Lab の合成API(templates / compose / jobs)
app/api/labs/generative/* # Generative Lab の生成API(templates / generate / jobs / outputs)
```

## 共有レイアウト構造(全ラボ共通・2026-07-14正本化)

**全ラボのページは同じ読み方をする: 「上でロゴを選ぶと、下はそのロゴの成果物になる」**。この骨格はラボごとに作らず、`labs/shared/` の共有部品に載せる:

| 部品 | 役割 |
|---|---|
| [shared/components/LabHeader.tsx](shared/components/LabHeader.tsx) | 共通`AppHeader`のLabs variant。ただしワードマークは **`labos`**(`lib/config.ts` の `LABS_NAME`)。右側は本体と同じ言語切替+アカウント+ハンバーガー。その下のサブバーに現在のラボ名+モードバッジを出し、どのラボにいるか常に分かる。ラボ全体を「プロダクトの labos モード」として見せ、別アプリに見せない |
| [shared/components/LabShell.tsx](shared/components/LabShell.tsx) | ページ骨格の正本: LabHeader(slugで現在ラボを特定)→ 解説枠 → ロゴレール → `children(logo)`。**ラボ本体は選択ロゴを引数に受け取る関数として実装し、slug だけ渡す**(name/titleJa/mode は [directory.ts](directory.ts) から引く) |
| [shared/components/LabExplainer.tsx](shared/components/LabExplainer.tsx) | 折りたたみ「仕組みを見る」枠+稼働中/未着手バッジ付きモジュールカード(要件書のUI向け要約) |
| [shared/components/FilterChips.tsx](shared/components/FilterChips.tsx) | カタログ絞り込みのチップ行(すべて+選択肢) |

コンテンツ幅は全ページ本体と同じ `max-w-6xl px-6 md:px-10` に統一(ラボ索引・各ラボで揃える)。ヘッダーは本体の Landing と同じフルブリード。

ロゴレジストリと研究ノートは Motion Lab の`core/logo-store.ts`/`core/notes-store.ts`を全ラボの共有インフラとして使う。ロゴ一覧と追加は本体と同じ`BrandRepo`の正本を使い、localStorageに置くのは選択中のロゴIDと研究ノートだけ。選択はラボ間で引き継ぎ、各ページはLabShell経由で利用する。

「そのロゴの成果物」の意味はモードで異なる: 保証モード(Motion/Workflow)は決定論でコストゼロなので**選択ロゴで即時再レンダリング**、探索モード(Generative)は実費が伴うので**そのロゴの生成レコード(レポート)を表示**し、新規生成は明示操作のみ。

新しいラボを稼働させる手順: `labs/<slug>/` にコードを置き(ページはLabShellに載せる)、`app/labs/<slug>/page.tsx` の薄いルートを追加(静的ルートがプレースホルダーより優先される)、[directory.ts](directory.ts) の `status` を `"active"` に変える。

## 導線

ヘッダーのハンバーガーメニューから **Labs(/labs)** に入れる。導線とページ本体は、組織ロールではなくプラットフォームロール `platform_admin` / `labs_member` を持つ本登録ユーザーだけに表示する。Brand Manager(`/brand`) の組織owner/adminであることはLabs権限にならない。
