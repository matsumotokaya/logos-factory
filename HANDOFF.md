# HANDOFF

最終更新: 2026-09-08

## この文書の役割

現在の状態と次の作業だけを持つ。1週間後に古くならないことは [README.md](README.md) に書く。

- 40行を超えない
- 追記せず上書きする
- 作業ログを書かない

## 現在の状態

- **v3へ切り替え済み**(migration 0056 適用、コードは main)。Organizationはワークスペース、Brandは自由ツリー、Workは廃止、素材スコープは take / brand の2段。決定の正本は [docs/deliverable-architecture.md](docs/deliverable-architecture.md) §19、稼働構造は [docs/data-model.md](docs/data-model.md)。ワークスペース17・メンバー18・ユーザー136は健在
- **素材の使える範囲の規則を4行に確定した**(2026-09-07、[§2.4](docs/deliverable-architecture.md))。置いた Brand と配下から選べる・昇格はツリーを上へ・自動で入るのはマークだけ・D&Dで既存成果物は変わらない。v2の「継承元カラム」案は撤回。**コードは未対応**(基盤段と seed は自分の Brand しか見ない。0056 の trigger は祖先への移動を拒否)
- **項目ごとの由来を素材IDで持つ**(2026-09-07、[asset-normalization §9.5](docs/asset-normalization.md))。構造化が根拠IDを返して検証し、map / place-images が `provenance[path].sources` を書く。**資料を「外す」と、その資料だけに立っていた値と、その素材を指すスロットがその場で仮に戻る**([withdraw.ts](lib/templates/event-cm/withdraw.ts))。資料単位のオン/オフは同日に実装→撤回(層が違った)。**入力ドロワーは2段**: 「追加した資料」=未読み取りのステージング、「抽出した資料」=読み取り済み(外すはここ)。入力段の新旧は読んだ集合と今の集合の差。4段目は「動画プレビュー」(MP4と区別、2026-09-08)。**依頼者のUI確認はまだ**。既存の動画は読み直すまで由来未記録
- **素材はコピーし共有しない、に切り替えた**(2026-09-08 依頼者決定、[asset-normalization §12](docs/asset-normalization.md))。所有者は1つ。動画作成時にブランドのマークを動画へコピー、複製は行ごとコピーして brief/baked_brief を書き換え、昇格はブランドへのコピー(1クリック)。ブランド側の削除はピンを見ず、動画の削除は常に捨てる。正本は [copy.ts](lib/materials/copy.ts)。**既存データは移行しない**(デモデータ。旧動画がブランドのマーク行を直接ピンしたままで、それを消そうとすると FK が拒否して1文で言う)。**依頼者のUI確認はまだ**(動画作成・複製・昇格・削除の通し)
- **素材の削除を実装した**(2026-09-08、§9.4)。以前の「外す」はピン解除だけで、間違えたアップロードを取り消せなかった。ゴミ箱は本物にして、**家系まるごと**(PDFは中身と一緒に)消す。順序はピン→brief撤回→行→R2、2クリック。入力段とインベントリが同じ瞬間に失う。**migration 0057 は未適用**——0028 のDELETEポリシーが core 段だけなので、適用まで編集者は自分の資料を消せない(リモート適用は要承認)
- **素材の一覧は1つの行に寄せた**(2026-09-08、§9.4)。「抽出した資料」・インベントリ・ブランドのドロワーが [MaterialRow](components/materials/MaterialRow.tsx) を共有し、動詞だけスロットで渡す。全行が容器で、開くと本体+中身がダウンロードできる。署名付きURLの発行も [signed-url.ts](lib/materials/signed-url.ts) の1箇所
- **PDF展開を実装した**(2026-09-08、[asset-normalization §9.4](docs/asset-normalization.md))。取り出しは [lib/materials/pdf.ts](lib/materials/pdf.ts)(unpdf・XObject+inline)、登録は [pdf-children.ts](lib/materials/pdf-children.ts) を動画・ブランド・後追い expand の3経路が呼ぶ。子は `derived` + `pdf_image` ピン、PDF 本体は従来どおり丸ごと LLM へ。「抽出した資料」の PDF 行の ▸ で全件展開・1点ずつダウンロード。実測(Canva フライヤー)は 79点/1.4秒、ベクタ(アイコン・罫)は落ちる。**依頼者のUI確認はまだ**(ブラウザでの通し確認・R2/DB への書き込みは未実施)
- ワークスペースは1つずつ表示、ブランド追加はツリー下のダイアログ(URLのみ)。アセットは本体と詳細(`…/info`)の2面、Brand未所属のロゴは `/logos/[id]` が詳細。URL→ロゴ取得はStage 1c。**依頼者のUI確認はまだ**
- 取り込みの枠は64項目([lib/brand/capture-frame.ts](lib/brand/capture-frame.ts))、実測/推定/まだわからないの3状態。サイトの画像はR2へ(`brand_materials` scope=brand)。再取り込みは `POST /api/brands/[id]/recapture`。**依頼者のUI確認はまだ**
- main に直接コミット済み(2026-09-07〜08、16件)。lint エラー0(警告は既存の未使用変数のみ)、テスト453件・tsc・`next build` 通過。**push はまだ**
- 日本酒イベントは [labs/event/sake-2026/](labs/event/sake-2026/README.md) に保全。event-cm の `sumi` は承認済み、`standard` は静止画しか確認していない

## 次の作業

1. **テンプレート契約と1つの編集面**(2026-09-09 依頼者決定。要件定義は [docs/template-contract.md](docs/template-contract.md)・**実装前**。動画とLPのアンバンドルは §2.1 の3件のうち2件を同日に解消済み)。テンプレートが変えるのは中身だけで編集面は変えない。いま動画詳細は `event-cm` 限定のゲートが7箇所あり、2026-08〜09 の改修(素材の正規化・由来と撤回・PDF展開・コピー型)は全て `event-cm` 側にしか入っていない=**構造の負債**。**未決定4件は 2026-09-09 に決着**(トップは製品サイト+ボタン、一気に立ち上げるはブランド作成に含める、Brand Kitはブランドの土台で全成果物が受け取る、`lib/templates/event-cm/` は汎用=`lib/deliverable/`と固有=`lib/templates/event-cm/`に分ける)。残る未決定はスクリーニングの設計だけ。段階は (1) 契約レジストリ+汎用/固有の分割 (2) 画面の分岐を消す (3) 製品紹介動画を契約に載せる(**描画は資産なので触らない**・旧2件は削除・`addable` を戻す) (4) LPをブランドから作れるようにする(旧3件は削除) (5) CM Makerを外す (6) `event-promo` 退役 (7) スクリーニング(**1〜6と独立**・大量入力は今日すでに失敗する)。**過去のインスタンスは全て捨てる**(デモデータ)
2. **PDF展開の続き**(§9.4「残り」): 依頼者のUI確認 → シーンの「選ぶ／差し替え」候補に子を出す(役割フィルタに `pdf_image` を足すだけ) → ページ画像化(`@napi-rs/canvas`、動作確認済み・未採用)とベクタの切り出し → 取り込みの一本化(§14-9)
3. **祖先の可視化と昇格**(§14-12・[§19.6-6,7](docs/deliverable-architecture.md)): 基盤段と seed が祖先を辿る、trigger 改定(migration・リモート適用は要承認)。依頼者が次に作る**シリーズ物のイベント動画セット(モダンジャパニーズの後継)**で素材を流用する前提
4. v3の残り(§19.6): 同URLダイアログ、D&Dツリー、生成スイッチUI。枠の残り: `imagery.*`・`layout.sections.kind`・`voice.tone`
5. ワークスペース切り替えの通し確認。`standard` を1本焼く(`npm run event-cm:walkthrough`、課金あり)

## 判断待ち

| 件 | 内容 |
| --- | --- |
| 名前が空のワークスペース | `organizations.name` が空の行が10件以上。消すか名前を付けるか |
| 効果音を git に入れるか | 再配布禁止・リポジトリは PUBLIC。**非公開に切り替えれば解決** |
| スクリーニングの設計 | 大量入力(50ページの資料など)から何をモデルに渡すか。**別セッションで取り組む**(2026-09-09 依頼者)。現状は入り切らないと「PDFを分けてください」で失敗し、選別を利用者に押し付けている。要件は [template-contract §4.2](docs/template-contract.md) |
| README の書き直し | 172KB・35節で経緯が大半。`docs/old/` へ退避して短く書き直すか |
