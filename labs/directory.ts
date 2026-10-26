// The lab constellation — one catalog for every R&D lab, current and planned.
//
// Labs are grouped into two modes plus a future slot. The split is the
// product's core promise made visible:
//
//   保証モード (assurance)   — the logo is NEVER altered. Deterministic
//                              pipelines only. This is the backbone used in
//                              daily work: guidelines, mockups, print files.
//   探索モード (exploration) — generative AI interprets the logo. Deviation
//                              is not forbidden but dialed, measured and
//                              shown; the user weighs risk vs. reward (and
//                              cost). "Harness" = control + instrumentation,
//                              not prohibition.
//   統合 (integration)       — future slot: assembling individual assets
//                              into final marketing outputs (CM, banners,
//                              landing pages). Placeholder for now.
//
// Shared bar for every lab: 「ロゴが立派に見えるか」— never "does it move".

export type LabStatus = "active" | "planned";

export type LabMode = "assurance" | "exploration" | "integration";

export const MODE_ORDER: LabMode[] = ["assurance", "exploration", "integration"];

export const MODE_INFO: Record<LabMode, { label: string; description: string }> = {
  assurance: {
    label: "保証モード",
    description:
      "ロゴを1ピクセルも崩さないことが保証される、プロダクトの根幹。ガイドライン・定番モックアップ・印刷入稿物など「絶対に崩せない用途」を担う。通常業務で使うのはこちら。",
  },
  exploration: {
    label: "探索モード",
    description:
      "生成AIにロゴを解釈させ、決定論では作れない表現を探す領域。逸脱を禁止するのではなく、方向をダイヤルで制御し、結果を計器盤で見せる。リスクとリターン(とコスト)は使う側が理解して選ぶ。",
  },
  integration: {
    label: "統合モード",
    description:
      "複数のソースとアセットを統合し、LP・CM・バナーなどのマーケティング最終出力に仕立てる領域。成果物はブランドから作る（/brands）。",
  },
};

export type LabModule = {
  title: string;
  body: string;
};

export type LabInfo = {
  /** URL segment under /labs/. */
  slug: string;
  /** Short product-style name, e.g. "Motion Lab". */
  name: string;
  /** Japanese descriptor shown next to the name. */
  titleJa: string;
  tagline: string;
  status: LabStatus;
  /** Which mode this lab belongs to (assurance / exploration / integration). */
  mode: LabMode;
  /** Where this lab sits in the experience/pricing staircase. */
  layer: string;
  description: string;
  /** What gets researched / built here. */
  scope: string[];
  /** Planned research modules (the deep-research plan). */
  modules: LabModule[];
};

export const LABS: LabInfo[] = [
  {
    slug: "motion",
    name: "Motion Lab",
    titleJa: "ロゴモーション研究所",
    tagline: "生成AI以前の、アルゴリズムで実行できる表現レイヤーの網羅",
    status: "active",
    mode: "assurance",
    layer: "レイヤー1〜2: 静的ガイドライン配置・SVG/3Dモーション(限界費用ゼロ・全ユーザーに無料で配れる層)",
    description:
      "SVG・CSS・Canvas・Three.js・Lottie による、コードだけで任意のロゴに自動適用できる表現のカタログ。全16実験が稼働中で、001 Classic Reveal を基準器として印象タグ・星評価・研究ノートで採用判断を蓄積する。技術的にシンプルだからこそ、センスとアイデアで印象が大幅に変わる層。",
    scope: [
      "Reveal(出現)系: 輪郭線ドロー・マスクワイプ・ブラーフォーカス・パス時差構築・粒子集合",
      "質感系: 金属光沢スイープ・ロングシャドウ",
      "常駐ループ系: ブリージング・アンビエント背景",
      "プレゼンテーション系: ガイドライン製図演出・ロックアップ切替",
      "3D系: 押し出しターンテーブル・マテリアル比較・ギャラリー空間",
      "書き出し検証: Lottie往復・動画書き出しフック",
    ],
    modules: [
      {
        title: "組み合わせ検証(v2)",
        body: "シーケンス再生(実験A→B)と、背景系実験+ロゴ系実験の重ね合わせの検証。",
      },
      {
        title: "本体への移植",
        body: "採用が決まった実験をプレゼンテーション(/p/[id])のシーンとして組み込む。各実験は1ファイル完結で移植前提の構造。",
      },
    ],
  },
  {
    slug: "workflow",
    name: "Workflow Lab",
    titleJa: "保証合成研究所",
    tagline: "ロゴを1ピクセルも崩さない、決定論的合成とプロツール連携",
    status: "active",
    mode: "assurance",
    layer: "レイヤー1〜2.5: テンプレート合成+プロツール連携(無料〜低中課金。無料体験の画像セットはここで変動費ゼロ成立)",
    description:
      "モックアップ/ブランドビジュアル生成パイプラインの本丸(旧称 Image Lab)。生成モデルにロゴ本体は絶対に触れさせず、レイヤー合成・テンプレート差し替えという決定論的処理でのみ扱う(要件の正本は labs/workflow/README.md)。Phase 1(2Dテンプレートフォーマット+合成エンジン+テンプレート3種+原価計測)が稼働中。将来はヘッドレスBlender・Photoshop・Figma連携という複雑なワークフローもここに集約する。",
    scope: [
      "2Dテンプレートフォーマット(合成面パース・ディスプレイスメント・ライティング乗算・クリアスペース)の設計と拡充",
      "決定論的合成エンジン(sharp+純TSホモグラフィ)と1ジョブ単位の原価計測",
      "Phase 2: QAゲート(忠実度・配置ジオメトリの回帰テスト)+ヘッドレスBlenderワーカー(コスト/秒の実測)",
      "Photoshop API(スマートオブジェクト差し替え)・Figma連携・モックアップ素材の権利関係",
    ],
    modules: [
      {
        title: "Phase 1: 決定論的合成の実験場(稼働中)",
        body: "テンプレートはコード変更なしで追加でき(labs/workflow/templates/)、選択中のロゴがプレゼン本編の各セクション棚に即時合成される。各テンプレートは個別詳細ページで配置・色処理・技術解説・研究ノートを詰め、完成したものを本編へ移植する。",
      },
      {
        title: "未解決事項の検証",
        body: "テンプレート焼き込みライティングとAI生成舞台の光の整合、細線・グラデーションSVGのラスタライズ品質、Blenderレンダリング実コスト。",
      },
    ],
  },
  {
    slug: "generative",
    name: "Generative Lab",
    titleJa: "生成AI探索研究所",
    tagline: "逸脱を禁止せず、制御し・計測し・見せる——生成AIハーネスの実験場",
    status: "active",
    mode: "exploration",
    layer: "レイヤー3〜4: 生成AIハーネス(画像+映像。中〜重課金。無料キャンペーンは原価計算が前提)",
    description:
      "生成AIにロゴを解釈・変形させることを仕様として許容し、決定論では作れない表現(風化した看板・ネオン・刺繍・シネマティックなキーアート)を探す実験場(要件の正本は labs/generative/README.md)。画像と映像を同居させるのは、動画生成がほぼ必ず参照画像を起点にするため——「作ったブランドイメージを動かす」までが一連の流れになる。",
    scope: [
      "3エンジン統合: FLUX.2(世界構築)/ Recraft(造形展開・SVG)/ Gemini 3 Pro Image(対話修正)をプロバイダ抽象化の上に",
      "表現テンプレート6系統(アートディレクション単位で定義、コード変更なしで追加)",
      "ダイヤル4軸(形状・色・文字・世界観)+プリセット3段(厳密/バランス/自由)",
      "逸脱スコアボード: シルエット類似・知覚類似(LPIPS)・文字保持(OCR)・意味類似(CLIP)の総合+4軸分解表示",
      "ワードマーク対策UX(モノグラム・頭文字への再構成提案)",
      "ショートビデオAPI実測: Seedance / Veo / Kling / Runway 等の品質・コスト・商用条件(旧 Video Lab 統合)",
    ],
    modules: [
      {
        title: "Phase E1: エンジン統合と表現テンプレート(稼働中)",
        body: "プロバイダ抽象化+FLUX.2/Recraft(Gemini対話層はE3)、アートディレクション単位の表現テンプレート(コード変更なしで追加)、プリセット3段ダイヤル、全ジョブの原価計測・監査ログ。APIキー未設定時はモックで全フローが動く。",
      },
      {
        title: "Phase E2: 逸脱スコアボード",
        body: "シルエット類似・知覚類似(LPIPS)・文字保持(OCR)・意味類似(CLIP)の総合+4軸分解表示と、その前提となるロゴ領域検出。",
      },
      {
        title: "Phase E3〜E4: ダイヤル詳細とマルチターン",
        body: "4軸ダイヤルの詳細UI、ワードマーク対策UX、対話で寄せる生成セッション(コスト上限と残量表示)、環境統合・シネマティック系統、社内ベンチマーク運用の自動化。",
      },
    ],
  },
];

export function getLab(slug: string): LabInfo | undefined {
  return LABS.find((lab) => lab.slug === slug);
}
