# logos(仮称)

**ブランドの正本(System of Record)と、その正本から成果物を出す生成ワークフロー。** URL・資料・ロゴを起点に、Organizationと企業・事業ブランドの情報を出典・確度付きで蓄積し、LP・動画・モックアップ・ブランド資産を一体管理する。Organizationはコンテナ、企業／事業／対象別は同じBrandのカテゴリーとして扱う。**事業構想は [docs/product.md](docs/product.md)**。現状はPoC。

サービス名は仮。[lib/config.ts](lib/config.ts) の `SERVICE_NAME` を変更すれば全体に反映される。

> **セッションの開始は [HANDOFF.md](HANDOFF.md)。** 現在の状態と次の作業はそちらが持つ。
> **このREADMEは索引で、通読するものではない。** 必要な節だけを引く。分担の基準は「1週間後に古くなるものは HANDOFF、古くならないものは README」。

## ドキュメント(正本マップ)

**このREADMEが全ドキュメントの唯一の入り口。** ここ(または、ここからたどれるサブディレクトリのREADME)にリンクされていないドキュメントは存在しないものとして扱う。運用ルール:

1. 新しいドキュメントを作るときは、必ずこの表かサブREADMEにリンクを追加する。リンクを張る場所がない=作らずに既存の正本を更新する
2. **1テーマ=1正本**。似たテーマの文書を新設せず、既存文書を更新する(スコープは各正本の見出しに従う)
3. サブディレクトリのREADME(例: [labs/README.md](labs/README.md))は、その配下の入り口を兼ねる
4. **役目を終えた文書は [docs/old/](docs/old/README.md) へ移す**。完了した計画・移行の記録を正本マップに残すと、次のセッションが「これからやること」と読み違える。移すときの手順(索引への追記・リンクの張り替え・相対リンクの深さ修正)は [docs/old/README.md](docs/old/README.md) の冒頭が正本。アーカイブは編集しない
5. **孤立した文書を作らない。** 書かれていて、grepでは見つかり、間違っている可能性があり、入口から辿れない文書は、無い文書より悪い。**検査は `npm run docs:check`**([scripts/check-docs.mjs](scripts/check-docs.mjs))——READMEからの到達可能性とリンク切れを見て、孤立が1本でもあれば落ちる。禁止を書くだけでは守られないので実行できる形にしてある
6. **読まなくてよいものは、そう書く。** 優先度を明記する(「まず読む」/「必要になったら引く」/「経緯を遡るときだけ」)。無印で並べると全部同じ重さに見え、結果として全部読まれないか、全部読み飛ばされる

| ドキュメント                                                               | 正本として扱う内容                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [HANDOFF.md](HANDOFF.md)                                                   | **現在の状態と次の作業**。1週間後に古くなることだけを持つ。40行以内・追記せず上書き。優先順位はここだけが持つ |
| [docs/product.md](docs/product.md)                                         | **事業構想の正本**: 前提(生成AIで作る側が増える→GTMに需要が移る)、このプロダクトは何か(ブランドの正本+それを読む生成ワークフロー)、**§3 「正本」を名乗れていない**(主張とコードのギャップ表)、作る順序、名前と商標。**セグメント・チャネル・価格・期日は決まっていないので書いていない**。前身の [docs/old/product-logo-management.md](docs/old/product-logo-management.md) はアーカイブ |
| [docs/deliverable-architecture.md](docs/deliverable-architecture.md)       | **ピボット後の全体アーキテクチャ要件定義の正本**(2026-09-03 第3版): マーケティングツール生成への再定義、ブランドアセットとマーケティングツールの2系統、BrandKnowledge(主張モデル)・版固定Template・Take/Run/Render/Artifact・Publication。**エンティティモデルの最新は §19(v3・2026-09-03): Organization=ワークスペース(テナント)、Brand単一エンティティの自由ツリー、Work廃止、同一性はIDのみ・更新は「再取り込み」で明示、生成=スイッチ/公開=明示**。§2(旧モデル)・§15(パイプライン統一)・§16(次フェーズ)は経緯。依頼者の原文(§0)を含む。**次にアーキテクチャを触るセッションの出発点は §19** |
| [docs/account-design.md](docs/account-design.md)                           | アカウント・権限・URL体系・RLS方針(Supabase設計)                                                                                                                                                                                                                                                                                                                                                                                  |
| [docs/data-model.md](docs/data-model.md)                                   | **稼働構造の正本(V3・現在形)**: Organization(ワークスペース) → Brand(自由ツリー) → Take → Render → Artifact → Publication、BrandKnowledge(主張+採用値)、素材の2スコープ、canonical スロット、ロゴとプレゼンTakeの関係。**「今どうなっているか」はまずここ**                                                                                                                                                                                              |
| [docs/template-contract.md](docs/template-contract.md) | **テンプレート契約と1つの編集面の要件定義**(2026-09-09・**実装前**): テンプレートが変えるのは中身だけで編集面は変えない、という原則と、それを満たすためにテンプレートが供給すべき9つの契約(スキーマ・オントロジー・初期投影・読み取り/構造化・シーン語彙・焼き付け・ゴール・描画・由来と撤回)。現状は `event-cm` だけが契約を満たし画面が7箇所で分岐している=構造の負債。**製品紹介動画は描画を残して入力を作り直す**(コンポジション・配色・BGMはチューニング済みの資産)、**LPはブランドから作れるようにする**、**CM Makerは畳む**(ローカルファイルのjobストア・`kit`・`campaignJobId`・トップページ)。過去のインスタンスは全て捨てる |
| [docs/video-state-model.md](docs/video-state-model.md) | **動画編集の状態モデルの正本**(2026-08-15 仕様確定・実装前): 編集(brief)→動画プレビュー(baked_brief)→出力(MP4/URL)の**3層の鎖**、「未反映」は正常な状態だから赤にしない(琥珀=未反映・緑=一致・赤=失敗の3色)、差分は**保存形ブリーフのフィールド単位比較**でサーバー1箇所が計算し**マニフェスト**として配る、差分の種類が必要な工程を決める(BGMだけなら反映のみ・数秒)、6つの表示面(プレイヤーの版名乗り・ボタンのバッジ・項目一覧のチップ・絵コンテの点・バーの件数・オールグリーン)の仕様と受入条件。**次に動画詳細画面を触るセッションの出発点** |
| [docs/asset-normalization.md](docs/asset-normalization.md) | **素材の正規化とインベントリの正本**(2026-09-08・**段階1〜7・11(PDF展開)・13実装済み**): 素材の正規化を**サービスの第一価値**として位置づけ。**§5 ファイルと情報の2軸**(ファイルはサービス共通の絶対軸1つ・情報はテンプレートごとのオントロジー。判定は「開けるものか、読むものか」)、**§7.0 基盤はLP・バナー・動画すべての手前にある層**(置けるのは「この会社について真であること」だけ。判定は「その値はLPでも意味を持つか」)、**既定値の4層**(ブランド→テンプレート→システム→設計代替)、ロゴの下位属性と測定、**§8 名前は保存せず導出する・意味は発明しない**、インベントリUIの2段、昇格と基盤のオフ、**§11/§11.1 ロゴ正規化(余白トリミング・白地剥がし・インク面積スケール。測定は取り込み時に無条件、派生素材は承認制)**、**§9.4 PDF展開(中身の画像を子素材にして全件見せる・ダウンロード。モデルには渡さない)**、**§9.5 項目ごとの由来と撤回**。**次に素材まわりを触るセッションの出発点** |
| [docs/logo-entity-lab-integration.md](docs/logo-entity-lab-integration.md) | Labs↔ロゴ正本エンティティ統合の現行仕様・残課題・ランタイムassetの暫定手動運用                                                                                                                                                                                                                                                                                                                                                    |
| [docs/launch-plan.md](docs/launch-plan.md)                                 | ベータローンチ準備のマイルストーン(セキュリティ・会員・法務・課金・品質・運用)と進捗チェックリスト                                                                                                                                                                                                                                                                                                                                |
| [docs/costs.md](docs/costs.md)                                             | **運営コストの正本**: API・動画レンダリング・ライセンス・保存/配信費の単価、実測、試算、未調査項目                                                                                                                                                                                                                                                                                                                                |
| [docs/device-mockup-fixes.md](docs/device-mockup-fixes.md)               | **デバイスモックアップの正本と残課題**: 「このサービスをPCとスマホに映したもの」を描く実装は `deviceMockupHtml()` の1つだけ、というLP共通部品の規則                                                                                                                                                                                        |
| [docs/demo-assets.md](docs/demo-assets.md)                                 | **デモ素材の正本**(2026-08-26 再構成): デモに出る素材は「誰が使っても権利上問題がないもの」だけなので、商用利用可プランの生成AIで作る。**プロンプトは使い捨て・要件は残す**——素材が届いた§は削除するので、この文書の§は**いま何を待っているかの一覧**。**§2 塗りごとに別プール**(墨は黒で落とし標準は白で持ち上げるので、1枚を両方で使うと両方で悪くなる)、**§3 バイトはコミットする**(BGM/SFXと逆——生成物は同じプロンプトでも復元できない)、**§5 消えない要件**(スロット・照明族・禁止事項・受け入れ条件)、**§6 いま依頼中のプロンプト**、**§7 文字が要るものは生成AIで作らない**(ロゴ・ダッシュボード・銀行画面はコード) |
| [labs/README.md](labs/README.md)                                           | **研究所群の入り口**: モード分類(保証/探索/統合)・体験レイヤー=課金の階段・ラボ一覧と現在地・ラボ追加手順                                                                                                                                                                                                                                                                                                                         |
| [labs/motion/README.md](labs/motion/README.md)                             | Motion Lab: 16実験カタログ・美的原則・使用技術とLottie比較                                                                                                                                                                                                                                                                                                                                                                        |
| [AGENTS.md](AGENTS.md)                                                     | AIエージェント向けの開発上の注意([CLAUDE.md](CLAUDE.md) はこれを参照するだけ)                                                                                                                                                                                                                                                                                                                                                     |
| [docs/old/README.md](docs/old/README.md)                                   | **アーカイブの索引**。役目を終えた計画・移行の記録(Event CMリファクタリング計画、画像選定計画、v2移行記録 `schema-v2.md` など)はすべてここからたどる。「なぜこの形になったのか」を遡るときだけ読む                                                                                                                                                                                                                            |

このほか [.claude/skills/](.claude/skills/verify/SKILL.md) はClaude Code用のツール定義であり、ドキュメントではない(**読まなくてよい**)。

## ページ構成

| パス                           | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                            | **トップ=すべての入口(旧 `/campaigns` を統合)**。ソース(URL・PDF・画像・テキスト)を渡すとブランド・LP・動画を生成する導線。**アップロードしたものの種別で遷移先が分岐する**: 画像(SVG/PNG/JPEG等)はロゴとして扱い、**SVGは `/logos/[id]/presentation` へ**(この時点のロゴはまだどのBrandにも属していない)、raster画像はロゴ認識するが専用プレゼンは準備中(「準備中」表示)。URL/PDFは確認ダイアログを挟まず生成を開始し、既存のBrand Kit生成LLMが `organization / corporate / business / service / product / media / event` の**カテゴリー(付け替え可能なラベル)**を判定する。**URLを入れると必ずBrandが1つ立つ**(v3 §19.3)。ヒーローは画面高100%・透明ヘッダー・ヒーロー全域D&D対応。下部にブランドカタログとサンプル。管理サイドバーは付かない(管理は `/brands`) |
| `/p/[id]`                      | ロゴプレゼンテーションの閲覧用URL。編集操作は出さず、ロゴの`visibility`とRLSで閲覧可否を決める。将来の明示的なPublication/live URLやユーザー指定URLとは分離できる境界にしている。`/p/sample` はサンプル                                                                                                                                                                                                                                                                                                                                                                          |
| `/organizations`               | **ワークスペース一覧**。所属しているワークスペースを並べ、切り替える。ワークスペースはひとつの世界で、ブランド・成果物・メンバーはその中で完結する(v3 §19.2) |
| `/organizations/[id]`          | ワークスペース詳細。中のブランドとメンバーを表示する。実世界の会社を編集する画面ではない(その情報はBrandのKnowledge claim) |
| `/brand`                       | **ワークスペース設定**。メンバー、権限、所有、公開ハンドル、在庫・発注を管理する。ブランドそのものは`/brands`で扱う                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/assets`                      | アセットライブラリ。自分/所属組織が管理するロゴアセットを一覧し、各アセット詳細へ入る                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/assets/[id]`                 | 旧URL。`/logos/[id]` へ転送し、そこからロゴの詳細へ落ちる。内容はロゴの詳細ページと同じで、現時点ではロゴ正本の編集(正式名称・主体entity・ロゴ形式・役割・親子関係・公開範囲・公開スラッグ・コンタクト表示・タグ・制作クレジット・商標情報・マスターファイル差し替え・**組織への所有移管**・作業履歴)。あわせて**このロゴで現在どのプレゼン asset が採用されているか**、candidate配下のlockup / colorway階層も確認できる。旧 `/brand/logos/[id]` は同じ画面を指す互換URL                                                                                                                                                                                                                                   |
| `/logos/[id]`                  | ロゴの `subject_entity_id` を解いて `/brands/[id]/logos/[logoId]/info` へ転送する。**Brandに属していないロゴ**(トップからのSVGアップロード直後。`create_logo_with_presentation` は `subject_entity_id` を空で作る)はツリー内に住所を持たないので、**この場所で詳細を表示する**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/logos/[id]/presentation`     | **Brandに属していないロゴ**のプレゼン編集。ツリーに入ったロゴの本体は `/brands/[id]/logos/[logoId]`(同じ画面)なので、こちらはトップからアップロードした直後の行き先として残る。保存後の閲覧確認は`/p/[id]`で行う                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/campaigns`                   | 旧CM Maker入口。現在は **`/` へリダイレクト**(トップに統合済み)。生成処理中・旧リンク向けの詳細は `/campaigns/[id]` に残る                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/brands`                      | **ブランド管理の主要画面**。共通の左ペインにOrganization→Brand→ロゴ／LP／動画をネスト表示(Organization > Brand Entity > ロゴ一覧／動画一覧／LP一覧 > 個別アイテム)し、右ペインだけをURL単位で切り替える。**各行末尾の「…」メニューから詳細・複製・削除**(下記「サイドバーの行メニュー」)。旧`/businesses`は互換リダイレクト                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/brands/[id]`                 | **ブランドトップ**。4セクション: ブランド基本情報(name/description/industry/location/website)、**わかっていること**(取得の枠の全項目を**採用/推定/まだわからない**の3状態で出す。正本は [lib/brand/capture-frame.ts](lib/brand/capture-frame.ts))、**サイトから取り込んだ画像**(実画面のスクリーンショット・キービジュアル・地紋)、3タイル(動画/LP/ロゴ)へのエントリ。「サイトから取り込む」は `POST /api/brands/[id]/recapture` でサーバー側が実画面を読み直し、実測した表現だけを採用して人の確定値は触らない。**ブランドアセットは名前の付いたスロット**(ロゴ / キービジュアル)で並び、**無いものは「未指定」と言う**([components/brand/BrandAssetSlots.tsx](components/brand/BrandAssetSlots.tsx))——節ごと消えていると「まだ指定していない」と「その概念が無い」が区別できないため。**動画詳細も同じコンポーネントで同じ体裁**を出すので、その動画が自社ではなくパートナーのマークを使っていることが見比べずに分かる。ブランドのキービジュアルは `brand_materials.kind='keyvisual'`(`category` は「写っているもの」なので別物)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/brands/[id]/logos`           | ロゴ一覧。`brand_organization_id` 配下の brand_entity 全員のロゴをまとめ、サムネイル + visibilityで表示。クリックで本体(プレゼンテーション)`/brands/[id]/logos/[logoId]` へ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/brands/[id]/logos/[logoId]`  | **ロゴ本体=プレゼンテーション**(`/p/[id]` と同じ画面を埋め込み、編集権限があれば編集可)。ツリーのロゴ行はここを開く。masterがラスターでプレゼンが無いロゴは、画像を1枚大きく出して「準備中」と言う([RasterLogoView](app/(management)/brands/[id]/logos/[logoId]/RasterLogoView.tsx)) |
| `/brands/[id]/logos/[logoId]/info` | ロゴの詳細(=`LogoInfoPage` の埋め込み)。基本情報・プレゼン構成・アセット構造・所有者・マスターファイル・タグ・クレジット・商標・作業履歴を編集。入口はサイドバー行メニューの「詳細」だけ(下記「本体と詳細」)。旧 `/logos/[id]` はここへ転送される |
| `/brands/[id]/lp`              | LP一覧(`tool_kind='lp'` の campaign-lp Take)。生成済みLPはテンプレート+テーマで一覧化、未生成なら「CM Makerで作る」ガイド                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/brands/[id]/lp/[jobId]`      | Brand配下のLP本体。v2では末尾にTake IDを使い、private Artifactの短期署名preview、Publicationによる公開・公開終了・履歴を管理する。旧job ID URLは従来画面へフォールバックする。`/info` を付けると詳細(テンプレート版・HTMLの容量・preview/公開URL・公開履歴。読むだけ)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/brands/[id]/video`           | **動画ポータル**。このブランドが持つ動画の一覧と「＋動画を追加」。**作成は経過を流す**——`POST /api/brands/[id]/videos` は NDJSON を返し、工程が始まるたびに1行(`3/3 動画を保存しています`)が右下のカード([RunOverlay](components/pipeline/RunOverlay.tsx)・段の実行と同じ部品)に積まれる。イベント紹介動画の作成はシード読み・LLMでのナレーション執筆・保存で**40秒前後**かかり、以前は「動画を作成しています…」のバーだけだったので**止まったのか動いているのか区別が付かなかった**。割合は出さない(LLM呼び出しに正直な割合は無い)が `3/3` は事実なので出す。**検証の失敗はストリームの前**なので従来どおりステータスコードで返り、**作業中の失敗は最後の1行**(`{"type":"error"}`)で返る。テンプレート選択時は同じブランドの既存 event-promo Take からコピーしてブリーフ+素材を引き継ぐ経路も選べる |
| `/brands/[id]/video/[videoId]` | Brand配下の動画本体(プレイヤーと編集は一体のまま)。`/info` を付けると詳細(テンプレート・状態・画面と尺・MP4の容量と書き出し日時・公開URL・Take ID。読むだけ)。末尾はTake ID。プレイヤーの直下は**絵コンテ**(シーン=映像1枚のワイヤーフレーム。クリックで拡大し、そのシーンの項目をその場で直す)。ページ上部の**4段パイプライン(入力・抽出/構造化/マッピング/出力)**は**ドロワーで開いて中で作業する**——資料の投入、読み取り、構造化、動画への反映、事実の修正がすべて段の中で完結する。各ドロワーは**自分の実行**と**次の段へ進むボタン**を持ち、進むボタンは**次のドロワーを開いて同時にその段を実行する**(slide-factoryの`navigate()`→`start...()`と同じ順序)。**何が押せて、押せないときは何と言うかの正本は [lib/pipeline/stage-actions.ts](lib/pipeline/stage-actions.ts)**(テストは [stage-actions.test.ts](lib/pipeline/stage-actions.test.ts))——マッピング段の「進む」は**映像段**へ進み、`pendingFilmSteps` が返した工程だけを通す(ラベルもそこから作るので「読み上げる・動画に反映する →」のように残り工程を言う)。**資料が1件も無くても映像段は押せる**(シード済みTakeはブリーフを持っているため。資料の有無が門になるのは読み取り側だけ)。読むことは反映することではないので、成功して終わりの行き止まりを作らない。一括実行(**「動画を作り直す」**)はバーの外。**未処理があればバッジで件数を出し、無ければグレーになるが押せる**——押すと最初からもう一度全部走る。段の中身はLLM呼び出しなので、「全部済んでいる」と「もう一度頼みたいことが無い」は別のことだから(資料が1件も無いときだけ無効)。**このボタンはMP4を含まない**(下記「絵コンテは作業場、プレイヤーは成果」)。ドロワー内の**段ごとのボタンは、やることが無ければ無効になる**(「すべて読み取り済みです」と理由を出す)。**時間のかかる処理は必ず画面上端にバーと文言が出る**([components/pipeline/BusyBar.tsx](components/pipeline/BusyBar.tsx))——資料の登録、ナレーションの執筆・読み上げ、MP4の書き出し、事実の修正まで全部。**割合は出さない**(LLM呼び出しに正直な進捗率は無く、90%で止まる数字は無いより悪い)。段の実行はさらに右下のカードで何が見つかったかが見え、`take_runs` に永続する。**実行ログは要約しない**: 行を開くと入力・出力・使用量・エラー・所要時間がそのまま出て、1件ずつでも全件でもコピーできる([components/pipeline/TakeRunLog.tsx](components/pipeline/TakeRunLog.tsx))。イベント紹介動画(`event-cm`)はナレーション駆動で、ナレーション・字幕・尺・読み上げが連動する。Product CMでvoiceが未固定のときは「CM Makerで再生成する」ボタンが出る |
| `/campaigns/[id]`              | 生成処理中および旧リンク向けの互換詳細。完成したLP・動画の正規管理導線はBrand配下のURLを使う                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/c/[id]`                      | 生成されたセールスページの正規URL(`/p/[id]` と対称の opaque ID・所有者を含まない)。LPは `kit.theme` の**デザインテーマ(7種・業種からLLMが自動選択、正本は [lib/campaign/themes.ts](lib/campaign/themes.ts))**で描画される。各テーマは**4つのLPテンプレート**のどれかに割り当てられ、テンプレートは互いにスキンではなく別デザイン(下記「LPテンプレート」参照)。テーマはkitに保存されるため後から変更・再レンダリングできる。`/c/sample` はサンプル。新規URL生成はv2のTake IDを正規URLに使い、サーバーが`publications.status='live'`を判定してprivate R2のHTML Artifactを返す。v2テーブルはanonへ開かない |
| `/v/[id]`                      | 公開動画の恒久URL。Take IDだけを含み、`publications.status='live'`のcanonical Publicationとready MP4が揃う場合だけprivate R2 ArtifactをRange対応で配信する                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/settings`                    | Accountページ。ユーザー情報表示・プロフィール編集枠・登録アカウントの退会導線。退会時は個人所有データとR2成果物を削除し、共同組織の資産は残す                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/[handle]/[slug]`             | バニティURL。組織ハンドル+ロゴスラッグを正規パーマリンク `/p/[id]` に解決(公開ロゴのみ)。将来はキャンペーン(`/c/[id]`)も同じ共有名前空間で解決する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/labs`                        | **研究所インデックス**(noindex)。表現R&Dを保証/探索/統合モードで分類する。稼働中は [Motion Lab](labs/motion/README.md)、[Workflow Lab](labs/workflow/README.md)、[Generative Lab](labs/generative/README.md)。[Campaign Lab](labs/campaign/README.md) は CM Maker(トップ `/`)へ卒業済み。全体像は [labs/README.md](labs/README.md)。旧 `/lab` → `/labs/motion`、旧 `/labs/image` → `/labs/workflow`、旧 `/labs/campaign` → `/`(旧 `/campaigns` も `/` へ)リダイレクト                                                                                                                                                               |

URL体系の設計意図(所有者を含まない壊れないパーマリンク等)は [docs/account-design.md](docs/account-design.md) を参照。

### サイドバーの行メニュー(詳細・複製・削除)

`/brands` の左ペインの各行(Brand / ロゴ / 動画 / LP)は末尾に「…」メニューを持つ。**ペインの見出しは現在のワークスペース名**で、その上の行にある「…」からワークスペース詳細と切り替えへ行く(Organizationは行ではなく、ツリーが描かれている世界そのもの)。**ブランドの追加はツリーの下の「＋ ブランドを追加」**で、トップ `/` と同じURL入力をダイアログで開き、いま表示しているワークスペースにブランドを立てる([components/management/AddBrandDialog.tsx](components/management/AddBrandDialog.tsx)。PDF・テキスト・ロゴ画像の入力はトップだけ)。**何ができて、できないときは何と言うかの正本は [lib/brand-tree-actions.ts](lib/brand-tree-actions.ts)**(テストは [lib/brand-tree-actions.test.ts](lib/brand-tree-actions.test.ts))。

- **本体と詳細**。ロゴ・動画・LPの各行は、行そのものをクリックすると**本体**(ロゴはプレゼンテーション、動画はプレイヤー+編集、LPはプレビュー)を開き、メニューの**「詳細」**で**そのアセットについての文字の頁**(`…/info`)を開く。詳細は形式・容量・尺・公開URLといった二次情報で、本体の画面にボタンを置くほどのものではないから、入口はこのメニューだけ。骨組みは [components/management/InfoPage.tsx](components/management/InfoPage.tsx) で共通、値が無い項目は消さず「—」と言う。Brandに詳細は無い(Brandの事実はKnowledge claimであり、`/brands/[id]` がそれを見せる)
- **コンテナは上から空にできない**。Organizationの削除はブランドを連れて行かず、Brandの削除は動画を連れて行かない。中身があるときは項目を消さず、**無効化して理由を出す**(「ブランド2件を別のOrganizationへ移すか削除してください」)。これは独自ルールではなく、`brand_entities.brand_organization_id` / `takes.brand_id` / `works.brand_id` / `brand_materials.brand_id` が `on delete restrict` であることをそのまま日本語にしたもの。メニューは判定の権威ではなく、**サーバーが同じことをもう一度数える**
- **末端は自分の従属物ごと消える**。動画・LPは `delete_take`(migration 0031)、ロゴは `delete_logo_with_presentation`(mockup purgeを含む既存の repo 経路)。公開中(`publications.status='live'`)の動画・LPは削除できず、先に公開終了が必要
- **素材の扱いは削除の途中で聞く**。`delete_take` は「このTakeだけが持っている素材(upload / url_fetch / ai_generated)」があると `TAKE_DELETE_NEEDS_MATERIAL_DECISION` で止まる。ダイアログはその応答を受けて**確認から質問へ変わり**、`promote`(ブランドへ格上げして残す)か `discard`(R2のファイルも消す)を選ばせる。事前に聞かないのは、危険な素材を持たないTakeが大半のため
- **複製は動画とLPだけが持つ**。新しいTakeが同じ`brief`と同じ`take_inputs`(同じmaterial・同じchecksum)を指すので、R2は1バイトもコピーしない。テンプレート版は**現行のproduction版**に固定され、レンダーは空から始まる(元のMP4を引き継ぐと「このbriefから出た成果物」だと嘘をつくため)。名前は`「元の名前」のコピー`→`のコピー2`と重複を避けて増える([lib/takes/naming.ts](lib/takes/naming.ts))
- Organization / Brand / ロゴに複製が無いのは意図的。器のコピーは中身を持たず、ロゴの複製はmaster SVGと新しいプレゼンTakeを作る別機能になる(残タスク参照)
- R2の後片付けは `delete_take` が返すキーをその場で消し、消せなかったものは `private.r2_deletion_queue` に残して `npm run r2:prune` に回す。**キューを空にするのは service_role** なので、`SUPABASE_SERVICE_ROLE_KEY` が無い環境ではオブジェクトだけ消えて行が残る(削除自体は成功扱い——それが正しい)

ヘッダーのハンバーガーメニューは、未登録ユーザーには`Home`だけを表示する。本登録ユーザーには`Brand Manager`も表示し、`platform_admin`または`labs_member`を持つ場合だけ`Labs`を追加する。生成導線(CM Maker)はトップ`/`=`Home`そのものなので、独立した`Campaigns`項目は持たない。トップ全域が透明ヘッダーでヒーローに馴染み、ヘッダーは非stickyでスクロールとともに退く。アバターメニューはメールアドレス、`Account`、`Sign out`だけを表示し、プロダクト内ナビゲーションと分離する。

## プレゼン構成モデル

このプロダクトでは、プレゼンテーション本編を**固定実装の寄せ集め**としてではなく、**presentation asset catalog から組み立てるドキュメント**として扱う。

- 各 motion / mockup / generated asset はLabs共通カタログに入り、提供側の成熟度 `draft / production` と「どの presentation placement に入れられるか」を持つ
- `draft` はLabだけ、`production` はLabと利用者向けプレゼン編集UIに表示する
- 各ロゴはproduction assetについて「その placement に何を表示するか」という **per-logo の layout**(`enabled / order / params`)を持つ
- ラボは未完成・完成済みを含む全assetを置き、productionへ昇格できる品質かを判断する場である
- 将来的には利用者自身がこの catalog から構成を選び、プレゼンを後編集できる。現行実装もその前提で設計している

現時点での presentation placement は `splash.hero` / `web.device` / `social.primary` / `onsite.primary` / `merch.primary` / `generated.tile`。`web.device` はWorkflow LabのPC・モバイル端末モックアップ用で、現在はDraftとして手動作成を検証中。特にラボとの接続が強いのは後半の mockup / generated 系 section で、Production assetは **07 Social / 08 On-site / 09 Merchandise / 10 Generated** が asset catalog から描画する。Webの端末モックアップは品質判定と出力アダプター接続後に本編へ昇格する。

## 生成されるプレゼンテーション(`/p/[id]`)

**トップ `/` でSVGロゴをアップロードする**(ヒーロー全域へのドラッグ&ドロップ、またはカードから選択)と、以下が1本のガイドラインドキュメントとして生成され、この画面へ遷移する。アップロード受理からプレゼンが開くまではローディングバーで橋渡しする。冒頭に Splash(オープニングアニメーション)と Contents(目次)、続いて番号付きの10シーンが並ぶ。(PNG/JPEG等のraster画像もロゴとして認識するが、raster向けプレゼンは準備中。)

| #   | シーン              | 内容                                                                                                                                                                                                                                                                          |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Splash              | 巨大タイポ + ロゴマークのオープニング演出(スクロールキュー・リプレイ/一時停止)                                                                                                                                                                                                |
| —   | Contents            | 全シーンへ飛べる目次ナビ                                                                                                                                                                                                                                                      |
| 01  | The mark (Identity) | ロゴの意味・最小サイズ・余白などアイデンティティの基本                                                                                                                                                                                                                        |
| 02  | Construction        | ベジェのアンカー/ハンドルを実データから抽出して可視化                                                                                                                                                                                                                         |
| 03  | Color               | 面積加重で色を自動抽出し、HEX/RGB/CMYK付きカラーバンドに展開                                                                                                                                                                                                                  |
| 04  | Logo usage          | 配色パターングリッド(白地/ブランドカラー地/黒地/白抜き)                                                                                                                                                                                                                       |
| 05  | App icon            | iOS風アイコンと配色バリエーション                                                                                                                                                                                                                                             |
| 06  | Web                 | ブラウザクローム内ファビコン + 48/32/16pxサイズランプ                                                                                                                                                                                                                         |
| 07  | Social              | Social placement に採用された asset 群。既定では認証バッジ付きプロフィールカードのモックアップ                                                                                                                                                                                |
| 08  | On-site             | On-site placement に採用された asset 群。既定ではラニヤード付き社員証モックアップ                                                                                                                                                                                             |
| 09  | Merchandise         | Merchandise placement に採用された asset 群。既定ではTシャツへのmultiply合成(コードベースの精密配置)。Workflow Lab で作った名刺・トート等もここへ採用可能                                                                                                                     |
| 10  | Generated           | Generated placement に採用された asset 群。既定では Gemini API(Nano Banana)によるマグカップ/トート/キャップの写実モックアップ生成。**手動生成**——各タイルの「生成」ボタンで1枚ずつ(APIコストが発生するため自動生成はしない)。生成済みはロゴ単位でキャッシュされ再生成されない |

ロゴが手元になくても、`/p/sample` でサンプルプレゼンを確認できる。

### プレゼン編集

所有者とロゴ単位で共有された`manager`/`editor`は、ロゴ本体の画面(`/brands/[id]/logos/[logoId]`、Brand未所属なら`/logos/[id]/presentation`)から以下の2層を編集できる。変更は編集中にステージされ、「Save」でまとめて保存される。`/p/[id]`は閲覧専用で、管理操作を表示しない。

- **文言層**: キャッチコピー・ストーリー・各シーンのリード文
- **構成層**: 各 presentation placement にどの asset を採用するか、またその表示順

アセット詳細ページ `/assets/[id]` では、このロゴの**現在の採用 asset 一覧**を確認でき、そこから本編編集へ移動できる。

## 多言語対応

UIコピーは [lib/i18n/](lib/i18n/) の辞書で **en / ja / ko / zh-Hant / zh-Hans の5言語**に対応。ヘッダーの `LanguageSwitcher` で切り替え、選択は永続化され `<html lang>` にも反映される。英語を正本の型([lib/i18n/dictionaries.ts](lib/i18n/dictionaries.ts) の `Dict`)とし、全ロケールが完全な辞書を持つ(実行時フォールバックの穴を作らない)。

## 管理ワークスペース(`/brand`)

白ベースのビジネスSaaS風ダッシュボード。KPI、管理ワークスペース情報、**メンバーの招待・ロール管理(オーナー/管理者/編集者/購買担当/閲覧のみ)**、**公開URLハンドルの設定**、登録アセット、在庫・発注を表示する。ここでいう`public.organizations`は**ワークスペース**(テナント)そのもので、v3ではこれが唯一のOrganization——ブランドツリー・メンバー・権限・上限がここに属する(実世界の会社を表す`brand_organizations`はv3で廃止した)。メール招待は相手がそのメールで登録した瞬間に自動でメンバー化される(SMTP不要)。

ロゴの詳細(`/brands/[id]/logos/[logoId]/info`)では、正本編集だけでなく**そのロゴのプレゼン構成の現在値**も確認する。つまり Brand Manager は「ロゴファイルを持つ場所」だけでなく、**そのロゴがどんなブランドドキュメントとして出力されるか**を見るハブでもある。

## CM Maker(トップ `/`)

最小限のソース(URL・PDF・テキスト)から、サービス紹介の**セールスページ(LP)と30秒CM動画(Phase 0b予定)**を自動生成するプロダクト面で、**トップページ `/` そのもの**(旧 `/campaigns` を統合)。旧 Campaign Lab の卒業先で、**詳細な引き継ぎ資料・パイプライン解説の正本は [labs/campaign/README.md](labs/campaign/README.md)**。2026-07-20時点の骨子:

- **入力の種別で分岐する**: URL/PDF はキャンペーン生成(このセクション)へ。**画像をアップロードした場合はロゴ**として扱い、SVGはプレゼン編集 `/logos/[id]/presentation`、raster画像は準備中の別モードへ回す(生成パイプラインには入れない)

- **Service Brand Kit が核**: ソースから「サービス分析+ブランド(証拠ベースで抽出したパレット・実ロゴ・デザイントークン)+LP全文コピー+CMナレーション」の中間表現を1回生成し、全レンダラー(LP・動画・バナー)がこれを消費する
- **デザインテーマ7種**([lib/campaign/themes.ts](lib/campaign/themes.ts) が正本): tech-glass / minimal-light / corporate-trust / care-warm / friendly-pop / food-casual / luxury-serif。各テーマは対象業種・**どのLPテンプレートで描くか(`lp.variant`)**・**全レンダラー共通のトーン&マナー指示文(`direction`)**を持つ。生成時にLLMが業種からenumで自動選択し、`kit.theme` として保存されるため**後から変更して再レンダリングできる**。キャンバスが暗いテーマかどうかは `isDarkTheme()` が唯一の判定で、管理プレビュー枠とCM動画のパレットがこれに従う(呼び出し側で再計算しない)
- **LPは背景写真に頼らない**: 旧テンプレートは各テーマにストック写真を固定割当していたが、現行の3テンプレート(noir / lumen / editorial)は自前のキャンバスで完結する。[public/campaigns/bg/](public/campaigns/bg/) を使うのは旧 flat/glass に残るテーマだけ
- **UI**: トップ `/` は画面高100%のヒーロー(青いガラス質背景+ソース入力のグラスカード)+透明ヘッダー。**ヒーロー全域がドラッグ&ドロップ対応**で、ドラッグ中は50%白の半透明ヴェールと「ここにドロップ」を表示する。管理UI(詳細 `/campaigns/[id]`)はロゴス本体と同じ白いツールUI(管理サイドバー付き)。生成は非同期ジョブで、ページを閉じても継続する
- **30秒CM動画(Product CM v2)**: ナレーションは5シーン構造(`cm_script`)で生成され、シーンごとのTTS(Gemini)→タイミングJSON→**Remotion**で組み立てる。TTS後はWAVをTakeスコープのMaterial、タイミングとBrand Kitを`product-cm@2` briefへ固定し、MP4をprivate R2 Artifactとして保存する。以後の再生成はローカルjobファイルに依存しない。管理画面のPlayerは署名付きprivate配信、明示公開後は`/v/<takeId>`がRange対応で同じArtifactを返す。Chromiumが動かないホスト(Vercelのサーバーレス)ではMP4を作成できないため、クラウド化はRemotion Lambda(AWS)採用予定。`CAMPAIGN_TTS_MOCK=1`でAPIキーなし開発可

## LPテンプレート(4種・デザイン優先)

生成LPの見た目の正本は [lib/campaign/render-lp.ts](lib/campaign/render-lp.ts)(エントリとテンプレート選択)と各テンプレートファイル。**テーマは「どのテンプレートで描くか」を決めるだけで、テンプレート同士はスキンの差ではなく別デザイン**——独自のタイポグラフィ体系とセクション構造を持つ。

| テンプレート  | 実装                                                         | 割り当てテーマ                              | 狙い                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **noir**      | [lib/campaign/lp-noir.ts](lib/campaign/lp-noir.ts)           | tech-glass                                  | 米国のAI・ロボティクス製品ページ。漆黒キャンバスにオーロラ状の発光とフィルムグレイン、巨大なグラデーション見出し、英字モノのマイクロラベル、bentoグリッド、ロゴマーキー           |
| **lumen**     | [lib/campaign/lp-lumen.ts](lib/campaign/lp-lumen.ts)         | minimal-light / corporate-trust / care-warm | 明るいプレミアムSaaS。白キャンバス+ヘアライン、左寄せ非対称ヒーロー、反転した黒帯のクロージング。信頼を先に立てる業種(業務ツール・金融・医療)向け                                 |
| **editorial** | [lib/campaign/lp-editorial.ts](lib/campaign/lp-editorial.ts) | luxury-serif                                | 作品集の佇まい。墨の紙面にアクセント1色を金として差し、Cormorant/しっぽり明朝を大きく細く組む。角丸・発光を一切使わず罫線と余白で構成。アート・ラグジュアリー・ホスピタリティ向け |
| **classic**   | [lib/campaign/render-lp.ts](lib/campaign/render-lp.ts) 内    | friendly-pop / food-casual                  | 従来の明るいSaaSレイアウト(`flat`)とそのダーク版(`glass`)。取得したデザイントークン(フォント・角丸・余白)を実際に適用する唯一のテンプレート                                       |

- **共通部品は [lib/campaign/lp-kit.ts](lib/campaign/lp-kit.ts) が正本**: デバイスモックアップ、クライアントロゴウォール、実績数値の桁分割、セクション有無の判定、サンプル注記。テンプレートが再実装してはいけないものはここに置く
- **全テンプレートが守る不変条件**(テストは [lib/campaign/render-lp.test.ts](lib/campaign/render-lp.test.ts)):
  - **`<script>` を出さない**。管理画面のサムネイルは同じHTMLを `sandbox=""` の iframe で描くため、スクリプト依存の演出は2つの面で違うものが表示され、片方しかテストされない。マーキーもスクロール演出もCSSだけで組む
  - **ヒーローのキービジュアルは共通のデバイスモックアップ**([lib/campaign/lp-kit.ts](lib/campaign/lp-kit.ts))
  - **動画スロットのマーカーを残す**。`/c/[id]` が配信時にMP4を差し込む/撤去するため
- **デザイントークンは新テンプレートでは意図的に無視する**: ブランドから引き継ぐのは色(primary/accent)だけで、取得した14pxの本文フォントや角丸は継承しない。1顧客ごとに変わるべきなのは色であって組版ではないため
- **クライアントロゴウォールは幾何マーク+書体の作り分け**: LLMが出す架空のクライアント名を素の文字列で並べると「ロゴの列」ではなく「単語の列」に見えるため、8種のマークと6種のワードマーク書体を名前ごとに割り当てる(画像は一切持たない)

## 動画は一等アセット(テンプレート制)

動画の正本は**`takes` → `take_renders` → `render_artifacts`**であり、1ブランドが複数の動画Takeを持てる。テンプレート台帳の正本は [lib/templates/catalog.ts](lib/templates/catalog.ts)、Product CM briefの契約は [lib/templates/brief-schemas.ts](lib/templates/brief-schemas.ts)。旧`brand_assets`系テーブルと互換読み取りはmigration 0042で廃止済み。

- **テンプレートは作成時に決まり、あとから変更できない**。シーン構成と素材スロットが変わり、将来の構造化プロンプトも変わるため(slide-factoryが物件の`deliverable`を固定するのと同じ契約)。現在は `product-cm`(製品紹介動画・課題解決型30秒CM)、`event-promo`(イベント動画・30秒PV・読み上げなし)、`event-cm`(**イベント紹介動画・ナレーション駆動**)
- **「未作成 / プレビュー可 / MP4あり」の導出は [lib/video/asset.ts](lib/video/asset.ts) の `videoState()` だけ**(テストは [asset.test.ts](lib/video/asset.test.ts))。一覧と詳細が別々に導出していて食い違っていた(Takeパイプラインで書き出した製品CMが、一覧では「未作成」・詳細では「MP4あり」)。**分岐にテンプレートIDを書かない**——違うのは台帳が宣言する `playableFromBrief` 1つで、製品CMは読み上げが固定されるまで尺が無いので`false`、イベント2種は`true`
- **画面に見える動画は必ずTake**。Product CMも追加またはTTS開始時に冪等作成され、実体のないプレースホルダーやjob IDを動画IDとして扱う経路はない。パブリッシュは任意で、既定は未公開
- **Takeの`brief`と固定済み`take_inputs`が作成後の正本**。`event-promo`は`EventBrief`、`product-cm@2`はBrand Kit・ナレーションタイミング・WAV Material参照を持つ。バンドル済みeventブリーフ([remotion/event/briefs/](remotion/event/briefs/))はseedであり、作成時に複製される
- `videoId` は常にTake ID。Product CMが参照するローカル生成job IDは`brief.campaignJobId`に閉じ込め、エンティティIDと混同しない
- **書き出したMP4の正本はR2**(`brands/<brandId>/takes/<takeId>/renders/<renderId>/...mp4`)。ローカルフォールバックを持たない。キー設計は [lib/video/storage.ts](lib/video/storage.ts)、共通レンダー採用処理は [lib/takes/render.ts](lib/takes/render.ts)
- **CLIのbundleは `@/` を解決できるようにしてある**([remotion.config.ts](remotion.config.ts))。以前はコンポジションが `@/` を避けることで回避していたが、それはテンプレートが自己完結している間しか成り立たない規則だった——event-cm は `@/remotion/kit/*` から組まれるので**そもそもbundleできず**、`event/` が kit の関数を1つ借りた瞬間に event-promo も巻き添えになる。alias を1回宣言するのが正しい形で、書き出したプロジェクトも同じ override を自分の `src/` に向けて持つ
- **event-cm のMP4は 2026-08-16 に接続した**(それまで `produce()` に arm が無く、`Root.tsx` にも未登録だった——壊れたのではなく最初から繋がっていなかった)。`renderEventMp4` は event-promo と共有し、違うのはコンポジションIDだけ。**尺は定数にしない**(`calculateMetadata` が `eventCmDurationInFrames` を読む)——固定値だと、ナレーションを長くした瞬間に動画が途中で切れる
- **ブリーフのパスは2種類あり、レンダー時に両方を用意する**([lib/takes/render.ts](lib/takes/render.ts) の `stagePoolAssets`)。`material:<uuid>` はR2から一時ディレクトリへ降ろされるが、`defaults/bgm/...` のような**このリポジトリの静的ファイル**は降りてこない——レンダーは `--public-dir` を空の一時ディレクトリに向けるので、**既定プールが音楽と画像を持ち始めた日に404になった**。CLIから直接書き出すと通るのに画面から書き出すと落ちる、という形で出る
- **レンダラーの標準出力を捨てない**([lib/video/remotion-cli.ts](lib/video/remotion-cli.ts))。**Remotionは致命的なエラーをstdoutに出す**(404はそこに来る)。stderrだけを拾っていたため、404で死んだレンダーが「zodのバージョン警告」として報告され、**エラーメッセージが実際の原因と無関係**になっていた。報告する行は末尾ではなく`Error`を含む行を優先する——致命的なエラーの後ろにはスタックとバージョン表が続くため
- **`zod` は完全固定**(`4.3.6`)。Remotionは一致を要求し、`^`のままだと次の`npm install`で 4.4.x に戻って**MP4だけが黙って壊れ直す**。`npx remotion versions` が唯一の判定
- 配信は `GET /api/brands/[id]/takes/[takeId]/renders/[renderId]/output`。`<video>` はAuthorizationヘッダーを送れないため、オブジェクトキーまで束縛した**署名付き同一オリジンURL**を発行し、Range要求にも対応する。本番では `LABS_OUTPUT_URL_SECRET` が必須
- レンダーは `POST .../render` で非同期。進捗は`take_renders.status`、採用成果物は`latest_artifact_id`が指す不変`render_artifacts`行で追跡する

### 捏造の方針(全テンプレート共通・2026-08-17 決定)

**空欄を見せない。決めつけて埋め、埋めたことを名乗る。** 正本は event-cm の [lib/templates/event-cm/seed.ts](lib/templates/event-cm/seed.ts) で、**他のテンプレートはすべてこれに倣う**。

利用者は受け身で、現れたものに反応する。だから `XXX` や「未定」が並んだ画面は、何も始められない画面になる。与えられた情報(ブランド・業種・投入された資料)から**惜しい値**を作って入れ、`provenance` に `inferred` と記録し、一覧で「仮に入れた値」と表示する。**間違っていてよい**——訂正は5秒で終わり、空欄を見せられた人が最初の1行を書き始めるより速い。

**配慮するのは人と日時の2つだけ。**

- **人名は「実在しそうな名前」を発明しない**(2026-08-30 に線を引き直した)。推測の日付は「訂正される提案」だが、推測の氏名は**存在しない人物を1人作る操作**であり、しかも [place-images.ts](lib/templates/event-cm/place-images.ts) は氏名の根拠が揃った写真を `guests[n].photo` に入れるので、**架空の名前と実在の顔が結びつく経路がある**。
  - 以前はこれを理由に**役割だけ**を提案していた(「ゲストスピーカー」「モデレーター」)。だが**シードされた動画は、見て決めるための見本**であり、役割名2つで埋まった登壇者シーンは**このテンプレートが登壇者をどう見せるかを見せていない**。だから**山田太郎 / 山田花子**——日本語の John Doe で、誰も実在の予約とは読まない——に置き換えた(依頼主判断)。**規則は「氏名を出さない」から「実在と取り違えられる氏名を出さない」へ**移った
  - 所属も同じ線で引く。**ゲストは架空の会社**(株式会社サンプル)、**モデレーターはそのブランド自身の名前**——外から呼ぶのがゲストで、司会は主催、という実際の形をそのまま写している。**組は `role` の1フィールドに改行で入る**(会社\n肩書き)。両方の見せ方が `white-space: pre-line` で組むので、これがそのまま 名前 / 会社 / 肩書き の3段になる
  - **変わっていない部分**: 写真には「（見本）」が付き、**注記は名前には付かない**(名前は読み上げられる事実なので、付けると声が「見本」と言う)。出典はすべて `inferred` で、項目一覧が「これは道具の推測です」と言う。そして**資料から実在の登壇者を読めば、この2人は丸ごと置き換わる**
- **日時は現実に存在する日付から選ぶ**。`proposedDate()` は4週間後の最初の金曜日。どのイベントにとっても間違っているが、提案する価値があるくらいには当たっていて、即座に直せる

**ナレーションのダミーは、読んで仮だと分かる文にする。** 事実の欄は一覧で「仮に入れた値」と並ぶから仮だと分かるが、**字幕帯に出た文章にはそのラベルが付かない**。「9月18日、渋谷でお待ちしています」は仮に見えないが、「開催日と会場をお伝えします」なら仮に見える。

**公開の手前だけは数える。** プレースホルダーだと読めるのは、作っている本人が編集画面で見ているときだけで、`/v/[id]` や書き出したMP4ではその文脈が消える。編集中は自由に埋め、公開ボタンの手前で `inferred` の件数を1回言う。

**提案してよいのはシードだけ。** ここが繰り返し取り違えられてきた点で、工程によって答えが逆になる。**どの工程の話をしているかを先に決めれば、この議論はもう起きない。**

| 工程 | 提案するか | なぜ |
| --- | --- | --- |
| **シード**([seed.ts](lib/templates/event-cm/seed.ts)) | **する** | 何も渡されていない段階。ここで埋めないと空欄の画面になる |
| **抽出**([structure.ts](lib/templates/event-cm/structure.ts)) | **しない** | 資料を読む工程。書いていないことを読んだと言うのは、提案ではなく誤読 |
| **ナレーション執筆**([narration.ts](lib/templates/event-cm/narration.ts)) | **しない** | ブリーフにある事実だけを話す。ここで足した事実は**項目一覧に無いので直せない**——直せない値は提案ではない |

だから `structure.ts` の「人名は絶対に捏造しない」と `narration.ts` の「事実を捏造しない」は**この方針と矛盾しないので残す**。捏造するのはシードであって、読み手と語り手ではない。

**テイクの外へは持ち出さない。** 提案した値が自由なのは**そのTakeの中**まで。BrandKnowledge(その会社について真であること)へ書き戻さない規則は [docs/deliverable-architecture.md §4.1](docs/deliverable-architecture.md) が持ち、**そちらは今も有効**。仮の開催日が「この会社の事実」に昇格すると、次のLPがそれを引く。

> **この節は event-promo の旧原則「事実は捏造しない/未定はデザインされた省略」を置き換えたもの**(2026-08-17)。旧原則は2つの別の規則を1文にまとめていたため、テンプレートごとに逆の実装が並立し、同じ議論が繰り返し起きた。分けて書く: **レンダラーは無いものを描かない**(今も正しい)。**生成は無いものを提案する**(こちらが上書きされた側)。

## イベントPVテンプレート(event promo)

CM Makerが**製品・サービス軸**の課題解決型CMを作るのに対し、こちらは**イベント・セミナー軸**のプロモーション動画テンプレート。読み上げを持たず、BGMとタイポグラフィで成立させる(SNSのミュート再生が主戦場のため)。1本目の実案件は「世界が恋する日本酒」(レオパレス21 × WealthPark Lab)。

- **データ契約は [remotion/event/types.ts](remotion/event/types.ts) の `EventBrief`**。文言・日時・ゲスト・プログラム・ロゴ・写真スロットを持つ構造化データで、現時点では手書き(Slackの雑文+フライヤーから起こす)。将来は抽出・構造化パイプラインが生成する
- **設計原則: スタイルは決めつけて作りきる**。アートディレクション(和モダン・ラグジュアリー=墨黒×金×明朝)、配色、モーション、コピーの圧縮は勝手に決める。**事実の扱いは上記「捏造の方針」に従う**(このテンプレートのブリーフは現時点で手書きなので、提案で埋める経路をまだ持たない)。**レンダラーは無いものを描かない**——`schedule.venue: null` は画面から消える。これは設計であって穴ではない。ここで言う「描かない」は**与えられなかった値を出さない**という意味であり、**提案しない**という意味ではない(旧版はこの2つを1文で言っていた)
- **すべての素材スロットに設計済みフォールバックがある**。ロゴなし→明朝のクレジット表記、人物写真なし→姓一文字の金縁モノグラム、写真なし→墨背景+金粒子。**素材ゼロでも完成した動画が出る**のがこのテンプレートの要件
- **素材の整形は [labs/event/scripts/prepare-assets.mjs](labs/event/scripts/prepare-assets.mjs)** が決定論で行う(LLM不使用)。巨大ストックフォトの縮小、landscape人物写真の焦点指定、そして**暗背景用のロゴ正規化**——不透明な白地JPEGの`knockout`、白プレートから抜かれたロゴの`alphaInvert`、単色SVGの実行時`invert`。パートナーサイトから取得するロゴは取得元URLをこのスクリプトに記録して出自を残す
- 尺は固定タイムライン([remotion/event/palette.ts](remotion/event/palette.ts) の `EVENT_SCENES`)で6シーン30秒。**15秒版はシーン尺の再配分で派生**させる
- **正規の置き場所はBrand配下の `/brands/[id]/video/[videoId]`**。ポータルから「＋動画を追加 → イベント動画」で作る。画面はゴール(動画)を常時表示し、その下に**素材スロットの現在地**——各スロットが素材で描かれているか設計フォールバックで成立しているか——を並べる([components/video/EventVideoWorkspace.tsx](components/video/EventVideoWorkspace.tsx))。スロット導出は [remotion/event/slots.ts](remotion/event/slots.ts) で、これは**充足率スコアではない**(フォールバックは欠陥ではないため)
- `/labs/event` はバンドル済みブリーフの検証台として残る(動画アセットを作らずコンポジションを詰めるため)。**同じワークスペースコンポーネントを描くので二重実装にならない**
- 素材投入→抽出→構造化をドロワーで開く編集体験は次段。現状ブリーフ編集・再レンダー・公開切り替えはTake APIに統一済み

```bash
npm run event:render   # var/event-lab/sake-2026.mp4 へ書き出し
npm run event:studio   # Remotion Studio でシーン単位に確認・調整

# 素材ドロップフォルダ → public/event/<slug>/ へ整形
node labs/event/scripts/prepare-assets.mjs --src <dir> --slug sake-2026
```

**素材はリポジトリに入っていない**(`.gitignore` 参照)。ライセンス写真・実在人物のポートレート・支給BGMをgit履歴へ載せると後から取り消せないため、`public/event/*/photos/` `art/` `bgm.mp3` は除外し、**パートナーロゴ(`logos/`)だけコミットしている**。新しい環境では先に `prepare-assets.mjs` を実行する。sake-2026のブリーフはこれらのファイル名を指しているため、未実行のまま `event:render` すると失敗する(Remotionは画像の欠落でレンダーを止める。「素材が無い」と「ブリーフが null」を区別したいので、この挙動が正しい)。

## イベント紹介動画 - モダンジャパニーズ(event-cm・ナレーション駆動)

`event-promo` と同じ和モダンのアートディレクションを、**ナレーションを背骨にして**組み直したテンプレート。設計判断の正本は [docs/deliverable-architecture.md §18](docs/deliverable-architecture.md)。**2026-08-18 に Freehand Lab の成果を持ち帰り、名称を「イベント紹介動画 - モダンジャパニーズ」に改めた**: シネスコ帯と帯内字幕(`ThemeChrome` / `ThemeCaption.backdrop:"bar"`)、写真を主役にする方向性スクリム(`ThemeBackdrop.directional` × `LayoutSpec.copySide`)、登壇者の全画面分割パネル(`people` の `presentation:"panels"`)、印章numeral(`stat` の `variant:"seal"`・一二三)、和のSFXキューシート([lib/templates/event-cm/sfx-cues.ts](lib/templates/event-cm/sfx-cues.ts)=既定プール [scripts/fetch-default-sfx.mjs](scripts/fetch-default-sfx.mjs) の実測gain×presence)、そして**ブランドから継ぐのは色だけ**(組版はテンプレートのもの——LPと同じ規則を `themeForBrand` が持つ)。**既定素材はシステムの一部**(2026-08-30 依頼主判断)——BGM・効果音・写真・マークはコードと一緒に配布され、コードと一緒にデプロイされる。**利用者がアップロードしたものだけが別管理**(R2・Takeに紐づく)。**BGMはgitに入る**(Sunoの商用プラン生成=自社のもの)。**効果音だけが例外**で、効果音ラボが「音素材そのものの再配布」を禁じており、このリポジトリが**公開**である限りコミットできない。代わりに: ① `public/defaults/sfx/`(この端末。開発とローカルMP4書き出しが読む) ② [scripts/fetch-default-sfx.mjs](scripts/fetch-default-sfx.mjs) **=レシピ**(どの環境でも `npm run sfx:fetch` で復元でき、出典URL・ラベル・用途がコードに残る)。gitが持つのは `catalog.json`(ラベル・出典・実測`headDb`→`gain`)だけ。**自前の私有バケットへ置くことも、顧客のMP4に焼き込むことも再配布ではない**(後者は効果音ラボが明示的に許諾している用途)。現在63音。
  - **⚠ 本番で効果音は鳴らない。** `npm run sfx:sync` はR2の `defaults/sfx/` へ置くが、**それを読む実装が無い**——srcは `defaults/sfx/*.mp3` のまま `staticFile()` を通るので、Vercel上では404になる。**この例外が消える道は2つ**: リポジトリを非公開にする(全部コミットできる)か、効果音を自社生成のものに置き換える(ストック写真を置き換えたのと同じ手)。それまでは効果音は開発機でしか鳴らない

- **語彙は3語に割れている**(migration 0051 で改名)。ここを混ぜると「どちらが正本か」で画面同士が食い違うので、コードもUIもこの3語だけを使う:

| 語 | 実体 | コード |
| --- | --- | --- |
| **ナレーション** | 各シーンの**言葉そのもの**。動画の核で、絵も尺もこれに従う。**常にあり、オフにできない** | `brief.narration`(`EventCmNarration`。旧 `brief.scenario` → 旧 `brief.script`) |
| **字幕** | ナレーションを28字カードへ割った**表示**。文字は1字も変わらず、保存もされない | [remotion/event-cm/captions.ts](remotion/event-cm/captions.ts)(導出のみ) |
| **ボイス** | ナレーションを**声にしたもの**。BGMと同じ階層で、付けても外せる | `brief.voice` / [lib/voice/](lib/voice/) |

**オフにできるのは言葉ではなく、言葉の出力先2つ**(字幕・ボイス)。ここが3語に割れている理由で、`narration` はこのリポジトリで**1つの意味しか持たない**——TTSのモジュールが `lib/narration/` だった頃は、同じ単語が言葉と音声の両方を指していた(2026-08-17 に `lib/voice/` へ移設)。

- **ブリーフは event-promo とフィールドを共有しない**(`EventCmBrief`。[remotion/event-cm/types.ts](remotion/event-cm/types.ts))。共有するのは**値の型**(写真・ロゴ・登壇者・プログラム・日程)だけで、**フィールドの一覧は別**。以前は `extends EventBrief` だったため、`sideCopy` / `visuals.inkArt` / `visuals.texture` という**どのシーンも描かない3つ**を持っていて、それが項目一覧に並んでいた——埋めても画面は何も変わらない。**ブリーフに足したフィールドは、どこかのシーンが読むこと**が以後の規則。地(背景写真)を受け取るのは `visuals.value` / `visuals.programs` / `visuals.closing` の3枚だけ

  以前はこの3つを全部「ナレーション」と呼んでいた。名前が逆向きだったのが原因で、字幕は音声から作られるのか主文から作られるのかが読む場所によって違って見え、実装は正しいのに説明だけが逆という状態が続いた(経緯は [docs/old/event-cm-refactor-plan.md §9.1](docs/old/event-cm-refactor-plan.md)・アーカイブ)。**product-cm はまだ `cm_script` のまま**で、共通語彙にするかは別判断。共有コードの [lib/voice/synthesize.ts](lib/voice/synthesize.ts) はどちらの綴りも知らない(渡された言葉を読むだけ)

**「このブリーフはどんな映像になるか」の唯一の導出は [remotion/event-cm/film.ts](remotion/event-cm/film.ts) の `eventCmFilm()`**。レンダラー(`EventCmComposition`)・絵コンテ(`eventCmStoryboard`)・ナレーション/音声APIはすべてこの戻り値を読み、suppression・尺・部品・字幕を自分で導出しない(消した項目を空にする `applySuppression` は film の非公開ステップで、他から呼べない)。変えてはいけない契約はこの節と [docs/data-model.md](docs/data-model.md) が正本で、この構造にした経緯は [docs/old/event-cm-refactor-plan.md](docs/old/event-cm-refactor-plan.md)(アーカイブ)に残る。**編集と反映の状態の見せ方(未反映差分・オールグリーン)は [docs/video-state-model.md](docs/video-state-model.md) が正本**。

- **絵コンテは作業場、プレイヤーは成果**([lib/templates/event-cm/bake.ts](lib/templates/event-cm/bake.ts)、migration 0050)。Takeは2つのブリーフを持つ: `brief` は編集がそのまま溜まる作業中の値、`baked_brief` は**実行が固定した映像**で、**プレイヤーもMP4書き出しも公開URLもこちらだけを読む**。だからナレーションを1行直してもプレイヤーの尺と字幕は動かない——**動くのは「動画を作り直す」を押したときだけ**。一致していないのが正常な状態なので、画面はそれを隠さず**プレイヤーの真下で件数を言う**(「まだこの動画へ反映していない変更が2件あります(項目の変更、ナレーションの変更)」)。差分を答えるのは `bake.ts` 1箇所で、バーの4段目・ボタンの件数バッジ・プレイヤーの注記はその言い換え。**deep equal はしない**——素材URLは読み込みのたびに署名し直されるので毎回「変更あり」になってしまう。比べるのは `factsUpdatedAt` / `narration.updatedAt` / `voice.track.generatedAt` の3つ
  - **一度も実行していない動画は⚠ではなく案内**。`baked_brief is null` が「未実行」で、そのときプレイヤーは作業中の値をそのまま再生する。**追加した瞬間に完成した映像が再生される**という設計はここでも守られていて、画面は「これは下書きのままの再生です。押すと読み上げが付いて尺が確定します」と言うだけ
  - **1つのボタンが通すのは 資料の読み取り → 事実 → ナレーション → 読み上げ → 反映**。**MP4は含めない**——書き出しは要望があったときの別操作で、含めると声を1回試すたびに数分のレンダリングが走る。だからパイプラインバーの4段目も「出力(MP4)」ではなく**「動画プレビュー」**(直列の最後がMP4だと「書き出すまで未完成」に読める)。書き出したMP4が映像より古いときは、**そのMP4の隣で**「このMP4は、いま再生されている動画より古いバージョンです」と言う
  - **ナレーションを直しても音声は消えない**。以前は1行保存するたびに録音を削除していたが、それは「編集は溜まる」に反する(編集の途中で映像が無音に戻る)。古い音声は正常な状態として残り、**差分として言われる**。書き直しは1つのボタンか、ヘッダーの「読み上げ」から
  - **読み上げのオフは記録される**。オフが「ポインタを外すだけ」だと、次の実行が音声を勝手に戻してしまう(「音声は必ずある」と「オフにできる」が衝突する)。オフは他の非表示項目と同じ suppression として `provenance.voice` に記録し、読み上げを頼んだ時点で解除する
  - **複製は `baked_brief` も引き継ぐ**。引き継がないと、音声まで揃ったTakeの複製が「下書きのままです」と嘘をつき、要らないTTS課金が走る。複製に無いのはMP4であって映像ではない

- **絵コンテがマッピングそのもの**。各シーンの下に、**そのシーンが映しているフィールド**が値と一緒に並ぶ(`PanelFacts`)。開催日・開始時刻は締めのシーン、登壇者の写真は登壇者のシーン、**ロゴは冒頭・締め・末尾の3シーンに重複して出る**(実際に3回画面に出るため)。以前は盤面の下に**ブリーフ全体の平らな一覧**「この動画は何でできているか」があったが、それは「何でできているか」には答えても、絵コンテを読む人が知りたい**「どこに載るか」**を落としていた。全体の一覧はパイプラインの**マッピング段のドロワー**に残る(全部を見る場所はそこ)。**盤面の一覧は読み取り専用**で、直すのは従来どおりシーンの中(2つの編集面を作らない)。どのシーンにも載らないもの(BGM・読み上げ・動画名)はヘッダーのボタンが持っているので、「基本情報」セクションは作らない——同じ2つの事実を読む場所を3箇所にしないため。**空の任意項目は盤面に出ない**(映像が描かないので)。それはドロワーの「不足」に並ぶ
- **プレイヤーの真下は絵コンテ**([components/video/Storyboard.tsx](components/video/Storyboard.tsx)、モデルは [lib/storyboard/event-cm.ts](lib/storyboard/event-cm.ts))。1シーン=映像1枚を**1920×1080のアートボードにワイヤーフレームで描き、カード幅に合わせてCSSで縮小**する(slide-factoryのデッキパネルと同じ手法なので、縮小版と拡大版が1実装)。**実物を模写しない**——動く墨の地・金の粒子・タイポの動きは縮小で再現できないので約束しない。忠実なのは絵コンテが読まれる理由の方:どの配置か、何が乗るか、どこに、どの大きさで、何秒、何を読み上げるか。**素材があるものは実画像を描く**(ロゴは映像と同じknockout、登壇者写真は同じ焦点、背景写真は同じ減光)——枠と社名で代用すると、それは代用ではなく**別のデザイン**に見える。**絵コンテが勝手に描く要素にアクセント色(金)を使わない**。この art direction では金は「誰かが決めた」という意味を持つので、ダミーの枠が金だと過去のデザイン案に見える(1シーン目のロゴが実際にそう読まれた)。素材が無いときは映像と同じ設計代替を描く(マークなら明朝のクレジット、登壇者なら金縁モノグラム=これは本物のデザイン)。型の大きさはテーマの型スケール、領域はキットの `REGION_GEOMETRY` から取るので、**テーマや配置を変えると絵コンテが勝手に追随する**
  - **1シーン=1メッセージ=ナレーション1行**。だから字幕がカットをまたがない。**アジェンダは3枚で固定**(`EVENT_CM_PROGRAM_SCENES`)——それぞれが自分の番号(`1 / 3`)と自分の文言と自分のナレーション1行を持つ。番号付きリスト1枚は「1枚に3メッセージ」であり、そのシーンのナレーションは「いろいろあります」しか言えない。プログラムが1つでも3枚のままで、使わない枚は絵コンテから消す(下記「構成はテンプレートが持つ」)。**シーンの同一性は役割だけでは足りない**ので `role + index`([remotion/event-cm/types.ts](remotion/event-cm/types.ts) の `eventCmSceneKey`)——タイムライン・字幕・絵コンテ・ナレーションの行が「どのシーンの話か」で合致する。ナレーションの予算もシーン単位(`eventCmSceneBudget`。1つ目のプログラムだけ全体の前置きを兼ねるので長い)
  - **書きかけのナレーションは正常な状態**。1行だけ保存でき、言葉の無いシーンはそのシーンの想定尺に戻り、字幕はそのシーンだけ出ない。「全シーン揃っていること」を保存の条件にすると、**シーンが増えた直後は1行も保存できなくなる**(3プログラムに割った瞬間、2シーンが空なので毎回400で拒否された)。読み上げだけは全シーン必要で、そのときは`3/6シーン`と数で言う
  - **操作の失敗で画面を奪わない**。読み込めない動画は画面ごとエラーにするが、**保存やRunの失敗はインライン帯**で言う(以前は1行保存の失敗で「← 動画一覧へ」のエラーページへ飛び、編集中の文章も失われた)
  - **シーンが喋るかどうかは映像の形が決める**(`eventCmNarratedSteps`)。ナレーションにその行があるかどうかでは決めない——構成が変わった直後は「喋るのに行がまだ無いシーン」が正常な状態で、そこに編集欄が出ないと書く場所が無くなる。**行を失ったシーンは「使われていない行」として文言ごと画面に残す**(`Storyboard.orphanLines`)。消えたのではなく置き場が無くなっただけなので、そう言う。手で直したナレーション(`source: "human"`)は自動では書き直されないため、**この警告からだけ`force`付きで書き直せる**(「手で直した行も置き換わります」と明示)
  - **シーンの削除はシーンの中でする**([lib/templates/event-cm/panel-actions.ts](lib/templates/event-cm/panel-actions.ts))。何が削除できて、できないときは何と言うかの正本はここ(テストは [panel-actions.test.ts](lib/templates/event-cm/panel-actions.test.ts))。**削除が何を意味するかもテンプレートが決める**——画面は「このシーンを消して」と頼むだけで、`DELETE /api/brands/[id]/videos/[videoId]/panels` が同じ関数を引いてから書く。組み立てを画面側に置くと、ボタンがブリーフの2人目の著者になる。断りは409で、テンプレート自身の日本語がそのまま絵コンテ上の帯に出る。**削除できるかどうかを持っているのは `EVENT_CM_SCENES` の `removable`**——この一覧を panel-actions が持たずに読むのは、メニューとレンダラーが別々の一覧を持てば食い違えるため。消せるのは**登壇者のシーン**と**アジェンダ3枚のうちの1枚**で、タイトル・テーマ・CTA・両端のロゴは削除できず理由を出す(「告知は自分の名前を先に言います」など)。空の枠が残るだけの操作を「削除」と呼ばないため。**削除はすべて suppression**(絵が消えて値は残る・戻せる)。以前はアジェンダだけが例外で `programs` から項目自体を落としていたが、それはシーン数が項目数に従っていたあいだしか成り立たない形だった。**最後に残った1枚は消せない**(枠だけが残るので、そのシーンで内容を直す方が正しい)。**削除は2クリック**で、何を消すのかを名前で言う。**削除するとモーダルは閉じ、結果はページ側の`role="status"`で言う**——消えた面が自分の結果を報告することはできないため(パネルはブリーフが返った瞬間にアンマウントする)。**シーンは位置ではなく「どのシーンか」でReactのkeyを持つ**: 6シーン目を消すと7シーン目が6番になり、同じkeyだとReactが同じインスタンスを再利用して、開いたままのモーダルが別のシーンを表示し、ナレーションの下書きが次のシーンへ持ち越された(保存すれば上書きされる状態だった)
  - **登壇者のシーンは、登壇者を「消す」と消える**。プログラム側で人を語る構成のときはこれで足りる(独自ルールを足していない)。**消した項目は読み上げもしない**——APIはナレーションも音声も`applySuppression`後のブリーフで数える。だから**消すことは事実の変更**で、`factsUpdatedAt` が動く(動かさないと、ナレーションは消えた登壇者の話をしたまま「最新」を名乗り、`bakeState` は差分ゼロと答え、「動画を作り直す」が何もしない)。ブリーフ自体は消さずに保存する(非表示は決定であって削除ではない)プレゼンが1つのメッセージを2枚のスライドに置かないのと同じで、これは製品CM・サービス動画にも共通する原則
  - **シーンを開くとその中身を直せる**。**ナレーションもそのシーンで直す**——モーダルの本文が編集欄で、1行ずつ保存できる。保存するとナレーションは`human`になり(再実行で上書きされない)、**音声も再生中の映像もその場では動かない**(上記「編集は溜まる」)。だから編集欄はそう言う——「保存しても再生中の動画は変わりません。直し終えたら『動画を作り直す』を押してください」。作業の形は「何行か直す → 1つのボタンで通す」で、声だけ差し替えたいときはヘッダーの『読み上げ』から。モーダルは見出しを持たない——編集欄と一覧と直す場所が並んでいれば、それが何かは見れば分かる。モーダルは同じアートボードを大きく描き、下に**そのシーンが映しているフィールドだけ**の `FactList` を出す。「この日付は仮です」と読む場所と直す場所を分けない。部品→briefフィールドの対応は `SceneComponent.fields` がビルダーで記録する(レンダラーは無視する)
- **シーンの呼び名は1箇所が持つ**([remotion/event-cm/types.ts](remotion/event-cm/types.ts) の `EVENT_CM_SCENE_LABELS` が正本・2026-08-16 改称)。画面の絵コンテもナレーション生成プロンプトもここを読むので、名前を変えると両方が同時に変わる——以前は画面用とプロンプト用の2つの表があり、「価値」と呼ぶ面と「テーマ」と呼ぶ面が並立し得た。単位は**シーン**で、画面上は`シーン1 オープニング`のように通し番号+名前で出る(旧「コマ」)

  | ロール | 呼び名 | 中身 |
  | --- | --- | --- |
  | `logoIn` | **オープニング** | 主催者・提供する企業/団体のマーク。無音 |
  | `title` | **タイトル** | イベント名。ナレーションの第一声 |
  | `value` | **テーマ** | なぜ来る価値があるのか |
  | `program` | **アジェンダ1/2/3** | 常に3枚。使わない枚は消す |
  | `guests` | **登壇者紹介** | 居なければシーンごと消える |
  | `cta` | **CTA** | 日程・場所・次にすること |
  | `logoOut` | **エンドカード** | マークを再び。無音・フェード |

  **`program` だけ2語を使い分ける**: 画面に並ぶ**値**は主催者が書いた言葉なので「プログラム」のまま、その値が乗る**シーン**が「アジェンダ」。セミナー・イベントに共通する言い方をテンプレート側の語彙に採り、中身の呼び方は主催者に合わせる

- **構成は固定・ロゴで始まりロゴで終わる**([remotion/event-cm/types.ts](remotion/event-cm/types.ts) の `EVENT_CM_SCENES` が正本): `logoIn → title → value → program → guests → cta → logoOut`。両端の2枚は**無音**で、提供する会社のマークだけを見せる(**それぞれ4秒**。1秒台だとマークが瞬間的に現れて消え、クレジットではなく不具合に見える)。冒頭は音楽のみ、末尾はフェード。**マークは既定で白抜き**(`treatment: "knockout"` = `brightness(0) invert(1)`)——墨の地に黒いSVGを素で置くと見えないため。`invert` は元が明るいマークを壊すので既定にしない。**誰の動画なのか**を最初と最後に言うため。ナレーションは2枚目の**タイトルコールから始まる**——告知は自分の名前を先に言う。`eventCmScenePlan()` が唯一の判定で、タイムライン・字幕・絵コンテ・ナレーションプロンプトが全部これを読む

- **構成はテンプレートが持つ。事実では動かない**(2026-08-17 決定)。**9シーン固定**(アジェンダ3枚+登壇者1枚)で、`eventCmScenePlan()` が読むのは**どれを消したか**だけ。以前は登壇者が居なければ登壇者シーンが消え、プログラムの数だけアジェンダが増えた——つまり**「この動画は何枚でできているか」の答えが2箇所にあり**、書いて録音まで済ませたナレーションの下で映像の形が動いた。`narrationStaleness` の `shape` はそれを報告するためだけに在る。**イベントテンプレートは登壇者が居る前提**で、居ないイベントは登壇者シーンを消す。5つのプログラムを語りたいなら、それは別のテンプレート——ここを曲げられるようにした時点でテンプレートではなくなる
  - **消すのはシーンであって、値ではない**。登壇者を消しても登壇者は残り、アジェンダ2を消してもプログラムは残る。`provenance` に `guests` / `program.1` として記録されるので、戻せる
  - **シードは全シーンにナレーションの下書きを置く**([lib/templates/event-cm/seed.ts](lib/templates/event-cm/seed.ts) の `draftNarration`)。下書きは**そのシーンが何のためにあるかだけを言い、事実を1つも語らない**——字幕には「仮に入れた値」のラベルが付かないので、「9月18日、渋谷でお待ちしています」は仮に見えず、「開催日と会場を、最後にここでお伝えします」なら仮に見える(上記「捏造の方針」)。`source: "llm"` なので、資料を読めばそのまま書き直される
  - **登壇者は役割だけを提案する**(「ゲストスピーカー」「モデレーター」)。氏名は発明しない——推測の日付は5秒で直せる提案だが、推測の氏名は存在しない人物で、しかも [place-images.ts](lib/templates/event-cm/place-images.ts) が実在の顔写真をそこへ結びつけ得る
- **並びはテンプレートが決め、長さはナレーションが決める**: 尺は「各シーンの想定尺 → ナレーションの文字数 → 読み上げの実測」と段階的に精度が上がる([remotion/event-cm/timeline.ts](remotion/event-cm/timeline.ts))。だから**動画を追加した瞬間に、LLMもレンダリングも無しで完成した映像が再生される**。**言葉も含めて**——シードが全シーンに下書きを置くので、第1段の「想定尺」に落ちるのは行を全部消したときだけになった(以前は追加直後がその状態で、絵は完成しているのに言葉が空だった)
- **章のあいだに間がある**(`EVENT_CM_SCENE_GAP_MS` = 0.9秒)。1シーン=1章なので、間が無いと前の行が着地する前に次が始まる。音楽は止めず、声だけが待つ。**同じ値をTTSのセクション間ギャップにも渡す**ので、録る前の推定と実測が同じリズムを指す。結果として尺は30秒を超える(**シードした直後の実測で45.3秒**・9シーン・字幕11枚)——**30秒は要件ではなく、正しい尺が要件**。構成固定でナレーションが7行になったぶん、以前の約34秒より伸びている
- **動画の名前とイベント名は別物**([lib/templates/event-cm/title.ts](lib/templates/event-cm/title.ts))。新規作成時の動画名は**「名称未設定」**——シードのイベント名を動画名にすると、こちらの提案が「誰かが付けた名前」に見える。資料からイベント名が変わったら、**タイトルバーの下で「この動画の名前も変えますか?」と聞く**。勝手に変えないのは、自分で名前を付ける人がいるため。断った名前はブリーフに記録して二度と聞かないが、**別の名前が出てきたらまた聞く**
- **BGMも読み上げと同じ形**([components/video/BgmDialog.tsx](components/video/BgmDialog.tsx))。ヘッダーの「BGM」ボタン(読み上げの左)にドットで在/不在が出て、モーダルで既定プール+アップロード音声から選ぶ。絵コンテ下のBGM欄は撤去——同じ種類の問い(常時オン/オフ・1つ選ぶ)に答える操作が、片方はヘッダーのボタンで片方はピルの列という状態を作らない。**書き出しに乗らない仮素材はその場で明示**する
- **音楽や写真を選び直してもナレーションは古くならない**([lib/templates/event-cm/facts.ts](lib/templates/event-cm/facts.ts) の `isSpokenFact`)。`factsUpdatedAt` はナレーションが古いことを言うためだけに在るので、**読み上げないもの**(BGM・写真・ロゴ)では動かさない。何も壊れていないのに警告が出る状態は、警告を無視する習慣を作る
- **声を選ぶことと、読み上げることは別**([components/video/VoiceDialog.tsx](components/video/VoiceDialog.tsx))。モーダルの「この声にする」は`brief.narrator`(設定)を保存するだけで**即座に返る**。実際の読み上げは**「動画を作り直す」が走るとき**で、そのとき他の未反映もまとめて片付く。以前はこのボタンが直接TTSを叩いていたので、**1分待たされ、ダイアログが閉じ、プレイヤーは何も変わっていない**——録音はできても映像に焼き付けていないため——という体験になっていた。声の差分は「読み上げの声」として1件出て、必要な工程は**読み上げ直しと反映だけ**(言葉は変わらないのでナレーションは書き直さない)。設定と録音は別の事実なので `voiceUsesNarrator()` が突き合わせる(**未指定のTakeは一致扱い**——プリセット以前の録音に再録を要求しない)
- ラベルは常に「読み上げ」で、状態はドットだけが示す——読み上げは完了する工程ではなく、言葉も声も読み方も作り直す対象だから。モーダルで**声を選べる**(標準/男性1/男性2/女性1/女性2 = [lib/voice/voices.ts](lib/voice/voices.ts)。**男女のラベルはこちらの判断**で、Geminiのカタログは性別を明記していないため、Gemini名と性格語を画面に併記して耳で正せるようにしている)。**オフにもできる**——音楽と字幕だけの動画は未完成ではない。オフは`brief.voice`のポインタだけを外し、録音はR2とTakeに残るので戻せる。オフのとき尺はナレーション推定へ、字幕はナレーションへ、BGMは全編フルに戻る(いずれも読み上げ前から在る挙動)
- **読み方はテンプレートの意見**([lib/templates/event-cm/delivery.ts](lib/templates/event-cm/delivery.ts))。イベント告知は「案内する催しを楽しみにしている人」が読む——**少し速めの一定テンポで歯切れよく**、ただし語尾を伸ばさない・上げない・作った明るさをつけない。**間はテンプレートが設計済み**(`EVENT_CM_SCENE_GAP_MS`)なので読み方に間を足させない(両方頼むと二重に待つナレーターになり、実際にそうなった)
- **字幕は既定でオン、オフにもできる**([remotion/event-cm/captions.ts](remotion/event-cm/captions.ts)・2026-08-17)。ミュートで見られる前提なので、**音声を待たずナレーションから**文単位で出し、読み上げ後に実測へ置き換わる。**1枚は28字まで**——句点で割るのが基本だが、句点の無い長い一文は読点で、それも無ければ字数で割る(字幕帯に行数制限は無いので、1200字の「一文」は絵を覆う板になる)
  - **オフはヘッダーの「字幕」ボタン**(BGM・ボイスと同じ形)。**ナレーションの出力は2つ**(読み上げ・字幕)で、以前はボイスだけがオフにでき字幕は必須という非対称だった。オフにしても**言葉も尺も動かない**——シーンの長さを決めるのはナレーションの文字数(読み上げがあればその実測)で、画面に出すかどうかとは別だから。ダイアログはそれを言う(そこが唯一、トグルでは伝わらない点)
  - **オフは `provenance.captions` の suppression**。字幕は保存されず毎回導出されるので、「オフ」は決定として記録するしかない(ポインタを外すだけだと次の導出がまた作る。ボイスのオフと同じ理由)
  - **切り替えに必要な工程は反映だけ**。字幕はナレーションを一字も変えずに映しているので、書き直しも読み直しも要らない([bake.ts](lib/templates/event-cm/bake.ts) の `needsFor`。`captions` は `isSpokenFact` が false)。BGMの差し替えと同じ扱い
- **ナレーションの長さはそのままシーンの長さ**([remotion/event-cm/timeline.ts](remotion/event-cm/timeline.ts) の `writtenMs` = `max(2.5秒, 文字数÷7)` + 間0.9秒)。**上限は無い**——2900字を書けばそのシーンは約415秒になり、動画は7分を超える。それが正しい設計(尺はナレーションが決める)なので止めないが、**書いている場所で見えるようにする**: 編集欄に`目安〜字・約N秒`を出し、目安超過は琥珀色、**読み上げ上限2000字を超えたら赤で「読み上げられません」**([lib/voice/limits.ts](lib/voice/limits.ts))。読み上げは**1リクエストも投げる前に**長さを検査して日本語で断る(以前は3行目で providerの英語エラーになり、1〜2行目の課金だけが発生していた)
- **事実が変わるとナレーションが古くなる**。`brief.factsUpdatedAt` と `narration.updatedAt` の比較で判定し、マッピング段が自動で書き直す。ただし `narration.source === 'human'` は上書きしない
- **BGMはシステムが持つ**([lib/assets/defaults.ts](lib/assets/defaults.ts))。既定は固定で、冒頭のロゴシーンのあいだ単独で鳴り、読み上げ区間で下がって締めのロゴで戻る。**曲の音量は「その曲のピーク余裕いっぱい」まで上げる**(2026-08-26 変更)——以前の基準 −16 dBFS RMS は*静かな方の曲*(ink-cinematic、余裕1.4dB)が到達できる上限で、それを**フルスケールで作られた曲にも当てはめていた**ため、bright-corporate は自分の音量を4dB捨てていた。「3分の1しかない」の主因はこれ。ink は変わらない(承認済みの墨の映画がこの数字で混ざっている)。**これ以上上げるにはリマスターが要る**(両曲ともピーク制限)
- **プールの曲は長さを測って宣言する**(`durationSec`。`startFromSec` は頭が本当に死んでいる場合のためだけに残す)。**測った長さがあるものは `<Loop durationInFrames>` で明示的に回す**——Remotionの `loop` は**CLIレンダーではループするのにブラウザのプレイヤーではループしない**(画面では26秒で無音・MP4は最後まで鳴る、という食い違いが実測で出た)。プレビューと書き出しが食い違うのはこのテンプレートで最も避けるべきことなので、両方が従う形にする。**分岐はトリムの有無ではなく長さが分かっているかどうか**——以前はトリムで分岐していたため、トリムを外すとこの無音バグへ戻る作りだった既定2曲は**Suno AI(商用利用可プラン)で生成**したものなので、プレビューでもMP4でもそのまま鳴り、公開できる。`licensed: false` は**清算されていない素材が来たときのための印**で、BGMダイアログが「試聴用」と表示し「書き出したMP4では無音になります」と言う。**ただし書き出し側の実装はまだ無い**(`unlicensedDefaults()` に消費者がいない)——現在は該当素材がゼロなので実害は無いが、清算されていない曲を足すなら先にレンダー側の除外を入れる
- **資料の画像は、事実と同じ1回の読み取りで判定される**([lib/templates/event-cm/structure.ts](lib/templates/event-cm/structure.ts))。各画像には`【画像 ラベル / ID: …】`の見出しが付いて渡るので、モデルは「どの画像か」を指して答えられる。キャプションと顔を結びつける手がかりはチラシの本文と写真が同じコンテキストに居ることなので、画像だけを別呼び出しに出さない。抽出段は送る前に`sharp`で長辺1024へ縮小し、**1回12枚・6MBを上限**にする(超えた分は「送っていません」と理由付きで実行ログに残る)
- **どのスロットへ入れるかは決定論**([lib/templates/event-cm/place-images.ts](lib/templates/event-cm/place-images.ts))。**顔だけで人物を同定しない**——氏名の根拠(画像のキャプション・資料本文・ファイル名)が揃ったときだけ`guests[n].photo`に入る。キービジュアルは`visuals.value`、情景は`visuals.programs`、会場は`visuals.closing`へ。ロゴの`treatment`は**測った輝度**で決める(暗いマークは白抜き、明るいマークはそのまま)。低確度は自動採用せず、**採用しなかった画像は理由付きで実行ログに残る**。候補テーブルは作らない——この動画に固定された素材一覧がそのまま候補一覧で、`FactList`の「差し替え」はそこから選ぶ
- **写真は登壇者の属性であって、登壇者リストの版ではない**。資料を読み直しても氏名で照合して写真を引き継ぐ([lib/deliverable/names.ts](lib/deliverable/names.ts))。写真が入ってもナレーションは古くならない(写真は読み上げないため)
- 由来は4値(`brand` / `extracted` / `inferred` / `user`)。**決めつけて埋め、一覧で正直に「仮に入れた値」と言う**。項目はその場で直せるし、消せる(消すは「不明」と別物)
- 企画書には掲載用でない値が混ざるため、[lib/templates/event-cm/sanitize.ts](lib/templates/event-cm/sanitize.ts) が決定論で落とす(プレースホルダ・見出し・社内メモ・人数・装飾記号)

### アートディレクションは交換できる(2026-08-21)

**カテゴリーは作成時に決まり変えられない。アートディレクションとアスペクト比は、同じ動画プロジェクトの中で交換できる。** 判定はひとつ——**briefの形が変わるか**。

| 軸 | 例 | briefの形 | 持ち場所 | 状況 |
| --- | --- | --- | --- | --- |
| **カテゴリー** | 製品紹介動画 / イベント紹介動画 | **変わる** | テンプレート(別ID) | 両方あり |
| **役割** | 広告 / 番組 / ティザー | **変わる** | テンプレート(別ID) | 未着手 |
| **アートディレクション** | スタンダード / モダンジャパニーズ | 変わらない | `brief.artDirection` + `take_renders.theme` | **2種・作成時に選べる**(2026-08-26) |
| **アスペクト比** | 16:9 / 9:16 | 変わらない | `take_renders.aspect_ratio` | 16:9のみ |

- **正本は [remotion/kit/theme.ts](remotion/kit/theme.ts) の `THEMES`**。`standard`(企業向け・白地×紺×青のゴシック)と `sumi`(モダンジャパニーズ・墨黒×金×明朝)。同じブリーフ・同じナレーション・同じシーン数・同じ尺で、**描き方だけが変わる**(検証: `npm run themes:compare` が両方の全シーンを静止画で書き出す)
- **`standard` が正式版で、`sumi` は派生**。順序が逆に見えるのは、最初の実案件が和モダンのイベントだったから先に完成しただけ。モダンジャパニーズは具体的すぎて再利用の機会が少ない
- **未設定は `sumi` に落ちる**(`LEGACY_THEME_ID`)。`brief.artDirection` より前に作られたTakeは全て墨で、**うち1本は承認済みの納品物**なので、未設定を新しい既定に倒すと承認された映像が勝手に塗り替わる。新規は `NEW_FILM_THEME_ID` = `standard`
- **既定の塗りは `standard`**(2026-08-30・依頼主判断)。追加ダイアログの先頭が標準で、選ばなければ標準で始まる([catalog.ts](lib/templates/catalog.ts) の `artDirections[0]` と `defaultRenders[0].theme` の2箇所。テストが一致を要求する)。**未設定のTakeが墨に落ちる規則とは別の話**で、承認済みの映像は動かない。**標準の塗りはどれも同じ曲で始まる**(2026-08-30 依頼主判断)——製品紹介動画もイベント紹介動画のスタンダードも `shine-through-tokyo`。在庫の都合ではなく決定で、和モダンだけが自分の曲を持つ(規則は[defaults.test.ts](lib/assets/defaults.test.ts))
- **作成時に選ぶ**(2026-08-26)。追加ダイアログの「スタイル」は**テンプレートではなくアートディレクション**([lib/video/templates.ts](lib/video/templates.ts) の `VideoStyle`=テンプレート×塗りの組)。以前は「イベント紹介動画 › スタンダード」が**廃止決定済みの event-promo**(読み上げなし)を作っていた——選んだ言葉と出てくる動画が別物だった。event-promo は追加ダイアログから外した(`addable: false`。既存Takeは一覧・再生・公開ともそのまま。ラベルは「PV（読み上げなし）」)。APIは `artDirection` を受け取り、`take_renders.theme` に選んだ塗りを書く
- **服は塗りごと**([lib/templates/catalog.ts](lib/templates/catalog.ts) の `artDirections[]`)。BGM(墨=和モダンの曲・スタンダード=明るい曲)・既定画像・見本写真は塗りに従う。**業種で曲が変わるのは誰も選んでいない差**だが、塗りは利用者が選ぶ——2026-08-17 の「BGMはテンプレートが持つ」決定はそのまま、テンプレートの下に塗りの段が1つ入った形。**塗りごとに別の写真プール**を持つ(2026-08-27 にスタンダードの12枚が入った)。墨の写真をスタンダードに着せると持ち上げた先が灰色の霧になるので、1枚を両方で使わない([docs/demo-assets.md §2](docs/demo-assets.md))
- **エンドカードは動画の上に立つ**(`theme.endCard`・2026-08-27)。承認済みの和モダンの映画は**富士が雲海に隠れる映像**の上でマークを見せていた(labs/freehand の `sources.ts` の `logoOut`)が、**持ち帰りがこれを落としていた**(Phase B5 の「video Ground はまだ」)ので、両テーマの締めが平坦な板のままだった。レシピは**承認済みのものをそのまま**——① 映像に `grade` ② **テーマ自身の地の色で平坦に洗う** ③ テーマの放射スクリム。墨は `rgba(8,6,4,0.58)`(ラボの数字)、スタンダードは同じ構造で**逆向き**(明るく洗う `rgba(247,249,252,0.62)`——このテーマのマークは濃い色だから)
  - **洗いの濃さは自由ではない。** マークの描き方は `palette.ground` から導かれるので([mark.ts](remotion/kit/mark.ts))、映像を全面のまま出すとその導出が嘘になる(明るい空に白抜きのマーク、暗い空に黒いマーク)。テストが「地と同じ側の色で0.5以上洗う」ことを要求する
  - **出典未確認の素材なので `licensed: false`**——プレビューでは見え、**レンダーでは外れる**(`unlicensedDefaults` の最初の消費者)。外れても締めは完成している(下の板がテーマ自身の地なので)。書き出しZIPとダイアログも**テーマ側の素材を名指しする**ようにした——ブリーフの値しか見ていなかったため、実際に外れる唯一の素材が誰にも告げられていなかった
- **登壇者の見せ方もテーマが持つ**(`ornament.people`・2026-08-30)。墨は**全画面の分割パネル**(承認済み。ラボが「小さな円が空間に浮いている」と測って退けた列の代わりに置いたもの)、スタンダードは**丸いアバターを並べ、その下に 名前 / 会社 / 肩書き**——企業が自社セミナーを告知するときの慣習で、顔2枚を全画面に引き伸ばすと**告知しているのと別の種類のイベント**に見える。パネルは見出しを持たない(名前が入る場所と重なるため)が、アバター列は「登壇者」の見出しが戻る(丸が並んでいるだけでは何の列か言えないため)
- **数字と音の様式もテーマが持つ**。印章numeral(一二三)は和の装置でゴシックでは「一」が青い横棒に見えるので、スタンダードは算用の `01 02 03`(`ornament.numerals` → `stat` の `variant:"ordinal"`)。効果音は `sound.cues`——墨は拍子木・和太鼓・鈴の承認済みの列、スタンダードはコーポレートの列([lib/templates/event-cm/sfx-cues.ts](lib/templates/event-cm/sfx-cues.ts))
- **標準のBGMは3分の曲**(`shine-through-tokyo`・2026-08-30 に依頼主が生成して差し替え)。**51秒の映画は曲の終わりに到達しないので、継ぎ目そのものが起きない**——下の「頭から鳴らす」判断がまだ抱えていた「40秒の曲を51秒に敷けば1回は継ぐ」制約が、素材側で消えた。実測 RMS −16.2 / ピーク −0.7 dB → `gain: 0.989`(ピーク制限)。**曲ごとの手動調整**は `gainAdjustDb` が持つ(測定値 `gain` とは別フィールド——計測スクリプトを回し直しても、聴いて決めた値を消さないため)。**ただし今は誰も使っていない**: 2026-08-30 に +5 dB を入れて、書き出したMP4が「めちゃくちゃ大きな音」になった。**プレビューで決めた調整を、両方に適用していた**のが原因。**耳で決めた値は、書き出しで聴いてから入れる****`bright-corporate` はプールに残る**(2番目の選択肢。選ぶUIはまだ無く、台帳の宣言を変えて切り替える)
- **音量は 1.0 を超えない。プレビューと書き出しが一致する範囲がそこまでだから**(2026-08-30)。Remotionは `volume` を **0〜1** と定義しており、それを超えた値の扱いは2つの再生系で保証されない。ここが「プレビューで微調整して書き出すと全部バランスが変わる」の出口だった。`ink-cinematic` の 1.072 は **1.0 に下げた**(0.6 dBは聞こえないが、ブラウザとエンコーダがミックスについて食い違うのは聞こえる)。**1.0で足りない音量は曲側の問題**なので、下げるのではなくリマスターする。規則は[defaults.test.ts](lib/assets/defaults.test.ts)と[計測スクリプト](scripts/measure-default-bgm.mjs)の `GAIN_CEILING` が固定する
- **ループは曲が尽きるときだけ**(2026-08-30)。映画より長い曲に `<Loop>` を巻くと、**何もしない仕組みが1つ増える**——そして仕組みが増えれば、2つの再生系がそれについて一致している必要が増える。承認済みの墨は素の `<Audio>` で鳴っていて問題が出ていないので、3分の曲を51秒の映画に敷く標準も**同じ経路**にした
- **音量0は「静か」ではなく「ミュートせよ」**(2026-08-30)。@remotion/media のプレビューは `effectiveMuted = muted || mediaMuted || userPreferredVolume <= 0` で判定するので、**カーブがフレーム0でちょうど0だと、再生のたびに冒頭でミュートが1フレーム入る**。音声は先読みでスケジュールされるため、そこで落ちた最初のチャンクが戻るかは再生ごとに変わり、**1回目は大きく2回目は小さい**という不安定さになる(効果音は素の数値なのでミュートされず、そのぶん相対的に極端に大きく聞こえる)。カーブは0ではなく **−80 dB(0.0001)** で底を打つ
- **音量は「フレームの純関数」を渡す**。以前は `useCurrentFrame()` から値を作って `() => bgmVolume` で閉じ込めており、**プレイヤーが尋ねたフレームを無視していた**——答えがReactの再描画タイミングに依存する。レンダラーは1フレーム1描画なので正解を得るが、**画面より先に音をスケジュールするブラウザは得られないことがある**。いまは `volume={bgmVolumeAt}` で、尋ねられたフレームに対して答える
- **`<Loop>` は使わない。パスをSequenceで並べる**。`<Loop>` の子はSequenceなので `volume` に渡るフレームが毎回0に戻る——上の「閉じ込め」はそれを避けるための細工だった。パスを明示的に書けば各パスが自分のオフセットを知っているので、**カーブは映画のフレームの純関数のままでいられる**
- **書き出しの音は測れる**。`--codec=wav` で音声だけを書き出せば映像を作らずに実測できる(2026-08-30 実測: 平均 −15.6 / ピーク **−1.7 dB でクリップなし**、区間ごとの値も曲そのものと0.1 dB以内で一致)。**プレビューだけで音量を判断しない**
- **BGMは頭から鳴らして、曲の終わりでループする**(2026-08-30)。標準の `bright-corporate` は 2026-08-26 から4日間 `startFromSec: 14` を持っていた——頭14秒が自分の本体より7〜9 dB低い(実測 −17.4 / −16.2 / −13.9 対 −10.3〜−9.0)ので、**音量としては正しい編集**だった。だが**トリムした曲は残った部分でしかループできない**ので、ループの戻り先が 0:00 ではなく **0:14** になり、51秒の映画の中で**フレーズの途中からフレーズの途中へ2回切り替わった**。頭出しも 0:14 なので入り方も途中からだった。**あの14秒は欠陥ではなく曲の入り**で、測って「小さい」と出たものを「だから消す」と答えたのが誤りだった。頭から鳴らせば継ぎ目は**曲自身の終わり→頭**——ループが起きるべき唯一の場所——になり、静かな入りは締めのカードの下に落ちて、そこは元々フェードアウトしている。**40秒の曲を51秒の映画に敷けば継ぎ目は1回必ず残る**ので、本当の解決は長い曲(発注)。規則は[defaults.test.ts](lib/assets/defaults.test.ts)が固定する
- **ループは「長さが分かっているか」で決める。トリムの有無ではない**。Remotionの `loop` は**CLIレンダラーではループし、ブラウザのプレイヤーではループしない**(2026-08-26 実測「音は30秒ぐらいで止まってしまう」——画面は26秒で無音、MP4は51秒とも鳴る)。プレビューと書き出しの食い違いはこのテンプレートが絶対に出してはいけないものなので、**測った長さがあるものは `<Loop>` で明示的に回す**。以前この分岐はトリムの有無で切り替わっていたため、**トリムを外すと標準の映画が無音バグへ戻る**ところだった。墨(216秒)は51秒の中でループに到達しないので、どちらの経路でも同じ音が鳴る
- **新しい音の列は、承認済みの列の実測エンベロープに収める**(2026-08-26)。最初のコーポレート列は**ラベルだけで選んで頭1秒の音量は墨と完全一致していたのに「効果音が異常に大きい」と却下された**——2/4本が1秒過ぎても −25〜−34 dB で鳴り続けるジングルで、承認済みの和の音は全部 −46 dB 以下へ死んでいた。音量ではなく**尾**が犯人。だから台帳([catalog.json](public/defaults/sfx/catalog.json))に `tailDb` / `durationSec` を実測で持たせ、**全列を「頭 −34〜−28 / 尾 −45 以下」の帯に固定するテスト**([lib/templates/event-cm/sfx-cues.test.ts](lib/templates/event-cm/sfx-cues.test.ts))を置いた。残るのは音色の好みだけ(テストでは測れないので初回試聴で差し替え可)
- **テーマを変えてもナレーションは古くならない**。読み上げない要素なので `isSpokenFact` は false(BGM・写真と同じ扱い)
- **2つ目のテーマが語彙の穴を暴いた**。宣言だけあって誰も読んでいなかった値、および暗色前提のハードコードを塞いだ:

  | 直したもの | 症状 |
  | --- | --- |
  | レターボックスの色(`chrome.color`) | コンポジションに `#040302` 直書き。明るいテーマにも黒帯が出た |
  | 字幕プレートの色(`caption.plate`) | CaptionBandに `rgba(0,0,0,0.88)` 直書き |
  | 方向性スクリムの色(`backdrop.directional.tint`) | Stageに `rgba(8,6,4,…)` 直書き。**明るいテーマでは減光ではなく増光が要る**(濃い文字が乗るため) |
  | 地の層(`motion.background` / `palette.groundWash`) | `EventBackground`(墨の粒子)が無条件に描かれ、`background: "still"` が無視されていた。**素材ゼロでも完成品が出る**要件は地が担うので、平坦なテーマには wash が要る |
  | 登壇者名の下余白 | `letterbox + 64` だけを見ていた。帯が無いテーマではプレートが画面内に入るので、**字幕が名前を貫いた**。`max(letterbox+64, captionSafeBottom)` で墨の196pxは不変 |

- **不変条件は [lib/kit/themes.test.ts](lib/kit/themes.test.ts)**。未設定→墨、新規→standard、`backdrop:"bar"` はレターボックス必須、どのテーマも素材ゼロの地を持つ、**墨の承認済みジオメトリ(132 / 172 / 196)は動かない**
- **残っていること**: ① **作成後の塗り替え**。作成時の選択は入った(上記)が、既存Takeの `brief.artDirection` を切り替えるUIと、`take_renders.theme` / `aspect_ratio` を[render.ts](lib/takes/render.ts)が**SELECTして使う**配線はまだ無い(レンダーは brief の値を読む) ② 9:16(`STAGE` の関数化と7配置の縦型版) ③ コーポレートの効果音の列と、エンドカードの地の動画の**出典確認**(未確認なので `licensed: false` で書き出しから除外中) ④ **9:16 の登壇者**。標準の登壇者はアバター列(`ornament.people`)になったが、縦型での並びは未検討

### 1本を通しで確かめる(`npm run event-cm:walkthrough`)

**シード → ナレーション(LLM) → 読み上げ(TTS) → MP4 を、この端末だけで通す検証ツール**([scripts/walkthrough-event-cm.ts](scripts/walkthrough-event-cm.ts))。判断はすべてプロダクト自身の関数(`seedEventCmBrief` / `draftEventCmNarration` / `generateVoice` / `eventCmFilm`)が行い、**違うのはバイトの置き場所だけ**——R2ではなくディスクに書く。アプリの出力と食い違ったら、疑うのはこのスクリプトの配線。

**静止画では分からないものを見るために在る**: ナレーションがシーンの中に収まっているか、読み上げと尺が一致しているか、音楽が声の区間で下がるか。`themes:compare` と同じ category のツールで、**並行パイプラインではない**。

- **2プロセスに割れているのは必然**。[narration.ts](lib/templates/event-cm/narration.ts) は `server-only` を import するので `--conditions=react-server` が要るが、**Remotion の CJS は同じ条件下で読み込めない**。だからスクリプトは props ファイルまでで止まり、書き出しは npm script が Remotion CLI に渡す(`event:render` と同じ経路)
- **課金される**(ナレーション1回 + シーン数ぶんのTTS)。実測: in 1878 / out 1079 tokens、7シーン、**46.5秒 / 19.5MB / 1920×1080 h264 + AAC**
- 出力は `var/event-cm/`、録音は `public/walkthrough/`(どちらもgit管理外)

**この経路が「（見本）」のバグを見つけた。** 見本ラベルを登壇者名に入れていたため、ナレーションが**声で「ゲストスピーカー見本と、モデレーター見本が」と読み上げた**。名前は読み上げられる事実なので、ラベルの置き場所を**写真**(`EventPhoto.sample`)へ移した——写真は読み上げない([lib/templates/event-cm/facts.ts](lib/templates/event-cm/facts.ts) の `isSpokenFact`)。**静止画だけを見ていた限り、この不具合は見えなかった。**

### プロジェクトデータの書き出し(ロックインしない)

ヘッダーの**「公開する」の左**に「プロジェクトデータを出力」。この動画を **Remotionのプロジェクトとして持ち出せる**([lib/export/](lib/export/)、API は `GET /api/brands/[id]/videos/[videoId]/project`)。ここで簡易に作って満足する人もいれば、実案件では必ずどこかを詰めたくなる人もいるので、**作ったものを資産として抱え込まない**ことをテンプレート側の要件にしている。

- **同梱するファイルは手で並べない**。[lib/export/module-graph.ts](lib/export/module-graph.ts) が `EventCmComposition.tsx` から**importの閉包**を取る。テンプレートに import が増えれば書き出しも勝手に追随するので、一覧が腐って「動かないZIP」を配る事故が起きない(現在25ファイル)。**解決できない import は例外にする**——黙って落とすと、欠けたことに気づくのは受け取った人になる
- **コピーしたソースは1バイトも書き換えない**。`@/` のまま `src/` 配下に元のパスで置き、エクスポート先の `tsconfig.json` と `remotion.config.ts` で alias を張り直す(**Remotion CLI の webpack は tsconfig の paths を読まない**ので両方に要る)。書き換えないので、受け取った人が後日こちらの版と diff を取れる
- **同梱しないもの**: Remotion本体(再配布不可・依存として記載)、`licensed: false` の既定素材(ブリーフからも参照を外す)、コンポジションから辿れないもの。モーダルは**実際に外れるものを名指し**し、外れるものが無ければ「すべて同梱できます」と言う(効かない警告は、警告を無視する習慣を作る)
- **引き継ぎREADMEを同梱する**([lib/export/readme.ts](lib/export/readme.ts))。動かし方・どこに何があるか・シーンの呼び名の表・「尺はナレーションが決める」「無いものは描かれない」といった読まないと分からない規則、そして**AIエージェント向けの3つの約束事**(決まった事実を勝手に書き換えない/尺を固定値で書かない/金を勝手に足さない)。**1つ目は上記「捏造の方針」と矛盾しない**——書き出したプロジェクトの値は持ち主が確定させた結果であり、そこは提案する場所ではなく受け取る場所だから
- **名前は2つ持つ**([lib/export/naming.ts](lib/export/naming.ts))。ZIP内のフォルダ名とnpmの`name`は**ASCII必須**(fflateはファイル名にUTF-8フラグを立てないので、日本語ディレクトリは `unzip` が展開を拒否する)。読める日本語のタイトルは**ダウンロードのファイル名**が持つ(RFC 5987 の `filename*`)
- **検証済み**(2026-08-16): 「世界が恋する日本酒」を書き出し→`npm install`→`npm run render` で **1920×1080 / h264+aac / 59.82秒のMP4**が出た(アプリ内の表示と一致)。この過程で [remotion/kit/paint.ts](remotion/kit/paint.ts) の `resolveSrc` が**恒等関数**だったのを直した——アプリ内プレイヤーは署名済み絶対URLしか渡さないので誰も気づかず、CLIレンダーでだけ音声は鳴って**画像が全部404**になる形のバグだった。規則は `paint.ts` の1箇所になり、event-promo の `resolveMediaSrc` もそこへ委譲する

### 部品語彙(remotion/kit/)

テンプレートは**モジュール(シーン)の集まり**で、シーンは**同じオブジェクトのパラメーター違い**である部品から組む。

| ファイル | 正本として扱う内容 |
| --- | --- |
| [remotion/kit/components.ts](remotion/kit/components.ts) | 17部品の語彙・パラメーター・**空のときの振る舞い** |
| [remotion/kit/theme.ts](remotion/kit/theme.ts) | パレット/書体/4段の型スケール/**モーション語彙**/装飾/字幕/**組版の言語(`lang`)**。`lang` はテーマが持つ——`word-break: auto-phrase` は言語が無いと**黙って無効になる**ので必須フィールドにしてある(ラボで一度「Remotionでは効かない」と結論しかけた原因がこれ)。宣言する場所は [Stage.tsx](remotion/kit/render/Stage.tsx) のルート1箇所(どちらも継承プロパティなので、`typeStyle()` に置くと部品が増えるたびに付け忘れられる)。`SUMI_THEME` と `themeForBrand()`。**字幕帯は聖域**で、`captionSafeBottom()` が下寄せ領域の下限を決める(以前は訴求シーンのコピーが字幕を貫いていた) |
| [remotion/kit/layout.ts](remotion/kit/layout.ts) | **7つの配置**と、部品をスロットへ配る規則。**シーンの地(`Scene.backdrop`)**もここ——全面写真は「配置されるもの」ではなく立っている場所なので、部品ではなくシーンの属性。ステージの寸法・余白(`STAGE`)と領域の寄せ(`REGION_GEOMETRY`)もここ——Remotionのレンダラーと絵コンテが同じ幾何を読むため、Reactに依存しないデータで持つ |
| [remotion/kit/fit.ts](remotion/kit/fit.ts) | 再現性の保証。**黙って溢れさせない** |
| [remotion/kit/mark.ts](remotion/kit/mark.ts) | **マークを地の上でどう描くか、そもそも描けるか**。`markPainting()` が唯一の権威で、レンダラーも絵コンテもこれを読む。**地と同じ色のものは描かない**——フィルターで直せる衝突は直し(透過素材を地の反対側へ)、直せない衝突では**描くのをやめて明朝のクレジットに落とす**(不透明な板は knockout で白い長方形、blackout で黒い長方形になるだけなので)。**証明できるときだけ介入する**——測定の無いTakeは承認済み納品物なので、疑いでは動かさない。`null` は「測っていない」であって `false` でも `true` でもない(以前 `opaque ?? true` が未測定を不透明に倒し、輝度0.003のSVGが墨の地で消えた) |
| [remotion/kit/phrase.ts](remotion/kit/phrase.ts) | **日本語をどこで折るか**。`Intl.Segmenter` の形態素を3つの規則で文節へ寄せる(仮名で始まる語は前へ・連続する漢字語は複合語・句読点は前を閉じる)。保証するのは「意味の境界で折れる」ことだけで、**どの境界を使うかは入る量が決める**。文字送りの見出し(`CharReveal`)は1文字ずつが flex アイテムなので `word-break: auto-phrase` が効かず、**ブロック単位で折る**ためにこれが要る |

- **固定するのは**部品の集合・空の振る舞い・載る文字量。**自由なのは**どの部品をどう並べ何を言うか(=LLMが働く場所)
- **モーションはテーマが持つ**。シーンが持つとテーマを差し替えられない
- **背景写真は「あれば使う」**。`value`(hero) / `program`(support) / `cta`(support) が写真を地として受け取り、無ければ墨の地がそのまま出る(設計された状態であって穴ではない)。**減光・スクリム・寄りはテーマが持つ**([remotion/kit/theme.ts](remotion/kit/theme.ts) の `ThemeBackdrop`)——日本酒の映画が手で置いた 0.5 / 0.22 と Ken Burns をテーマの語彙に翻訳したもの。無音のロゴ2枚は地を受け取らない(誰の動画なのかを言う画面なので)
- 受け入れ条件は「この語彙で日本酒の映画を再現できるか」で、[lib/kit/event-cm-scenes.test.ts](lib/kit/event-cm-scenes.test.ts) が実ブリーフで検証する

## Platform Admin / Labs権限

サービス運営権限は組織ロールから独立している。`org_members.admin` はその企業のBrand Managerを管理する権限であり、Labsや将来のサービス運営ダッシュボードには入れない。

- `platform_admin`: Logosサービス運営者。Labsと将来の運営ダッシュボードへアクセス
- `labs_member`: Labsのみアクセス
- `support`: 将来のサポート担当。現時点ではLabsアクセスなし

Labsのページ、生成・集計・テンプレートAPIは `platform_admin` または `labs_member` を要求する。CM Maker(トップ `/`)の生成・ジョブAPI(`/api/labs/campaign/*`)も当面同じゲート下にある(そのためトップでURL/PDFから生成できるのは `platform_admin` / `labs_member`。SVGロゴ→プレゼンは登録ユーザー全員が利用できる)。公開プレゼンが利用する `/api/labs/workflow/compose` と `/api/labs/workflow/runs`、および公開サンプル `/c/sample` はこのゲートの対象外。

## アーキテクチャ

- **Next.js (App Router) + TypeScript + Tailwind CSS v4**
- アニメーションは **motion**(scroll-in reveal 等)と **gsap**(Splashの演出)
- ロゴの構造・色・パス解析は**クライアントサイド**で完結する。保存時は正規化済みSVGをSupabaseへ保存し、利用者が写実モックアップ生成を明示実行した場合だけ、ラスタライズ画像をサーバー経由で生成AIへ送る
  - [lib/svg.ts](lib/svg.ts) — SVG正規化・計算済みスタイルの属性焼き込み・色抽出・単色変換・アウトライン化
  - [lib/paths.ts](lib/paths.ts) — path `d` 属性のパーサ(ベジェ骨格抽出)
  - [lib/color.ts](lib/color.ts) — HEX/RGB/CMYK変換・輝度判定
  - [lib/raster.ts](lib/raster.ts) — SVG→PNGラスタライズ(生成AIへの入力用)
- UIコピーは [lib/i18n/](lib/i18n/) で5言語対応(en/ja/ko/zh-Hant/zh-Hans)
- シーンは [components/scenes/](components/scenes/) にプラグイン式で追加できる([Reveal](components/scenes/Reveal.tsx) / [shared](components/scenes/shared.tsx) を共通部品として利用)
- プレゼン後半の mockup / generated 系 section は **presentation asset catalog** から解決して描画する。各assetはplacement互換性とdefault mappingを持ち、ロゴごとの採用状態はcanonicalな`logo-presentation` Takeの`brief.presentation.layout`に保存される
- 写実モックアップ生成は [app/api/generate/route.ts](app/api/generate/route.ts) が Gemini API を呼び出すサーバーサイドルート(APIキーを隠すため)
- データ永続化は [lib/store/](lib/store/) の `BrandRepo` インターフェースで抽象化。Supabase環境変数があればRLS付き実DB、なければ [localStorage実装](lib/store/local.ts)へ切り替わる。Labsのロゴピッカーも同じ正本repoを使う

### presentation asset catalog の現時点の実装

- **概念上の正本**: `presentation_asset_definitions`(全assetの`draft / production`とversion) + `logo-presentation` Takeの`brief.presentation.layout`(利用者ごとのオン/オフ・順序・設定値) + `logo_asset_runs`(candidateごとの処理状態)
- **現時点の定義ソース**: built-in asset のコード定義 + Workflow Lab の `template.json`
- **取得API**: `/api/presentation-assets`

`0006_presentation_assets.sql` が定義とlayoutの基礎、`0007_asset_lifecycle.sql` が成熟度・不変version・実行状態を追加する。`0008_asset_registry.sql` はアセット詳細領域の基礎として、ロゴが表す実世界のブランド主体、lockup / colorway 階層、将来の移管・購入問い合わせを追加する。global asset definition の管理UI/同期はまだこれからで、現段階では **ロゴごとのlayoutとruntime成果物はDB、asset definition自体はcode/template側から供給**される。

### ランタイムBlender assetの暫定手動運用

永続ワーカーを作る前は、Workflow Labの依頼情報を**新しいローカルエージェントセッションへ貼り付けて手動実行する**。新しいセッションは、最初に [Labs↔ロゴ正本エンティティ統合](docs/logo-entity-lab-integration.md#4-ランタイムassetの暫定手動運用)を読むこと。

利用者側の手順:

1. `/labs/workflow/workflow-neon-sign-v1` を開き、bundled test logoではなく対象の正本ロゴを選ぶ
2. `依頼情報をコピー`を押す。処理履歴が必要な場合だけ、先に`レンダー依頼を作成`してRun IDを発行する
3. コピーした全文を新しいエージェントセッションへ貼り、「このruntime assetを実行し、結果を登録して表示まで確認してください」と依頼する

`Logo ID`はロゴをグローバルに一意に特定するため、アカウントIDを別途渡す必要はない。`Candidate ID`は今回使う正確なmaster SVG、`Asset Definition ID`とversionは実行するレシピを固定する。Run IDは暫定手動運用では任意であり、将来のキュー/ワーカー自動化で必須にする。

IDは対象を識別する情報であり、認証情報ではない。認証はprivateなSVGの取得やR2/DBへの書き込み権限を確認するためだけに使う。手動期間はエージェントがこのworkspaceの既存接続設定を使い、依頼文にはSupabase JWT/service role、R2キー、`.env.local`の内容を**含めない**。接続権限がなければ、エージェントは不足している接続または権限を報告し、秘密情報をチャットへ貼るよう求めない。

エージェントが使う標準コマンドは [run-runtime-asset.mjs](labs/workflow/scripts/run-runtime-asset.mjs)。ID照合、private SVG取得、Blender、4:3/中央配置QA、R2保存と読み戻し検証、`logo_mockups`登録を1回で行う。

```bash
node --env-file=.env.local labs/workflow/scripts/run-runtime-asset.mjs \
  --logo-id <Logo ID> \
  --candidate-id <Candidate ID> \
  --asset-id workflow-neon-sign-v1
```

詳細な事前確認、`--run-id`、低サンプル検証用`--no-publish`、合格条件は [暫定手動運用の正本](docs/logo-entity-lab-integration.md#4-ランタイムassetの暫定手動運用)を参照。

## 開発

```bash
npm install
npm run dev   # http://localhost:3100
```

**ポートは3100に固定している**([package.json](package.json) の `dev`)。既定の3000番と、Next.jsが自動で繰り上げる3001〜3002番はこのマシンの別プロジェクトが使っており、`next dev` のままだと起動のたびに別のアプリと取り合いになる。3100は自動繰り上げの範囲から離れているので衝突しない。**OAuth(Google等)をローカルで使う場合は、Supabase の Authentication → URL Configuration に `http://localhost:3100` を許可URLとして追加する**(コールバックURLは完全一致で照合されるため)。

生成AIモックアップ(シーン10)を試すには `.env.local` に以下を設定して再起動する(生成は各タイルの手動ボタンで実行):

```
GEMINI_API_KEY=（Google AI Studioで発行したキー、課金有効なプロジェクトのもの）
```

同じキーを **CM Makerの30秒CM音声(Gemini TTS)** も使用する。キーなしで動画パイプラインを開発する場合は `CAMPAIGN_TTS_MOCK=1` を設定するとプレースホルダー音声で全フローが動く。サンプルCM音声の再生成は `npm run campaign:sample-voice`、MP4書き出しは `npm run campaign:render -- --job <id> | --sample`(初回はChrome Headless Shellを自動ダウンロード)。

生成APIは**登録ユーザー(非匿名)専用**で、ユーザーごとに直近24時間の回数上限がある(既定20回、`GENERATION_DAILY_LIMIT` で変更可)。クォータは `0010_generation_quota.sql` の `generation_events` に記録されるため、[Supabase設定](#supabase)が前提。localStorageモードでは生成は使えない。

Generative Lab(`/labs/generative`)の実エンジンを使うには `TOGETHER_API_KEY` / `RECRAFT_API_KEY` も設定する(未設定ならモックで全フローが動く)。詳細は [labs/generative/README.md](labs/generative/README.md)。

Cloudflare R2 を使う場合は `.env.local` に以下も設定する。現時点では **Generative Lab の生成画像保存先** と **シーン10 モックアップ(R2 + `logo_mockups`)** がこの設定を使い、Generative Lab のみ未設定時は `var/generative-lab/outputs/` へフォールバックする:

```
R2_ACCOUNT_ID=（Cloudflare Account ID）
R2_ACCESS_KEY_ID=（R2 API token の Access Key ID）
R2_SECRET_ACCESS_KEY=（R2 API token の Secret Access Key）
R2_BUCKET_NAME=logos-assets
MOCKUP_URL_SECRET=（ランダム文字列。openssl rand -base64 32 等で生成）
```

`MOCKUP_URL_SECRET` はモックアップ画像URLの署名鍵。**非公開ロゴ**のモックアップ画像は、認証済みAPIが発行する期限付き署名URL経由でのみ取得できる(`<img>` がAuthorizationヘッダーを送れないため)。未設定の場合、公開/unlistedロゴの画像は従来どおり表示されるが、非公開ロゴのモックアップ画像は404になる。

R2バケットはpublic access(`r2.dev`と公開custom domain)を無効にする。ブラウザはR2へ直接アクセスせず同一オリジンのAPI経由で画像を取得するため、現行構成ではR2 CORSルールは不要(空)でよい。

### Supabase

スキーマの正本は [supabase/migrations/](supabase/migrations/) の連番migration。現行のリモートプロジェクトには`0055_material_mark_geometry`まで適用済み(2026-08-19)。**適用済みかどうかは推測せず、Supabase MCP の `list_migrations` で確認する**——この行は一度、`0055`を「未適用」と書いたまま別の節が「適用済み」と書く状態になっていた。**各 migration がなぜ在るのかは [docs/old/migration-log.md](docs/old/migration-log.md)**(アーカイブ)。移行記録は [docs/old/schema-v2.md](docs/old/schema-v2.md)(アーカイブ)、現在の契約は [docs/data-model.md](docs/data-model.md)。新規環境のセットアップ手順:

1. Supabase の SQL Editor で `supabase/migrations/` 内のSQLを番号順に実行(0001→0055)
2. Authentication → Sign In / Providers で **Anonymous sign-ins を有効化**(公開ページ閲覧時のセッション初期化用。アップロードは本登録ユーザーのみ)
3. `.env.local` に以下を追加:

```
NEXT_PUBLIC_SUPABASE_URL=（プロジェクトURL）
NEXT_PUBLIC_SUPABASE_ANON_KEY=（anon / publishable キー）
```

退会APIを使う場合は、サーバー専用のservice roleキーも設定する。これは`NEXT_PUBLIC_`を付けず、チャット・ログ・クライアントコードへ貼らない。Vercelにも同名で設定する。

```
SUPABASE_SERVICE_ROLE_KEY=（Project Settings → API Keys の service_role）
```

本番でLabsを有効化する場合は、ページ/APIの有効化フラグと生成画像URLの署名鍵も設定する。署名鍵は十分に長いランダム値にし、`NEXT_PUBLIC_`を付けない。

```
LABS_ENABLED=1
LABS_OUTPUT_URL_SECRET=（ランダムな署名鍵）
```

初回のプラットフォーム管理者は、`0014_platform_roles.sql` 適用後にSupabase SQL Editorから付与する。

```sql
insert into public.platform_role_assignments (user_id, role)
select user_id, 'platform_admin'::public.platform_role
from public.users
where lower(contact_email) = lower('admin@example.com')
on conflict (user_id, role) do nothing;
```

logosプロジェクト専用のSupabase MCPは [.mcp.json](.mcp.json) に設定済みで、読み書きに対応する。環境変数`SUPABASE_ACCESS_TOKEN_LOGOS`を設定すると次回セッションから利用できる。接続先は必ずproject ref `xhbdfzceyfrxsmaixkne`と照合し、リモート書き込み前にはSQLをレビューして明示的な承認を得る。

#### 認証(サインアップ)

未ログインの利用者がアップロード操作を始めると、ファイルの保存前にサインアップ画面を開く。本登録後にアップロードできる。UIは Google → Apple → Figma → メール の順(ヘッダー右の「Sign in」から)。有効化に必要な設定:

- **メール+パスワード**: 既定で利用可。ただし **Confirm email が ON** だと確認メール後に本登録完了(UIは「確認メールを送信しました」を表示)。PoCで即時サインアップにしたい場合は Authentication → Providers → Email で **Confirm email を OFF** にする(組み込みSMTPは送信レート制限が厳しい点にも注意)
- **Google**: Supabase/Google Cloud設定とlocalhost実機ログインを確認済み
- **Apple / Figma**: ボタンは配線済み。各プロバイダを Authentication → Providers で有効化し、OAuthクライアント情報を登録すると利用可能になる
- **Adobe**: Supabaseに組み込みプロバイダが無いため未対応。デザイナー向けには Figma を採用している

Vercelにデプロイする場合は同じ環境変数を Settings → Environment Variables に追加する。

## 制約(PoC段階)

- トップ `/` でロゴをアップロードしてプレゼンまで生成できるのは**SVGのみ**。PNG/JPEG等のraster画像もロゴとして認識するが、専用プレゼンは準備中(現状は「準備中」表示のみで、`/p/[id]` は生成しない)。将来はraster用の別モードを用意する。CM MakerのURL解析で得たPNG/JPEG/WebPは`provisional`な仮ロゴとしてR2へ登録し、後から正式SVGへ差し替える
- 発注ボタンはlocalStorageに記録するのみで、実際の物品発注には連携していない
- Supabase未設定時は会社・ユーザーごとの分離やログインがない(localStorageモード)

## 残タスク・既知の課題

以下はバックログで、優先順位ではない。必要になったら引く。次に何をするかは [HANDOFF.md](HANDOFF.md) が持つ。この節に現在の状態を書かない。

#### ロゴ正規化(Phase A1)の残り

正規化そのものは実装済み・リモート適用済み([docs/asset-normalization.md §11.1](docs/asset-normalization.md) が正本)。残っているのはこの3つ:

1. **提案が出るのは動画のインベントリだけ**。測定は全経路で走っているので、トップやブランド素材のアップロードUIにも offer を置く作業が残る
2. **MP4の見た目での確認**(インク面積スケールが実際にどう効くか)
3. **Takeを削除して素材を `promote` すると正規化版だけ消える**(`delete_take` の昇格対象に `derived` が無い)。原本は残るので作り直せるが、昇格した原本が正規化版を失うのは正しくない

#### event-cm でこの先やると自然なもの

1. **読み方をTTS側の追加情報として後から注入する**(次セッションの本題・2026-08-17 方針確定)。

   **ナレーションのテキストは正確に書く。これがこの動画のオントロジーだから。** 絵コンテを読む人も、事実を突き合わせるLLMも、字幕も、全部この1行を読む。**TTSが読み違えるからという理由でひらがなに崩すと、動画の意味を担っている場所が壊れる**——実際にそうなっていて、「〆張鶴」が「しめはりつる」と書かれていた。

   **正しい向きは逆**: テキストは常に正確な表記(`〆張鶴`)にしておき、**TTSが読み違えたときだけ、仕上げの段で「読み方」を追加情報として渡す**。読み方はテキストの代わりではなく、**TTSへの注釈**。

   - 一度これを疑う価値がある: 「読み方」は**行の属性ではなく語の属性**ではないか。`〆張鶴 → しめはりつる` は、どの行に出ても、どのTakeでも同じ。行ごとに全文を書き直す形だと、テキストを1文字直すたびに読み方版が古くなる。**語の辞書**なら古くならないし使い回せる
   - 辞書がどこに属するかは未決: Take・ブランド・システムのどれか。「〆張鶴の読み」は主催者側の固有名詞なので**ブランドの基盤**([docs/asset-normalization.md](docs/asset-normalization.md) §7.0)に見えるが、あそこの判定は「その値はLPでも意味を持つか」なので当てはめ方を決める必要がある
   - **生成プロンプトの数字規則は残る**。「`2026.10.2` → `10月2日`」は読みやすさへの変換であると同時に**表記としても正しい**ので、崩す方の例ではない。崩れるのは固有名詞だけ(5番と同じ話)
   - **この判断は実地で確かめた**: 2026-08-17 の復元で、書き起こしから戻すときに「原文は `〆張鶴` か `しめはりつる` か」が分からなくなった。1つの欄が2つの役目を負っていると、**後から見て原文が復元できない**
2. **product-cm を同じ形に**。`cm_script` のままで、構成もまだ固定されていない。**`brief.narrator` の改名はこれとセット**——product-cm と共有しているので、今動かすとあちらが中途半端に新語彙へ引きずられる
3. **ナレーションに版が無い**。`brief` と `baked_brief` の2つしか無く、書き直しは前の版をどこにも残さず置き換える。**2026-08-17 に実際に事故った**——`force` 付きの書き直しで手仕上げの7行が消え、**復元できたのは録音WAVがR2に残っていたから**(Geminiで書き起こして戻した)。設計として残しているわけではないので、`force` の前にスナップショットを取るか、少なくとも直前の版を1つ持つ
4. **シードの下書きを原型ごとに変える**。現在は全業種で同じ7行([seed.ts](lib/templates/event-cm/seed.ts) の `DRAFT_LINES`)。`archetypeFor()` が既に業種から原型を選んでいるので、そこに文を持たせるだけ
5. **ナレーション生成プロンプトの数字の扱い**。実測で「Miss SAKE 2026」が「二千二十六 Miss SAKE」と割れた。規則(固有名詞の数字は開かない)は [narration.ts](lib/templates/event-cm/narration.ts) に書いてあるので、守られていないのは指示の位置か強さの問題。**1番と一緒に考えるとよい**(表示と読みが分かれれば、この規則は読み側だけの話になる)

#### 素材まわりで確定したこと(繰り返さないための要点)

- **ファイルは1つの絶対軸、情報はテンプレートごとのオントロジー**(§5)。判定は**「開けるものか、読むものか」**。価格・会場名・お客様の声は読むものなので brief の側で、`category` に足してはいけない
- **ブランドの基盤はLP・バナー・動画すべての手前にある層**(§7.0)。置けるのは「この会社について真であること」だけで、判定は**「その値はLPでも意味を持つか」**。BGMは×なのでテンプレートが持つ
- **既定値は4層**: ブランド → テンプレート×塗り(`artDirections[].bgm / visuals`。塗りが1つなら `defaultBgm` / `defaultVisuals`)→ システム(`DEFAULT_VOICE_PRESET`)→ 設計代替(墨の地・スタンダードのウォッシュ)。**4層目があるから上は空でよい**
- **名前は保存せず導出する**(§8.1)。分類を直すことがそのままリネームになる
- **意味は発明しない**(§8.2)。`AdobeStock_1894358160` に意味のある名前をLLMで付けない
- **null は「測っていない」であって false ではない**。この取り違えでこの領域は3回壊れた(白板バグ、落ちた `dark`、拡張子の無い書き出し)


#### 差し替え待ちの既定素材(2026-08-24 時点・仮置き)

**この段階の素材は全部仮置き。** 完全さは最後にまとめて調達し直す方針なので、ここは「気づいたが今は直さない」の置き場。プロンプトと要件の正本は [docs/demo-assets.md](docs/demo-assets.md)。

| 素材 | 何が足りないか |
| --- | --- |
| `stills/*.jpg`(6枚) | **Upscaleされていない**(1456×816)。1920×1080に敷くと1.32倍、Ken Burnsで合計**約1.5倍**になり眠い。Midjourneyの同ジョブUpscaleなら構図は変わらず 2912×1632 になる |
| `stills/shoji-vase.jpg` | やや3D CG寄りに見える。`visuals.value` の次点なので今は使っていない |
| `portraits/*.jpg`(6名) | 40〜70代しかない。20〜30代、和装、車椅子など**幅が無い**。プロンプトは4本しか投げていないので、増やすだけで済む |
| `marks/`(空) | **ダミーロゴが無い**。シーン1・8・9がマークを描くので、1本通すのに必要。生成AIでは作らずコードでSVG |
| `devices/`(空) | デバイス実景写真。あわせて架空のダッシュボード・銀行画面は**コード実装が未着手** |
| `bgm/`(2曲) | [catalog.ts](lib/templates/catalog.ts) 自身が `Placeholder` と書いている。テンプレート専用曲は未発注 |
| 連作の2枚目 | `tearoom-hearth` / `entrance-dusk` / `shoji-vase` は照明族を揃えてあるので、**1スロット=Nショット(Phase C9)が入ればそのままカットで繋がる**。それまでは次点として置いてあるだけ |

#### 素材まわりで次にやると自然なもの

1. **ブランドのキービジュアルを設定する操作面**。表示は出来た(未指定と言う)が、**指定する経路が無い**。素材を昇格させて `kind='keyvisual'` にする導線が要る。イベントのキービジュアルは会社のものではないので、v3では**イベントを子Brandにして、そこへ昇格させる**(Workは廃止した)
2. **取り込み時の「基盤に登録しますか」**(段階5の残り)
3. **余白トリミング**(段階7)。`derived_from_material_id` の最初の使い手を作る

#### Factory シリーズからの持ち帰り(2026-08-29)

このワークフローを別プロジェクト(`contents-factory`)へ移植した際、**向こうの構造から見て logos が直すべき点**の台帳が作られた(`/Users/kaya.matsumoto/projects/contents-factory/docs/05-carry-back-to-logos.md`——**別リポジトリなのでリンクは張らない**。育てる文書で、随時追記される)。指摘の精度は高く、**ファイルと行で名指しされたものは1件を除いて全部この時点で成立していた**(その1件は下記「書体」の項に書いた。**指摘より事態は悪かった**)。

##### やらなかったこと(理由。蒸し返さないために残す)

- **サブスクCLIでのLLM実行** — logos の要件ではない(依頼主判断 2026-08-29)。加えて Vercel の serverless では `spawn` できない。`llm-json.ts`(緩いパースの補正)も**CLI特有の癖の吸収**なので、structured outputs を使うこちらには要らない
- **指紋(ハッシュ)による差分実行への全面移行** — `baked_brief` は単なるキャッシュではなく**編集中の作業台と再生される版の分岐**で、**フィールド単位の差分マニフェストが6つの表示面を駆動している**([docs/video-state-model.md](docs/video-state-model.md))。指紋は「変わった」は言えても「BGMだけなら反映のみ・数秒」が言えない。台帳自身も「先に作業台の概念をどうするか決める必要がある」と認めている
- **シーン構成の契約ファイル化 / DAGの宣言データ化 / FS完結経路 / SSE** — 正しいが、効果が出るのは**テンプレートを増やすとき**。product-cm × standard に着手する時が再評価の好機。SSE はさらに**置き場所の決定とセット**(投げっぱなしのPromiseは長寿命のNodeサーバでしか成立せず、Vercel の serverless とは噛み合わない)

##### 今後やるべきこと

**`extract` → `structure` が全素材を2回ダウンロードし2回 sharp にかける**

[route.ts](app/api/brands/[id]/videos/[videoId]/run/[stage]/route.ts) が [extract.ts](lib/deliverable/extract.ts) の `extractTakeSources` を両方の段で呼ぶ。コード側の言い分「PDFの本体は run 行に載せられない」はPDFについては正しいが、**画像も巻き添え**になっている。直すには「読み取り結果をどこに置くか」(R2かレンダリング用の一時ディレクトリか)の決定が要る。

#### プレビューは音のバランスを保証しない（決定・2026-08-30）

**症状**: ブラウザのプレイヤーでBGMが終始一貫して小さく聞こえ、効果音だけが立つ。再生ごとに揺れる。**書き出したMP4では起きない**（実測 平均 −15.6 / ピーク −1.7 dB、曲そのものと0.1 dB以内で一致）。

**結論**: プレビューと書き出しは音について**別実装**で、両者のミックスを一致させる仕組みはどこにも存在しない。プレビューはリアルタイムのWebAudio（`volume` 関数を「いま画面に出ているフレーム」で1点だけ評価してGainNodeに即時代入）、書き出しはオフライン処理（フレームごとにPCMへ直接乗算）。音量値・カーブ・素材の修正を重ねても症状は消えず、**コンポジション側の設定では直らない**と判断した。原因調査はここで打ち切り（依頼主判断・2026-08-30）。

**運用**:

- プレイヤー直下に「プレビューでは音声のバランスが崩れます。実際の音量バランスは、MP4に書き出すことで確認できます」の注記を常設した（[EventCmWorkspace.tsx](components/video/EventCmWorkspace.tsx)）
- **音の判断はすべて書き出しで行う**。`--codec=wav` なら音声だけを数十秒で書き出して実測できる
- **プレビューで聴いて音量値を決めることは禁止**（2026-08-30 に +5 dB がそれで入り、MP4が「めちゃくちゃ大きな音」になった）

意図したミックスの構造（BGMは全音量で入り、ナレーションの間だけ下がり、効果音は一定の段で入る）は正しく、MP4がそれを証明している。過去の調査経緯（潰した仮説の一覧）はこの節の旧版としてgit履歴にある。

#### 未着手の既知の課題

- **event-promo(ナレーションなしの旧イベント動画)は廃止が決定**(2026-08-21)。ナレーションはこのサービスの動画の作り方そのもので、**字幕とボイスをオフにすればビジュアルだけの表現になる**ので、読み上げを持たないテンプレートを別に持つ理由が無い。ただし削除は「エントリを消す」ではなく**共有基盤の引き剥がし**——`remotion/event/` の `types.ts`(`EventPhoto` / `LogoTreatment`)・`palette.ts`・`brief-schema.ts`・`EventBackground` は kit と event-cm が土台として使っている。実案件3本が乗っているので独立した作業として行う

- **不正な `treatment` を持つ既存Take が1件**: `920d4cfe-3843-4a6c-b538-7238e79707d2` の `brief` / `baked_brief` 両方の **`logos[1]`(leopalace21)** が `knockout` のままで、**シーン8に白い長方形が出る**。ただし**バックフィルで測定値が入った**ので、マッピング段を再実行すれば `place-images.ts` が自己修復して `light` へ直す(`baked_brief` は「動画を作り直す」まで古いまま)。規則の側は確認済みで、`treatment` を書くのは `place-images.ts` の1箇所だけ、そこは必ず測ってから書く
- **絵コンテのシーン1・シーン9が、描いていないロゴまで名乗る**: `markScene` は `logos[0]` だけを描くのに `fields: ["logos"]` を宣言するため、`FactList` が配列全体を並べる。絵は1つ、値は2つ。`FactList` が添字パス(`logos.0`)を持てないので、**台帳に添字を入れるか、部品が描いた値を渡すか**の設計判断が要る
- **`licensed: false` の除外はMP4レンダー側が未実装**。プロジェクト書き出しだけが `unlicensedDefaults()` を呼ぶ。清算されていない曲を足すなら先にレンダー側を書く(既定BGMは全部清算済みなのでテストが守っている)
- **[docs/video-state-model.md](docs/video-state-model.md) の残り**: FactListの「未反映」チップと絵コンテのシーンの琥珀の点
- **未確認の画面状態は `unrun`(下書きのまま再生中)だけ**。新規Takeを1本追加すれば自然に見える

### そのほか

- **作業履歴の集約**: アセット詳細ページは変更ごとに「情報更新」を記録するため、一定時間内の同種更新をまとめる仕組みが必要
- **プレゼン編集に保存後のUndoがない**: 編集中の変更は「Save」までステージされるが、保存済み内容の版管理・復元は未実装
- **OAuth(Apple/Figma)は要プロバイダ設定**: Googleは設定・実機確認済み。Apple/FigmaはSupabase側のProvider設定が未完
- **図鑑の検索・タグ絞り込みは未実装**: 公開ロゴは新着順48件のグリッド表示のみ。タグはデータとして保存済み
- **個人ハンドルは未対応**: バニティURLのハンドルは組織のみ(設計上は共有名前空間で個人も可能)。`/[handle]` 単体のプロフィールページも未実装
- **ロゴ単位共有の付与UIが未実装**: `logo_access_grants`とメール招待用`logo_access_invites`はリモートDBへ適用済みだが、招待・付与・解除UIが未完
- **raster画像ロゴのプレゼンが未実装**: トップでPNG/JPEG等をアップロードするとロゴ認識はするが「準備中」モーダルを出すのみ。URL解析で取り込んだラスターロゴはツリーに入るが、行を開いても本体は画像1枚+「準備中」の一文([RasterLogoView](app/(management)/brands/[id]/logos/[logoId]/RasterLogoView.tsx))。専用アニメーション/データ経路(`LogoData`はSVG前提)を用意し、実プレゼンへ差し替える follow-up が残る
- **素材追加UI(event-promo)**: 動画詳細の input ステージから画像・BGMをアップロードして `brand_materials` に登録 → `take_inputs` に pin → 再レンダリングする一連のUIは次回フェーズ。現状はブリーフ内 `material:UUID` を source take から clone する経路のみ
- **CM Maker ↔ 動画詳細の resumeFor 配線**: 動画詳細(product-cm)の「CM Makerで再生成する →」が `/` に遷移するが、`?resumeFor=<videoId>` から該当TakeとbrandEntityを引継ぎ、Brand Kit+voiceを再生成する配線は未実装
- **video pipeline の extract ステージ**: 現状は常 `empty`。ブリーフから色/フォント/声を抽出するステージは将来拡張枠
- **ロゴの複製が未実装**: サイドバーの行メニューはロゴに詳細と削除だけを出す。master SVGとcandidateを複製し、新しいLogo+プレゼンTakeを作る経路(`create_brand_logo_with_presentation`の再利用)は次段。Organization / Brandの複製は器のコピーになるため設けない
- **削除の入口はサイドバーだけ**: `/brands/[id]/video` などのポータル一覧や各詳細ページには複製・削除を置いていない。同じ `lib/brand-tree-actions.ts` を使って広げる余地がある
- **R2削除キューを掃くワーカーが無い**: 削除に失敗したキーは `private.r2_deletion_queue` に残り、`npm run r2:prune` の手動実行を待つ

## デプロイ

Vercelにリポジトリを接続(プリセット: Next.js)。将来のCDN配信は Cloudflare R2 + Workers を想定。
