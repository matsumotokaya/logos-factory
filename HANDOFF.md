# HANDOFF

最終更新: 2026-09-07

## この文書の役割

現在の状態と次の作業だけを持つ。1週間後に古くならないことは [README.md](README.md) に書く。

- 40行を超えない
- 追記せず上書きする
- 作業ログを書かない

## 現在の状態

- **v3へ切り替え済み**(migration 0056 適用、コードは main)。Organizationはワークスペース、Brandは自由ツリー、Workは廃止、素材スコープは take / brand の2段。決定の正本は [docs/deliverable-architecture.md](docs/deliverable-architecture.md) §19、稼働構造は [docs/data-model.md](docs/data-model.md)。ワークスペース17・メンバー18・ユーザー136は健在
- **素材の使える範囲の規則を4行に確定した**(2026-09-07、[§2.4](docs/deliverable-architecture.md))。置いた Brand と配下から選べる・昇格はツリーを上へ・自動で入るのはマークだけ・D&Dで既存成果物は変わらない。v2の「継承元カラム」案は撤回。**コードは未対応**(基盤段と seed は自分の Brand しか見ない。0056 の trigger は祖先への移動を拒否)
- **動画の資料リストにオン/オフ**(2026-09-07、[BriefSourceIntake](components/video/BriefSourceIntake.tsx))。既定オン。オフ＝`take_inputs` の役割を `parked` に変える(`PATCH /api/brands/[id]/videos/[videoId]/materials`)。画面に載っている素材はオフ不可([lib/takes/source-toggle.ts](lib/takes/source-toggle.ts))。**依頼者のUI確認はまだ**
- ワークスペースは1つずつ表示、ブランド追加はツリー下のダイアログ(URLのみ)。アセットは本体と詳細(`…/info`)の2面、Brand未所属のロゴは `/logos/[id]` が詳細。URL→ロゴ取得はStage 1c。**依頼者のUI確認はまだ**
- 取り込みの枠は64項目([lib/brand/capture-frame.ts](lib/brand/capture-frame.ts))、実測/推定/まだわからないの3状態。サイトの画像はR2へ(`brand_materials` scope=brand)。再取り込みは `POST /api/brands/[id]/recapture`。**依頼者のUI確認はまだ**
- テスト435件・tsc 通過。**lint に既存の3エラー**(react-hooks/purity: [BrandVideoDetail](app/(management)/brands/[id]/video/[videoId]/BrandVideoDetail.tsx) の `Date.now()` ×2、`labs/freehand/sake-2026/src/freehand/Ground.tsx`)。HEAD時点のコードで出ており今回の変更が原因ではない
- 前セッション分(枠64項目・recapture・AddBrandDialog 等)と今回分(素材オン/オフ・正本改定)が**同じ作業ツリーに未コミット**
- 日本酒イベントは [labs/event/sake-2026/](labs/event/sake-2026/README.md) に保全。event-cm の `sumi` は承認済み、`standard` は静止画しか確認していない

## 次の作業

1. **取り込みの一本化**([asset-normalization §14-9](docs/asset-normalization.md)): 3経路が呼ぶ `lib/materials/intake.ts`
2. **PDF展開**(§14-11・§9.4): 子素材を作り、展開表示・ダウンロード・シーンの候補に出す。モデルには渡さない。まず `unpdf` で手元のPDFを実測(埋め込み画像がどれだけ取れるか、ベクタがどれだけ落ちるか)
3. **祖先の可視化と昇格**(§14-12・[§19.6-6,7](docs/deliverable-architecture.md)): 基盤段と seed が祖先を辿る、trigger 改定(migration・リモート適用は要承認)
4. v3の残り(§19.6): 同URLダイアログ、D&Dツリー、生成スイッチUI。枠の残り: `imagery.*`・`layout.sections.kind`・`voice.tone`
5. ワークスペース切り替えの通し確認。`standard` を1本焼く(`npm run event-cm:walkthrough`、課金あり)

## 判断待ち

| 件 | 内容 |
| --- | --- |
| 名前が空のワークスペース | `organizations.name` が空の行が10件以上。消すか名前を付けるか |
| 効果音を git に入れるか | 再配布禁止・リポジトリは PUBLIC。**非公開に切り替えれば解決** |
| README の書き直し | 172KB・35節で経緯が大半。`docs/old/` へ退避して短く書き直すか |
