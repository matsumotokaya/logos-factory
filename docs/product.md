# プロダクト構想(事業の正本)

最終更新: 2026-08-30

**この文書が正本として持つもの**: このプロダクトが何であり、なぜ作るのか。**持たないもの**——顧客セグメント、獲得チャネル、価格、工程表。**まだ何も決まっていないので書かない。** 技術の現在形は [data-model.md](data-model.md)、アーキテクチャ要件は [deliverable-architecture.md](deliverable-architecture.md)、現在地と次の一手は [HANDOFF.md](../HANDOFF.md)。

前身は [old/product-logo-management.md](old/product-logo-management.md)(2026-07-19・ロゴマネジメント起点)。2026-08-04 のピボット([deliverable-architecture.md §0.2](deliverable-architecture.md))が事業構想側に反映されないまま2か月動いていたので、ここで一本化した。

## 1. 前提

**生成AIによって、プロダクトを作れる機会が増える。** 作る側が増えれば、作ったものが見られ、使われるかどうかの側——Go-to-Market——に需要が移る。**そこに需要が出るはず**、というのがこのプロダクトの前提。

**これは前提であって、検証された市場ではない。** 誰にどう届けるかは決まっていない。

## 2. このプロダクトは何か

**ブランドの正本(System of Record)と、その正本から成果物を出す生成ワークフロー。**

- **正本**: 「この会社・この事業について真であること」を、出典と確度付きで持つ。ロゴ・色・書体・声・実績。
- **生成ワークフロー**: LP・動画・SNS・資料。正本を読んで作り、作った内容が正本に貯まる。使うほど次が速く正確になる。
- **読む口**: 正本を外部(CRM・自動化ツール・AIエージェント)から読めるようにする。公開 JSON・ファイル書き出し・API・MCP。

**内部設計では正本が芯、UI では成果物が主役。** 利用者が欲しいのは成果物であって正本ではない。トップページでは URL ひとつ・ロゴひとつを「ポンと入れるだけ」で成果物が出る——構造の精密さが入力負担に化けたら失敗([deliverable-architecture.md §1](deliverable-architecture.md))。

## 3. 「正本」を名乗れていない(2026-08-30 時点)

コードを照合した結果。**ここが企画と実装の最大のギャップ。**

| 主張 | 実際 |
|---|---|
| 正本がある | `brand_knowledge_claims` / `values` は稼働([0029](../supabase/migrations/0029_brand_knowledge.sql))。ただし**採用UIが無く `values` はほぼ空** |
| 成果物が正本から出る | **出ていない。** `campaign-lp@2` は `brief.kit` を焼き込んで描き、`brand_knowledge_values` を読まない([lib/takes/campaign-lp.ts](../lib/takes/campaign-lp.ts)、[lib/campaign/render-lp.ts](../lib/campaign/render-lp.ts))。knowledge を読む経路は [lib/templates/event-cm/seed-from-brand.ts](../lib/templates/event-cm/seed-from-brand.ts) だけ |
| 採用は人の明示操作 | **逆。** `values` を作っているのは URL 抽出の機械採用だけで、しかも見つからなくなった値を機械が DELETE する([lib/brand/import-assets.ts](../lib/brand/import-assets.ts))。`adopt_brand_knowledge`([0036](../supabase/migrations/0036_adopt_brand_knowledge.sql))は fact 層を出自に関係なく `confirmed` で刻む |
| 外部から読める | **読めない。** JSON を返す公開エンドポイントが1本も無い。到達できるのは `/p` `/c` `/v` の HTML/MP4 だけ |
| 外部組織が使える | **使える(2026-10-25)。** `/api/brands/**` 29本の門を `guardLabsRequest`(platform role)から [guardBrandRequest](../lib/brand-access.ts)(登録済みユーザーなら誰でも)に替えた。見える範囲はワークスペースの RLS が決める。「ブランドを追加」が呼ぶ生成の4本(`/api/labs/campaign/{generate,jobs,voice,video/[id]}`)も同じ門にした。Labs 権限が残るのはそれ以外の `/api/labs/**` と `/api/brands/backfill`(旧 Campaign Lab の移行)だけ |
| 本番で動く | LP 生成は detached job + ローカルFSで Vercel serverless では生きない。`captureSite`(Playwright)も動かず推定色になる |

## 4. 作る順序

前の節のギャップを埋める順。**日付は置かない。**

0. **CI**(`npm test` + `npm run docs:check` + lint/typecheck/build)。`.github/workflows` が無い。テスト48ファイルを回さずに正本の配線替えはしない
1. **`campaign-lp@2` を knowledge 投影で描く**。`brief.kit` の値を knowledge から解決し、brief には Take 固有値だけ残す
2. **採用UI**。claims→採用→再レンダー。同 PR で機械採用の格下げ、DELETE 廃止、`adopt` RPC の `source_kind → confidence` 写像
3. **field_path レジストリ**。実装の27パスに `mark.*`(クリアスペース・最小サイズ・禁止背景・反転条件)と `voice.*` を足す。`voice.* / audience.*` は `BrandTop.tsx` にラベルだけ存在し、書き手が無い
4. **公開 JSON + BRAND.md**。`brand_entities.knowledge_public`(既定オフ・明示公開)。`publications` 表は使えない(`surface` 5値 check、`render_id not null`。[0030](../supabase/migrations/0030_publications_canonical_slots.sql))
5. **外部組織が入れる門**。`guardLabsRequest` の解除範囲を実測。LP 生成を `run/[stage]` 方式へ
6. **法務6ページ**。`/company` `/contact` `/pricing` `/terms` `/privacy` `/legal/tokushoho` は**1つも存在しない**([components/SiteFooter.tsx](../components/SiteFooter.tsx) のリンク先が全部404)
7. その先: 課金、`brand_releases`、API キー(+ [lib/rate-limit.ts](../lib/rate-limit.ts) の分散化)、DTCG/SKILL.md、remote MCP、`file_extraction`、本番実行環境

**テンプレートは実案件が決める。** 受けた仕事の種類がテンプレートの種類になる。外部で作ったワークフローは [lib/templates/catalog.ts](../lib/templates/catalog.ts) に版固定で登録し、`remotion/kit/` の部品語彙へ寄せる。

## 5. 名前

**logos** 維持(小文字固定)。`SERVICE_NAME` / `SERVICE_TAGLINE` は [lib/config.ts](../lib/config.ts) の1箇所で変わる。

**最大の誤読リスクは「ロゴを作るツール」。** 由来(logotype = logos「言葉」+ typos「刻印」)を先に置く。「ロゴの前に、ロゴスがある。」/ *Before the logo, there is the logos.*

調べた事実:

- 米国第42類に Faithlife の文字商標「LOGOS」登録あり(Reg. 8115243、2026-01-27 登録。指定は聖書研究分野)。`logos` は英語でロゴの複数形なので、この分野では記述的と判断される可能性がある。**単独の文字商標ではなく結合商標**で出願する方が通りやすい
- 日本の「LOGOS」は株式会社ロゴスコーポレーション(アウトドア)が第9・11・21類に多数。第35・42類は未確認
- `logos.com` は Faithlife、`logos.ai` はデザイン系メディア、`logos.co` は別企業。`logos.design` / `logos.so` は未登録の可能性、`logos.dev` は 2026-10-13 満了

## 6. 決まっていないこと

**書かない、という判断。** 以下は思いつきの段階で、根拠が無い。決まったらここに書く。

- 誰に、どう届けるか(セグメント・チャネル・獲得)
- 価格と課金の形
- 工程の期日
- 受託(プロフェッショナルサービス)と製品の比率

**未確認のまま設計判断に使わないもの**: MCP の最新仕様、Canva Pro の Brand Kit がエージェントから読めるか、HubSpot Brand Kit の REST、EUIPO・J-PlatPat の類似群、ドメイン取得可否。実装・出願の前に一次情報で潰す。
