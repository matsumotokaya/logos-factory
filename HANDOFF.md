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
- **項目ごとの由来を素材IDで持つ**(2026-09-07、[asset-normalization §9.5](docs/asset-normalization.md))。構造化が根拠IDを返して検証し、map / place-images が `provenance[path].sources` を書く。**資料を「外す」と、その資料だけに立っていた値と、その素材を指すスロットがその場で仮に戻る**([withdraw.ts](lib/event-cm/withdraw.ts))。資料単位のオン/オフは同日に実装→撤回(層が違った)。**入力ドロワーは2段**: 「追加した資料」=未読み取りのステージング、「抽出した資料」=読み取り済み(外すはここ)。入力段の新旧は読んだ集合と今の集合の差。4段目は「動画プレビュー」(MP4と区別、2026-09-08)。**依頼者のUI確認はまだ**。既存の動画は読み直すまで由来未記録
- ワークスペースは1つずつ表示、ブランド追加はツリー下のダイアログ(URLのみ)。アセットは本体と詳細(`…/info`)の2面、Brand未所属のロゴは `/logos/[id]` が詳細。URL→ロゴ取得はStage 1c。**依頼者のUI確認はまだ**
- 取り込みの枠は64項目([lib/brand/capture-frame.ts](lib/brand/capture-frame.ts))、実測/推定/まだわからないの3状態。サイトの画像はR2へ(`brand_materials` scope=brand)。再取り込みは `POST /api/brands/[id]/recapture`。**依頼者のUI確認はまだ**
- main に直接コミット済み(2026-09-07〜08、13件)。lint エラー0(警告7件は既存の未使用変数)、テスト435件・tsc 通過。**push はまだ**
- 日本酒イベントは [labs/event/sake-2026/](labs/event/sake-2026/README.md) に保全。event-cm の `sumi` は承認済み、`standard` は静止画しか確認していない

## 次の作業

1. **PDF展開**(別セッションで着手。仕様と実装の入口は [asset-normalization §9.4](docs/asset-normalization.md)): `unpdf` で手元のPDFを実測 → 子素材(派生)を作る → 「抽出した資料」のPDF行に ▸ で中身を全件展開・1点ずつダウンロード → シーンの候補へ。**最初の到達点は「子をダウンロードして別イベントに上げ直せる」**。目的は素材をブラックボックスにしないこと。取り込みの一本化(§14-9)はこの関数を核に後追い
2. **祖先の可視化と昇格**(§14-12・[§19.6-6,7](docs/deliverable-architecture.md)): 基盤段と seed が祖先を辿る、trigger 改定(migration・リモート適用は要承認)。依頼者が次に作る**シリーズ物のイベント動画セット(モダンジャパニーズの後継)**で素材を流用する前提
3. v3の残り(§19.6): 同URLダイアログ、D&Dツリー、生成スイッチUI。枠の残り: `imagery.*`・`layout.sections.kind`・`voice.tone`
4. ワークスペース切り替えの通し確認。`standard` を1本焼く(`npm run event-cm:walkthrough`、課金あり)

## 判断待ち

| 件 | 内容 |
| --- | --- |
| 名前が空のワークスペース | `organizations.name` が空の行が10件以上。消すか名前を付けるか |
| 効果音を git に入れるか | 再配布禁止・リポジトリは PUBLIC。**非公開に切り替えれば解決** |
| README の書き直し | 172KB・35節で経緯が大半。`docs/old/` へ退避して短く書き直すか |
