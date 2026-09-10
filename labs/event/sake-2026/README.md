# sake-2026 — 納品済みイベント動画の参照物

「世界が恋する日本酒」(レオパレス21 × WealthPark Lab、2026年)の **event-cm / event-promo Take をJSONに固めたもの**。次に同じフォーマットで別のイベントを作るとき、ゼロからではなくここから始める。

**なぜファイルなのか**: この閉包は2026-09-03のv3移行([docs/deliverable-architecture.md](../../../docs/deliverable-architecture.md) §19)でデータベースから消えた。動画は納品済みで、残す価値があるのは**ブリーフの構造と素材の割り当て方**なので、実体をJSONへ落としてリポジトリに置いた。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `event-cm.json` | **これが主**。イベント紹介動画(ナレーション駆動・承認済みの`sumi`で焼いたもの)。`take` / `brief` / `bakedBrief` / `inputs` / `deliverables` |
| `event-promo.json` | 同じイベントの30秒PV(ナレーションなし)。素材13点が**役割名(`event.logo.leopalace21` など)で固定**されている例 |
| `event-cm-more-examples.json` | 同じテンプレートの別イベント(セミナー)2本。書き方の振れ幅を見るため |
| `materials.json` | 素材44点の台帳。`repoPath` はこのリポジトリ内の実ファイル、`inGit` はそれがgit管理下か |
| `brand.json` | 主体だったBrand(WealthPark Lab)と、採用済みのブランド知識 |

**`material:<uuid>` は解決済み**。ブリーフ内の素材参照は `{"$material": "...", "label": "bgm.mp3", "repoPath": "public/event/sake-2026/bgm.mp3", "inGit": false}` の形に展開してあるので、どのスロットにどんなファイルが入っていたかがJSONだけで分かる。

## 素材の実体はここに無い

| 分類 | 点数 | 所在 |
| --- | --- | --- |
| ロゴ(git管理) | 4点 | `public/event/sake-2026/logos/` |
| 写真・アート・BGM | 13点 | ローカルのみ。`.gitignore` が `/public/event/*/photos/` `/art/` `bgm.mp3` を除外している |
| アップロード素材・音声・MP4 | 30点 | ローカルの `var/archive/sake-2026/`(121.5MB、gitignore対象) |

**このリポジトリはpublicで、素材にはライセンス付きストックフォトが含まれる**ため、バイナリはコミットしない。`var/archive/sake-2026/` はこのMacにしか無いので、必要なら別途バックアップする。

## 次のイベントを作る

1. **素材を整える**: 生の素材フォルダを決定論スクリプトに通す。巨大なストックフォトの縮小、人物写真の焦点指定、暗背景用のロゴ抜きをまとめて行う

   ```bash
   node labs/event/scripts/prepare-assets.mjs --src <生素材のdir> --slug <新しいslug>
   ```

2. **ブリーフの型を写す**: `event-cm.json` の `brief` が全フィールドの実例。`title` / `subtitle` / `seriesLabel` / `schedule` / `programs` / `guests` / `valueLines` / `valueChip` / `cta` / `footnote` / `logos` / `visuals` / `bgm` / `theme` / `narration` / `voice`。**`guests` は登壇者が居なければ節ごと消える**(居ない人を紹介しないため)ので、無ければ書かない

3. **アーキタイプを選ぶ**: [lib/templates/event-cm/archetypes.ts](../../../lib/templates/event-cm/archetypes.ts) の6種 — `finance-talk` / `learning-session` / `tech-meetup` / `tasting` / `public-lecture` / `general-seminar`。日本酒は `tasting` だった。バイオリンの演奏会なら `public-lecture` か `general-seminar` が近い

4. **通しで焼いて確認する**: シード→ナレーション執筆→読み上げ→MP4を1コマンドで通す。LLMとTTSを呼ぶので課金される

   ```bash
   npm run event-cm:walkthrough
   ```

5. アートディレクションは `sumi`(モダンジャパニーズ)と `standard` の2種。日本酒は `sumi` で焼いて承認された

## v3以降の注意

[scripts/import-event-materials.ts](../../../scripts/import-event-materials.ts) は素材を **Workスコープ**で登録する。v3でWorkは廃止された(イベントは`category=event`の子Brandになる)ので、**このスクリプトはそのままでは動かない**。次に使うときはBrandスコープへ書き換える。`event-promo.json` の `inputs` が持つ役割名の割り当て方自体は変わらない。
