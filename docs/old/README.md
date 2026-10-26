# アーカイブ(役目を終えたドキュメント)

ここにあるのは**完了した計画・移行の記録**。現在の仕様や構造を知るために読む場所ではない——「今どうなっているか」は [../../README.md](../../README.md) の正本マップからたどる。ここを読むのは「**なぜこの形になったのか**」を遡るときだけ。

運用ルール:

1. 計画・移行・引き継ぎの文書は、**作業が完了したらここへ移す**。現役の正本マップに完了済みの計画が並んでいると、次のセッションがそれを「これからやること」と読み違える
2. 移すときは、(a) この索引に1行足す、(b) 元の場所を指していたリンクを全部張り替える、(c) 文書内の相対リンクを1階層深く直す
3. アーカイブは**編集しない**(記録なので)。誤りを見つけたら、現役の正本の側に正しいことを書く

| ドキュメント | 何だったか | 完了 |
| --- | --- | --- |
| [product-logo-management.md](product-logo-management.md) | プロダクト概要とビジネスプラン(2026-07-19)。**ロゴマネジメントを起点に据えていた頃の事業構想**——SVGを1つ上げるとガイドラインが出る、3層構想(ガイドライン生成→ロゴ正本/CDN→ノベルティ発注)、ロゴ図鑑、Figma/Photoshopは納品物。2026-08-04 のピボット(マーケティングツール生成)が反映されないまま正本マップに残っていた。**現在の正本は [../product.md](../product.md)** | 2026-08-30 |
| [event-cm-carryback-log.md](event-cm-carryback-log.md) | Freehand Lab からの持ち帰りとロゴ正規化のセッション記録(2026-08-17〜19)。event-cm の構成固定・語彙統一(`ナレーション`/`ボイス`/`字幕`)・kitの語彙拡張(モダンジャパニーズ化)・素材の測定と正規化(migration `0055`)。**そこへ至った議論の経緯**を残したもので、決まった中身の正本はルートREADMEの event-cm 節と [../asset-normalization.md](../asset-normalization.md) | 2026-08-19 |
| [event-cm-refactor-plan.md](event-cm-refactor-plan.md) | Event CM リファクタリング計画。1セッションで出た11件のバグの分析、`eventCmFilm()` への導出一本化、`brief`/`baked_brief` の分離(絵コンテ=作業場・プレイヤー=成果)、`script`→`scenario` 改名、`EventCmBrief` の自立、負債の完済(§12)。**確立した規則8つは §10** — これだけは現役の価値があるが、要点は [../../README.md](../../README.md) の event-cm 節と [../data-model.md](../data-model.md) に転記済み | 2026-08-15 |
| [event-cm-image-screening-plan.md](event-cm-image-screening-plan.md) | Event CM 画像の自動選定と背景写真の計画。意味判定を構造化の1回に統合、配置は決定論、由来4値、`Scene.backdrop`。実装A〜E完了 | 2026-08-14 |
| [migration-log.md](migration-log.md) | migration `0023`〜`0055` が**なぜ在るのか**の記録。ルートREADMEのSupabaseセットアップ節に手順と同じ段落で埋まっていたものを切り出したもの。適用済みかどうかは記録ではなく `list_migrations` で確認する | 2026-08-21 |
| [schema-v2.md](schema-v2.md) | v2移行の履歴と判断記録(migration 0023〜0046 の段取り、切替の実測、監査 `npm run v2:audit`)。稼働構造の現在形は [../data-model.md](../data-model.md) | 2026-08-08 |
| [device-mockup-fixes.md](device-mockup-fixes.md) | CM Maker の LP と管理画面サムネイルで使っていたデバイスモックアップ(`deviceMockupHtml()`)の正本と残課題。2026-10-26 に CM Maker と LP の描画ごと削除したので役目を終えた。3Dモデル(`public/models/`)はロゴのモックアップとWorkflow Labが引き続き使う | 2026-10-26 |
