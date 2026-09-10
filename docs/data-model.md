# Logos data model

更新日: 2026-09-03
ステータス: **V3稼働構造の正本**

V2の設計・移行判断の履歴は [schema-v2.md](old/schema-v2.md)、V3への作り替えの決定は [deliverable-architecture.md](deliverable-architecture.md) §19、アカウントとRLSの原則は [account-design.md](account-design.md) を参照する。本書はmigration 0056(2026-09-03適用済み)後の現在形だけを記す。

既存Brandへロゴを追加するときは`create_brand_logo_with_presentation`を使い、Logo・primary Candidate・`logo-presentation@1` Take・HTML Render・`logo_presentation` canonical slotを同一transactionで作る。単独ロゴ取り込み用の`create_logo_with_presentation`だけが未所属用Brandを補完する。

ロゴの本体は`/brands/[id]/logos/[logoId]`(プレゼンテーション。編集権限があれば編集可)、ロゴについての文字の頁は`/brands/[id]/logos/[logoId]/info`、閲覧は`/p/[id]`に分ける。動画・LPも同じ形で、本体のURLに`/info`を付けたものが詳細になる。`/logos/[id]`は`/info`へ転送するが、**Brandに属していないロゴ**(`create_logo_with_presentation` は`subject_entity_id`を空で作る)はツリー内に住所を持たないため、`/logos/[id]`と`/logos/[id]/presentation`がそのまま詳細と本体になる。`/p/[id]`は現時点ではLogo visibility + RLSに従う閲覧面であり、将来の明示的なPublication/live URLやユーザー指定URLを管理画面へ混ぜない。

## 1. 中心モデル

```text
Organization(ワークスペース = public.organizations)
  └── Brand(自由ツリー。parent_brand_id で任意にネスト)
        ├── BrandKnowledge claims / adopted values
        ├── BrandVariant
        ├── Logo → Candidate / Lockup / Variant / Mockup
        ├── BrandMaterial
        └── Take
              ├── pinned TakeInput → BrandMaterial
              ├── TakeRun
              ├── TakeRender → immutable RenderArtifact
              └── Publication

TemplateVersion ← Take
CanonicalSlot → Take
```

- `public.organizations`はワークスペース(テナント)。メンバー・権限・課金・上限はここに張る。実世界の会社を表す器ではない。
- `brand_entities`は利用者が作れる唯一のエンティティ。全行に`organization_id`(ワークスペース)が必須で、`parent_brand_id`で自由にネストする。`brand_kind`は付け替え可能なカテゴリー。
- `takes`はLP・動画・ロゴプレゼンなど、編集可能な成果物の版固定された実体。
- `take_renders`は出力条件、`render_artifacts`はR2に置かれた不変成果物。採用中の成果物だけを`latest_artifact_id`で指す。

旧`brand_profiles`、`brand_generation_runs`、`brand_assets`、`campaigns`系、`logo_presentations`、`brand_organizations`、`works`は存在しない。互換読み・二重書きも行わない。

## 2. OrganizationとBrand

`public.organizations`は**ワークサペース**——Stripeのビジネス切り替えと同じ「世界」の単位。メンバー(`org_members`)・招待・権限・将来の課金と上限はすべてここに張る。**実世界の会社ではない**ので、スクレープで分かった運営会社はBrandのKnowledge claimとして持つ。初回利用時に個人ワークスペースが1つ自動でできる(`public.ensure_my_workspace()`)。

`brand_entities`は1つのワークスペースに属し、`parent_brand_id`で自由にネストする。**ツリーは利用者の整理であり、組織構造でも継承でもない**。禁止されるのは自己参照・循環・別ワークスペースへのネストだけ(`enforce_brand_membership`)。

`brand_entities.source_url`は登録したURLで、**一意ではない**。同じURLのBrandはいくつでも並存でき、入口が「登録済みです。更新しますか」と聞く材料にだけ使う。同一性は`id`だけが持つ。

`brand_entities.brand_kind`は次の7種。表示ラベルであり、構造を決めない。

- `organization`
- `corporate`
- `business`
- `service`
- `product`
- `media`
- `event`

Brandの親子関係は`parent_brand_id`で表し、**同じワークスペース内に限る**。禁止されるのは自己参照・循環・別ワークスペースへのネストだけで、カテゴリーは構造を縛らない(`enforce_brand_membership`)。対象顧客別の差分は別Brandを乱造せず`brand_variants`に置く。

ロゴ、Knowledge、Take、MaterialはすべてBrandへ属する。ワークスペースを成果物の直接所有者にしない。

### 2.1 ブランドトップ(`/brands/[id]`)

`/brands/[id]` は4セクションから成る。

1. ブランド基本情報(`brand_entities` から name / kind / description / industry / location / website)
2. **わかっていること**。取得の枠([lib/brand/capture-frame.ts](../lib/brand/capture-frame.ts) の `CAPTURE_FRAME`)の全項目を、**採用 / 推定 / まだわからない**の3状態で出す。採用は `brand_knowledge_values`、推定は値の無いフィールドの**最新クレーム**(`brand_knowledge_claims`)、残りは「まだわからない」として項目名と用途を名指しする。値だけを読んでいた時期は、測り終えたブランドが何も知らないように見えた
3. **サイトから取り込んだ画像**(`brand_materials` の `scope='brand'` かつ `source_kind='url_fetch'`)。実際に描画した画面・キービジュアル・地紋。表示は署名付き同一オリジンURL(`/api/brands/[id]/materials/[materialId]/[name]`)経由
4. 3タイル(動画 / LP / ロゴ) — 各 `/brands/[id]/{videos,lps,logos}` へのエントリ

Organization詳細ページにはロゴ・パレット・タイポ等のBrand Profileを表示しない。Brand Profileは `/brands/[id]/logos/[logoId]/info` のLogoInfoPageでロゴ単位に表示する。

## 3. BrandKnowledge

抽出や生成で得た情報は`brand_knowledge_claims`へ追記し、利用者が採用した現在値を`brand_knowledge_values`へ置く。生成処理は採用済み値を上書きしない。

**何を採用するかの規則**(2026-09-03):

| 出所 | 層 | 保存先 | 理由 |
| --- | --- | --- | --- |
| ルールが実測した表現(配色・書体・寸法・構成) | expression | **確定値**(`url_extraction`で採用) | 決定論で再現でき、再取り込みで自己修復する |
| モデルが提案した表現(Chromium不在時のパレット、書体の性格) | expression | クレーム `suggested` | 誰も決めていないものを規則にしない |
| ページが記載している事実(電話・住所・SNS・著作権表記) | fact | クレーム `evidenced` | `adopt`は事実を`confirmed`と刻むが、クロールは何も確認していない |

`field_path`の正本は [lib/brand/capture-frame.ts](../lib/brand/capture-frame.ts) の `CAPTURE_FRAME`(`palette.*` / `typography.*` / `tokens.*` / `layout.*` / `imagery.*` / `tone.*` / `voice.*` / `identity.*` / `contact.*` / `social.*` / `offering.*` / `site.*`)。ゴール(`BRAND_ASSET_GOAL`)はこの枠の**expression層**から導出する——採用できるのは表現だけなので、事実をゴールに入れると永久に埋まらない行になる。

Takeのbriefは必要なKnowledgeだけを作成時に投影し、その後は独立して編集できる。

## 4. MaterialとTake

Materialのscopeは**BrandかTakeの2段**(Workはv3で廃止し、イベントは子Brandになった)。**行の所有者は1つで、所有者をまたぐときは行もバイトもコピーする**(2026-09-08。正本は [asset-normalization.md §12](asset-normalization.md))——動画作成時にBrandのマークはTakeスコープへコピーされ、複製はコピーの行を持ち、昇格はBrandスコープにコピーを作る。R2オブジェクトのchecksumとサイズを保存し、`take_inputs`がroleとchecksumを固定する。レンダー時に「現在のBrand素材」を再解決せず、Takeが固定した入力だけを使う。Brand側の変更・削除はできているTakeに届かない。

**ファイルと情報は別の軸で分類する**(正本は [asset-normalization.md §5](asset-normalization.md))。

- **ファイル**(`brand_materials`)は**サービス全体で共通の1つの絶対軸**で分類する。`category` は「何が写っているか」で、テンプレートと無関係に真(`kind` は媒体、`category` は内容、`opaque`/`luminance`/`width` は測定値。migration 0052・0053)
- **情報**は**テンプレートごとのオントロジー**が持つ。イベントは会場・参加費・プログラム、LPは料金プラン・お客様の声・FAQ——共通の一覧は作らない。実体はTakeの`brief`で、成果物を越えるものだけBrandKnowledgeへ上がる
- **どのスロットにどのファイルを置くか**も情報の側(`brief`のスロット、`take_inputs.role`)。だから「キービジュアル」は`category`の値になり得ない

判定は**開けるものか、読むものか**。`brand_materials`はバイト列の無い行を作れない(0028 `materials_has_body`)ので、価格や会場名に行を与えようとすると、その値を入れるためのファイルを作ることになる。

Takeは以下を必須とする。

- `tool_kind`
- `template_id` / `template_version`
- `brief_schema_version`
- schema検証済み`brief`
- `status`

作成は原子的RPCを使い、Take・既定Render・必要なRun/Slotを途中状態なしで作る。再試行可能な処理は`idempotency_key`と`request_hash`で同一要求を判定する。

### 4.1 作業中のbriefと、固定したbrief(`baked_brief`)

`takes`は**2つのブリーフを持てる**(migration 0050)。

| 列 | 意味 | 読む側 |
| --- | --- | --- |
| `brief` | 編集がそのまま溜まる**作業中**の値。すべての書き込み経路はここだけを書く | 絵コンテ、FactList、パイプラインの各段 |
| `baked_brief` / `baked_at` | **実行が固定した成果**。null = 一度も実行していない | プレイヤー、MP4レンダー([../lib/takes/render.ts](../lib/takes/render.ts))、公開URL |

**焼き付けを持つのは現時点で`event-cm`だけ**。他のテンプレートは`baked_brief`がnullのままで、レンダーは従来どおり`brief`を読む(`baked_brief ?? brief`)。書き込むのは`POST /api/brands/[id]/videos/[videoId]/bake`だけで、一括実行の最終段だけが呼ぶ。

分けた理由は、**編集が即座に成果物へ届いてしまう**状態を無くすため——ナレーションを1行保存すると、その場でプレイヤーの尺と字幕が変わっていた。「作業場と成果は違っていてよい。違いは画面が言う」が現在の契約で、差分判定の正本は [../lib/templates/event-cm/bake.ts](../lib/templates/event-cm/bake.ts)(設計の経緯は [event-cm-refactor-plan.md §9.5 / §11.1](old/event-cm-refactor-plan.md)・アーカイブ)。**差分の見せ方(フィールド単位のマニフェスト・琥珀/緑/赤の3色)は [video-state-model.md](video-state-model.md) が仕様**(2026-08-15確定・実装前)。

**2つある列は、briefのキーを改名するときも2つある**。migration 0051(`script` → `narration`)は同じ式を`brief`と`baked_brief`の両方に当てている。片方だけ改名すると既存の動画が「ナレーション空」として想定尺へ落ちるので、以後 brief のキーを変える migration はこの2列を必ずセットで扱う。

### 4.2 event-cm briefの語彙(`narration` / 字幕 / `voice`)

`event-cm`の`brief`が持つ主要フィールドは3語に割れている(migration 0051 で改名。経緯は [event-cm-refactor-plan.md §9.1](old/event-cm-refactor-plan.md))。

| フィールド | 実体 | 型 |
| --- | --- | --- |
| `brief.narration` | 各シーンの**主文**。字幕・尺・シーン構成を規定する**主**(旧 `brief.script`) | `EventCmNarration`([../remotion/event-cm/types.ts](../remotion/event-cm/types.ts)) |
| `…scenes[].reading` | **読み**(任意)。書かれていれば読み上げと尺はこちらを見る。字幕は常に`text` | `string \| undefined` |
| — (導出) | 字幕。`narration`を28字カードへ割った表示単位で、DBには持たない | [../remotion/event-cm/captions.ts](../remotion/event-cm/captions.ts) |
| `brief.voice` | **読み上げ**。`narration`を声にした派生物で、BGMと同じくオフにできる(オフは`provenance.voice`のsuppressionとして記録) | `{ track, audio: "material:<uuid>" }` |

`brief.narration`は**必須**(zodスキーマ [../remotion/event-cm/brief-schema.ts](../remotion/event-cm/brief-schema.ts) で non-optional)。読み手が`narration?.`と防御しないのはこのため——例外は`eventCmFilm()`の1箇所だけで、そこは「常に答える導出」であることを守るために欠損を空ナレーションとして扱う。

**`reading`は「目で読む文」と「耳で聞く文」を分けるためだけにある**(2026-08-21追加)。きっかけは実案件の「〆張鶴」——字幕は漢字のままでなければならないが、TTSはこの字を*しめはりつる*と読めない。かなを`text`に書けば声は直って字幕が壊れるので、**行まるごとの読みを別フィールドに置く**(単語単位の置換表にしない。TTSにそのまま渡せる文であることが、この機能の唯一の要件)。

規則は4つで、**読み上げ対象を決める式は [types.ts](../remotion/event-cm/types.ts) の `eventCmSpoken()` 1箇所**に閉じている。

1. **字幕は常に`text`**。`captionsFor()`は`reading`を見ない
2. **TTSに渡すのは`eventCmSpoken()`**(読みがあれば読み、無ければ本文)。文字数上限の判定も同じ式
3. **録音前の尺見積もりも`eventCmSpoken()`**。読みの長さがそのシーンの長さ——字面で見積もると、録音前だけ尺が違う映像になる
4. **`voice.track`は「読んだ文」を持ち、`reading`は持たない**。`voiceReadsNarration()`(bake.ts)は track と `eventCmSpoken()`を比べる。ここを`text`と比べると、読みのある行が**永久に「録音が古い」**になり、録り直しても解消しない

`reading`は人が入れる値なので、**下書きの再生成(`POST /narration`)は本文が変わらなかった行の読みを引き継ぐ**。LLMは読みを書かない(固有名詞の読みはイベントの事実ではなく名前の知識)ので、引き継がないと「ナレーションを書き直す」の一押しで手入力が黙って消える。

**`EventCmBrief`は`EventBrief`(event-promo)を継承しない**。共有するのは値の型(`EventPhoto` / `EventLogo` / `EventGuest` / `EventProgram` / `EventSchedule`)だけで、フィールドの一覧は別。継承していた頃は`sideCopy` / `visuals.inkArt` / `visuals.texture`という**どのシーンも描かない3つ**を持ち、それが goal と fact list に並んでいた。以後の規則: **ブリーフに足したフィールドは、どこかのシーンが読むこと**。

**briefのキーを消すときは migration が要らないことが多い**。zod 4 の `z.object()` は未知キーを strip し、書き込み経路はすべて `validateBrief` の**出力**を保存するので、次に保存された時点で消える。**キーを増やす/改名するときは焼き替えが必要**(strip では足せない)——その場合は上記のとおり`brief`と`baked_brief`の両方に当てる。

**`product-cm`はまだ`cm_script`のまま**。同じ「各シーンの主文」構造だが、共通語彙にするかは未決定([event-cm-refactor-plan.md §9.10](old/event-cm-refactor-plan.md))。共有コードの [../lib/voice/synthesize.ts](../lib/voice/synthesize.ts) はどちらの綴りも知らない。

## 5. Templateと成果物

テンプレート定義のコード正本は [../lib/templates/catalog.ts](../lib/templates/catalog.ts)、production台帳は`template_versions`。production版のdefinition hashがコードと異なる状態では新規Takeを作らない。

現在の主なテンプレートは次の通り。

- `campaign-lp@2`
- `product-cm@2`
- `event-promo@1`
- `logo-presentation@1`

HTML/MP4はR2が正本で、ローカルファイルを配信フォールバックにしない。ブラウザ配信は署名付き同一オリジンURLを使い、動画はHTTP Rangeに対応する。

### 5.1 event-promo テンプレート経路

event-promo は **Take と `take_inputs` がペアで作成される**設計になっているが、R2 / DB に実際の material が無い状態で `brief` の `event/<slug>/...` 相対パスだけを持っていると、レンダラーは画像を読み込めず失敗する。完成済み「世界が恋する日本酒」Take は R2 に 13件の material と最新MP4 artifact が揃っている。

`/brands/[id]/video` の「＋動画を追加」で **同じブランドの既存 event-promo Take** を選ぶと、新規Takeは RPC `clone_event_promo_take(p_source_take_id, p_new_take_id, p_created_by)`(migration 0047、0056で`p_work_id`を削除)で以下を引き継ぐ。

- `brief` をソースJSONそのまま上書き(`material:` URI はすでにDB参照形式になっている)
- `take_inputs`(role / material_id / checksum)を1件ずつ insert、`on conflict (take_id, material_id, role) do update` で material を再利用

POST `/api/brands/{id}/videos` の `templateTakeId` パラメータがこの経路を駆動する。`briefSlug`(bundled seed ブリーフ)は互換のため残し、サブセレクト「下敷きにする動画」で同じワークスペース内の既存 event-promo Takeが選べる。

### 5.2 動画パイプライン(動画詳細の4ステージ)

`/brands/[id]/video/[videoId]` ページ上部に、Slide-Factory 流のステージを表示する(`lib/pipeline/video.ts` + `components/pipeline/VideoPipelinePanel.tsx`)。**入力と抽出は1段**(2026-08-13統合)。

- **input(入力・抽出)** — pinされた素材と、その読み取り実行。素材があって未読み取りなら `stale`。テキストは決定論で読み、PDF・画像は「次の段で直接見る」と印をつけて運ぶだけ(`lib/deliverable/extract.ts`)。分けていたときは「読み取り成功」で止まった利用者が、反映されない動画を見ることになった
- **structure** — テンプレートのブリーフスキーマに対する充足率(EventBriefは title / kind / startsAt / venue / headline / ctaLabel 必須)
- **map** — テンプレートの選択状況(event-promo / product-cm)
- **output** — `take_renders.status` と `render_artifacts.created_at`(timestamp差分で `stale` 判定)

各ステージのステータス(`empty` / `ready` / `stale`)は読み取り専用で、実際の操作(ブリーフ編集・テンプレート切替・再生成)は下部の各workspace / button が担当する。

## 6. Publicationとcanonical slot

`publications`はRenderを公開面へ結び、公開終了時も履歴を保持する。`/c/<id>`や`/v/<id>`はTake/Render/Artifactを解決する。

`canonical_slots`は「このBrandまたはLogoで代表として使うTake」を一意に指す。ロゴプレゼンは`logos.id → canonical_slots(slot='logo_presentation') → Take`で解決し、編集状態は`Take.brief.presentation`に保存する。旧テーブルへのフォールバックはない。

## 7. Logoとpresentation asset

ロゴのmasterは`logos`とprimary `logo_candidates`。Lockup、colorway、生成モックアップは用途別テーブルへ分離する。Logo作成時はpresentation Takeとcanonical slotも同一RPC内で作られ、削除時もまとめて除去される。

`presentation_asset_definitions`は利用可能なassetの版と`draft / production`を管理する。ロゴごとの表示順・有効状態・パラメータは`logo-presentation` Takeの`brief.presentation.layout.mappings`、実行履歴は`logo_asset_runs`、現在の生成画像は`logo_mockups`が担う。

## 8. 削除と複製

削除の可否はスキーマが決めている。`on delete restrict` が置かれているのは「これがあると親を消せない」という宣言であり、UIはそれを言い直すだけで、独自の閾値を持たない。

| 対象 | 削除を止めるもの | 一緒に消えるもの |
| --- | --- | --- |
| `organizations`(ワークスペース) | 配下の`brand_entities`(`on delete restrict`) | 退会時のみ`delete_user_account`が中身ごと消す |
| `brand_entities` | `takes` / `brand_materials`。加えて`logos.subject_entity_id`と`brand_entities.parent_brand_id`は`set null`なので、**APIが先に数えて拒否する**(でないと到達不能な行が残る) | Knowledge claims/values、`brand_variants`、`brand_access_grants`、`canonical_slots` |
| `takes` | 参照している`canonical_slots`、`live`な`publications` | `take_renders` → `render_artifacts`、`take_inputs`、`take_runs`、take scopeの`brand_materials` |
| `logos` | — | `logo_candidates`、tags/credits/trademarks、`logo_activities`、`canonical_slots`、プレゼンTake |

- **Takeの削除は`delete_take(p_take_id, p_material_disposition)`が唯一の経路**(`takes`にDELETEポリシーは無い)。`require_decision`(既定)は、そのTakeだけが持つ`upload` / `url_fetch` / `ai_generated`素材があると`TAKE_DELETE_NEEDS_MATERIAL_DECISION`で止まり、DETAILに対象一覧を入れる。`promote`はscopeをbrand/workへ上げて残し、`discard`はR2ごと消す。参照数が0になったキーだけが`private.r2_deletion_queue`へ入る
- HTTP面は `DELETE /api/brands/[id]/videos/[videoId]`、`DELETE /api/brands/[id]/lps/[takeId]`(`?materials=promote|discard`)、`DELETE /api/brands/businesses/[id]`、`DELETE /api/brands/[id]`。実装は [../lib/takes/delete.ts](../lib/takes/delete.ts) がRPCの例外をHTTPステータスへ写す
- **ロゴの削除は`delete_logo_with_presentation`**。Logo・candidate・プレゼンTake・canonical slotを1トランザクションで消す。呼び出しはブラウザrepo(`repo.deleteLogo`)で、mockupのR2削除を先に済ませる
- **複製はTake(動画・LP)だけ**。[../lib/takes/duplicate.ts](../lib/takes/duplicate.ts) が`brief`・`baked_brief`・`take_inputs`(material_id + checksum)を写し、`createTake`で**現行のproduction版**に固定する。R2オブジェクトは共有され、`take_renders`は空から始まる。**複製に無いのはMP4であって映像ではない**ので、固定済みブリーフは引き継ぐ(引き継がないと、音声まで揃ったTakeの複製が「未実行」と名乗って不要なTTS課金が走る)。複製が元Takeのtake scope素材を指すため、元を`discard`で消すと複製が素材を失う——`promote`がその場合の正解であり、`delete_take`が選択を要求する理由でもある
- Organization / Brand / Logoに複製は無い。器のコピーは中身を持たず、ロゴの複製は別途master SVGの複写を要する

## 9. RLSと所有権

- 閲覧: そのBrandのワークスペースのメンバー、Brand共有を受けた利用者、対象Logoを閲覧できる利用者。
- 編集: ワークスペースのowner/admin/editor、またはBrand/Logoに明示された編集権限。
- Runの入力URL、コスト、エラーは編集者以上に限定する。
- 公開Artifactは署名・公開ルートから配信し、R2自体は非公開。

Supabase作業では必ずproject ref `xhbdfzceyfrxsmaixkne`を照合する。DB書き込みはSQLと影響範囲をレビューし、明示承認を得てから行う。

## 10. 現在のデータ

V3切替(migration 0056)でブランド世界を全消しした。保全した閉包は無い——納品済みの「世界が恋する日本酒」はJSONの参照物として [labs/event/sake-2026/](../labs/event/sake-2026/README.md) に落としてある。

R2の不要オブジェクト確認は`npm run r2:prune`(既定でdry-run)。バケットを走査してDBが指していないキーを消す。**`defaults/` は除外する**——効果音と既定素材はコードが参照していてDBに行が無く、消すと復元できない。
