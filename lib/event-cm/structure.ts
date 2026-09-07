import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { LLM_BUDGET, LLM_MODEL, parseOrExplain } from "@/lib/llm";
import { MATERIAL_CATEGORIES } from "@/lib/materials/category";
import { z } from "zod";
import type { ExtractedSource } from "./extract";
import { sanitizeFacts, type SanitizeReport } from "./sanitize";
import { attributeFacts, FACT_KEYS, type FactAttribution } from "./attribution";

// Stage ③: turning what was read into the event's facts.
//
// The model's whole job is reading — pulling a date out of a flyer, telling a
// speaker's name from a caption. It is explicitly NOT asked to invent: a field
// it cannot find in the material is returned null, and the seeded proposal
// keeps standing there. That is what makes the origin badge meaningful; a
// model that filled gaps would turn every "資料から読んだ" into a guess wearing
// the wrong label.
//
// PDFs and images arrive here whole, because the extraction stage has no
// parser for them (extract.ts). They are attached as file/image parts, so the
// model reads the flyer itself rather than a lossy transcription of it.
//
// Images are read in the SAME call as the facts, and that is a design decision
// rather than a saving. What links a photograph to a speaker is the document
// that names them — a caption under a portrait, a line in a programme. Sending
// the pictures to one call and the text to another means throwing that link
// away and then trying to rebuild it from names alone. Each image is announced
// by a heading carrying its material ID, so the model has something to point
// at when it answers; before that, images arrived anonymously and could not be
// referred to at all.

const LLM_TIMEOUT_MS = 180_000;

const openai = (): OpenAI => new OpenAI({ timeout: LLM_TIMEOUT_MS, maxRetries: 2 });

const SYSTEM = `あなたはイベント告知資料の読み取り担当です。渡された資料から、イベントの事実だけを抜き出します。

## 絶対の制約

1. **資料に書かれていないことは絶対に埋めない。** 見つからなかった項目は必ず null にする。推測・補完・一般論での穴埋けを一切しない。
2. **書かれていることは書かれたとおりに。** 表記（日付の書式、社名の表記ゆれ、肩書き）を勝手に整えない。
3. 複数の資料に矛盾がある場合は、より具体的で新しそうな方を採り、その旨を note に書く。

## 掲載する値と、資料の足場を区別する

企画書やフライヤーには、**告知に載せる値ではないもの**が値と同じ見た目で並んでいます。以下はすべて null にしてください。

- **見出し・ラベル**: 「本企画が目指す価値」「開催概要」「ターゲット」など、枠の名前であって中身ではないもの。その下に書かれている実際の内容の方を採る
- **未記入のプレースホルダ**: 「XXXX円」「〇〇会場」「未定」「TBD」。資料がまだ決めていないので、書かれていないのと同じ
- **社内向けのメモ**: 想定集客数、動員目標、「オーナー約40名・社員約10名」のような内訳。企画の話であって、参加者に伝える情報ではない
- **人数の表記を人物にしない**: 「Miss SAKE 2名」は登壇者ではなく人数。氏名が分かる人物だけを guests に入れる
- **装飾記号**: 「＼」「／」「■」「※」などフライヤーの装飾は値に含めない

## 各項目

- title: イベント名。サブタイトルは含めない
- subtitle: 副題・キャッチコピー
- seriesLabel: シリーズ名・第N回・主催者が付けた枠の名前
- presenter: 主催・共催。複数なら資料の表記のまま繋げる
- valueLines: 参加する価値を表す短い行（2〜3行）。資料の言葉を使う
- valueChip: 価値を一言で表すラベル
- programs: プログラム・当日の内容。書かれている順に
- guests: 登壇者。name と role をそのまま。**人名は絶対に捏造しない**
- date: 開催日。資料の表記のまま（例「2026.10.2」「10月2日」）
- weekday: 曜日（例「FRI」「金」）
- time: 開始時刻（例「17:00 START」「17時開演」）
- venue: 会場
- fee: 参加費
- cta: 申し込み方法・行動喚起
- footnote: 注記（年齢制限・定員など）

## 根拠の記録

資料には【資料 ラベル / ID: xxxx】、画像には【画像 ラベル / ID: xxxx】という見出しが付いています。**値を抜き出した項目ごとに、根拠となった資料・画像のIDを attribution に返してください。** 複数の資料に書かれていれば全部のIDを挙げます。null にした項目は attribution に含めません。IDは見出しのものをそのまま使い、作らないでください。

## 画像の読み取り

画像には【画像 ラベル / ID: xxxx】という見出しが付いています。**渡されたすべての画像について1件ずつ** images に結果を返してください。判定できない画像も unreadable として残し、飛ばさないでください。ref にはその画像のIDをそのまま入れます。

- role: **この動画での使い道**。speaker-portrait（人物の顔が主役）/ key-visual（イベント全体の雰囲気・主役の情景）/ scene-photo（実演・展示・会場内の活動）/ venue（会場・空間そのもの）/ logo（主催・協賛のマーク）/ document（文字が主役の資料ページ・チラシ）/ texture（質感・装飾・背景）/ unreadable
- category: **この画像に何が写っているか**。使い道とは別に答えてください。person（人物）/ product（製品・サービスそのもの）/ screen（画面・UI・スクリーンショット）/ place（会場・店舗・外観など場所そのもの）/ scenery（情景・雰囲気）/ mark（ロゴ・シンボル）/ graphic（図版・イラスト・図解）/ document（文字が主役の資料）/ texture（質感・装飾）/ other。判定できなければ null

  role と category は別の問いです。同じ写真が、この動画では「key-visual（主役の情景として使う）」で、写っているものは「product（製品そのもの）」ということがあります。category はこの動画と関係なく真であることだけを答えてください。
- caption: 何が写っているかを一文で
- visibleText: 画像内で読める文字（キャプション・氏名・社名）。無ければ空配列
- personName: **画像のキャプション・資料本文・ファイル名から氏名が分かる場合だけ**その氏名。**顔から人物を推測することは絶対にしない。** 根拠が無ければ null
- personEvidence: 氏名の根拠（image-caption / document-text / filename）。personName が null なら null
- personEvidenceRef: その根拠が書かれていた資料または画像のID（見出しのID）。filename なら画像自身のID。personName が null なら null

**ファイル名は根拠です。** 画像の見出しにはファイル名が入っています。ファイル名（ローマ字・かな・漢字）が、資料に出てくる登壇者の姓または氏名と対応するなら、それを filename 根拠として personName に書いてください。例: 「miyao.jpg」と資料の「宮尾佳明」→ personName は「宮尾佳明」、personEvidence は filename。「yamada_taro.png」と「山田太郎」も同じです。「IMG_2831.jpg」「AdobeStock_1894358160.jpeg」のように人を指さないファイル名であれば null のままにしてください。

**顔の一致で決めないこと**は変わりません。ファイル名という書かれた根拠があるから結びつけるのであって、写っている顔から誰かを当ててはいけません。
- focusX / focusY: 主役（顔・被写体）が画面のどこにあるか
- confidence: この判定の確からしさ
- reason: そう判定した理由を短く`;

/**
 * What one image is, and what the material says about it.
 *
 * The classification is the model's job; where the picture ends up is not
 * (lib/event-cm/place-images.ts). Two fields carry the whole safety rule:
 * `personName` may only be filled from something written down, and
 * `personEvidence` says which written thing it was. A face alone never
 * identifies anybody.
 *
 * The focus point is an enum rather than coordinates because a model's numeric
 * guess at "where is the face" is not measurement. Five bands is the precision
 * the hand-composed brief actually used (remotion/event/briefs/sake-2026.ts).
 */
const ImageReadingSchema = z.object({
  ref: z.string().describe("画像の見出しに書かれたID"),
  role: z.enum([
    "speaker-portrait",
    "key-visual",
    "scene-photo",
    "venue",
    "logo",
    "document",
    "texture",
    "unreadable",
  ]),
  /**
   * The other axis: what the picture contains, regardless of this film.
   *
   * Asked separately from `role` because they are different questions that were
   * being answered by one word. `role` decides placement and stays event-cm's
   * vocabulary; `category` is stored on the material and has to mean the same
   * thing to a landing page and a banner (lib/materials/category.ts).
   *
   * Nullable so "I could not tell" stays distinguishable from "other".
   */
  category: z.enum(MATERIAL_CATEGORIES).nullable(),
  caption: z.string(),
  visibleText: z.array(z.string()),
  personName: z.string().nullable(),
  personEvidence: z.enum(["image-caption", "document-text", "filename"]).nullable(),
  /**
   * WHICH written thing named the person, by material id — so a placement can
   * rest on the picture and on its evidence, and lose the name with the
   * document (lib/event-cm/withdraw.ts). Null when there is no name.
   */
  personEvidenceRef: z.string().nullable(),
  focusX: z.enum(["left", "centre", "right"]),
  focusY: z.enum(["top", "upper", "centre", "lower", "bottom"]),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string(),
});

export type ImageReading = z.infer<typeof ImageReadingSchema>;

const FactsSchema = z.object({
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  seriesLabel: z.string().nullable(),
  presenter: z.string().nullable(),
  valueLines: z.array(z.string()).nullable(),
  valueChip: z.string().nullable(),
  programs: z.array(z.string()).nullable(),
  guests: z.array(z.object({ name: z.string(), role: z.string() })).nullable(),
  date: z.string().nullable(),
  weekday: z.string().nullable(),
  time: z.string().nullable(),
  venue: z.string().nullable(),
  fee: z.string().nullable(),
  cta: z.string().nullable(),
  footnote: z.string().nullable(),
  images: z.array(ImageReadingSchema).describe("渡された画像すべて。1枚も飛ばさない"),
  note: z.string().nullable().describe("矛盾や判断に迷った点。無ければ null"),
});

export type EventFacts = z.infer<typeof FactsSchema>;

/**
 * The facts plus where each came from.
 *
 * Kept as an extension rather than a field of `FactsSchema` so `EventFacts` —
 * what the mapping stage and every fixture handle — stays the facts alone. The
 * citations are checked and folded into `FactAttribution` before anything
 * downstream sees them (attribution.ts).
 */
const ReadingSchema = FactsSchema.extend({
  attribution: z
    .array(z.object({ field: z.enum(FACT_KEYS), refs: z.array(z.string()) }))
    .describe("値を抜き出した項目ごとの根拠ID。null にした項目は含めない"),
});

export function structuringAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface StructuredResult {
  facts: EventFacts;
  /** Which materials were actually looked at. */
  readLabels: string[];
  /** How many images went to the model, and how many came back judged. Kept
   *  next to the result because "twelve sent, nine answered" is the difference
   *  between a picture nobody used and a picture nobody looked at. */
  imageCounts: { sent: number; judged: number };
  /** What the deterministic pass threw away, and why. */
  dropped: SanitizeReport["dropped"];
  /** Which material each fact rests on, checked where it could be. */
  attribution: FactAttribution;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export async function structureEventFacts(
  sources: ExtractedSource[],
): Promise<StructuredResult> {
  const usable = sources.filter(
    (source) => source.mode === "text" || source.mode === "passthrough",
  );
  if (usable.length === 0) {
    throw new Error("読み取れる素材がありません。資料かテキストを追加してください");
  }

  const content: ContentPart[] = [];
  let sentImages = 0;
  for (const source of usable) {
    if (source.mode === "text" && source.text) {
      content.push({
        type: "text",
        text: `【資料 ${source.label} / ID: ${source.materialId}】\n${source.text}`,
      });
      continue;
    }
    if (!source.data) continue;
    if (source.mediaType === "application/pdf") {
      content.push({
        type: "text",
        text: `【資料 ${source.label} / ID: ${source.materialId}】`,
      });
      content.push({
        type: "file",
        file: {
          filename: source.label.endsWith(".pdf") ? source.label : `${source.label}.pdf`,
          file_data: `data:application/pdf;base64,${source.data}`,
        },
      });
    } else {
      // The heading is what makes the picture referable. Without it the model
      // can describe an image but cannot say which one it described, and the
      // answer cannot be joined back to a material.
      content.push({
        type: "text",
        text: `【画像 ${source.label} / ID: ${source.materialId}】`,
      });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${source.image?.sentAs ?? source.mediaType};base64,${source.data}`,
        },
      });
      sentImages += 1;
    }
  }
  content.push({
    type: "text",
    text: "この資料から読み取れるイベントの事実だけを抜き出してください。書かれていない項目は null にしてください。画像は1枚ずつ images に判定を返し、氏名は根拠がある場合だけ書いてください。",
  });

  const response = await parseOrExplain(() =>
    openai().chat.completions.parse({
    model: LLM_MODEL,
    max_completion_tokens: LLM_BUDGET.long,
    reasoning_effort: "medium",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: content as never },
    ],
    response_format: zodResponseFormat(ReadingSchema, "event_facts"),
    }),
    "資料が長さの上限に達しました。1回に読む資料を減らすか、長いPDFを分けてからお試しください",
  );

  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) throw new Error("資料から事実を読み取れませんでした");

  // The prompt asks for this too, but a model told not to copy a heading will
  // still copy one sometimes. What can be recognised by rule is enforced by
  // rule (§17.2), and what it removes is reported rather than removed quietly.
  const { attribution: cited, ...reading } = parsed;
  const { facts, report } = sanitizeFacts(reading);
  // Checked against the sanitised facts, not the raw ones: a citation for a
  // value the rules threw away is a citation for nothing.
  const attribution = attributeFacts(
    cited,
    facts,
    usable.map((source) => ({
      materialId: source.materialId,
      mode: source.mode,
      text: source.text,
    })),
  );

  return {
    facts,
    readLabels: usable.map((source) => source.label),
    attribution,
    imageCounts: { sent: sentImages, judged: facts.images?.length ?? 0 },
    dropped: report.dropped,
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        }
      : null,
  };
}
