import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { BRAND_KIND_LABEL, isBrandKind } from "@/lib/brand-kind";
import { LLM_BUDGET, LLM_EFFORT, LLM_MODEL, parseOrExplain } from "@/lib/llm";
import type { BrandLpBrief, LpContent } from "./brief-schema";
import type { LpContext } from "./context";
import { CTA_MAX, SAMPLE_VOICES, type Framed } from "./frame";

// The LP's words.
//
// The frame (frame.ts) already produced a whole page from the brand's facts
// and decided where each section's facts came from. This rewrites the words
// of that page as copy — a headline that says what the reader gets, three
// features in one voice — from the same facts and nothing else.
//
// A model is used here because this is the part a rule cannot do: the frame's
// page is correct and reads like a form (AGENTS.md 「ルールとLLMの使い分け」).
// What it may not do is change a fact's standing. The customers' voices the
// brand has are placed by rule, word for word; the model writes stand-ins
// only when there are none, and the frame has already marked that section
// `sample`.
//
// A failed call is not a failed LP: the frame's page is returned, and the
// brief says the frame wrote it.

const TIMEOUT_MS = 120_000;

const line = (max: string) => z.string().describe(max);

const WrittenSchema = z.object({
  hero: z.object({
    eyebrow: line("何のサービスかが一目でわかる短い語句。14字以内"),
    headline: line("22字以内。2行に分けるなら改行を1つ、各行12字以内。ブランド名を入れない"),
    sub: line("50〜90字。誰の、何を、どうするのかを1〜2文で"),
  }),
  cta_label: line("行動を促す短い語句。10字以内"),
  overview: z.object({
    heading: line("26字以内。必要なら改行を1つ"),
    body: line("110〜170字"),
    points: z.array(line("24字以内。渡された事実から言えることだけ")).max(3),
  }),
  features: z.object({
    heading: line("20字以内"),
    items: z
      .array(z.object({ title: line("16字以内"), body: line("45〜75字") }))
      .describe("ちょうど3つ"),
  }),
  voices_heading: line("14字以内"),
  voice_picks: z
    .array(z.number().int())
    .describe("お客様の声が4件以上渡されたとき、載せる3件の番号（1始まり）。3件以下なら空配列"),
  sample_voices: z
    .array(z.object({ quote: line("55〜85字"), name: line("イニシャル。例: K.S さん"), role: line("一般的な属性") }))
    .describe("お客様の声が渡されていない場合だけ3件。渡されている場合は空配列"),
  closing: z.object({
    headline: line("20字以内。必要なら改行を1つ"),
    sub: line("30〜60字"),
  }),
});

const SYSTEM_PROMPT = `あなたは日本のサービスのランディングページを書くシニアコピーライターです。渡されたブランドの事実だけを材料に、1ページのLPの文章を書きます。

ページの構成は固定です: ヒーロー → 概要 → 特長3つ → お客様の声 → 締めのCTA。

原則:
- 事実は渡された情報の範囲だけ。数字・実績・受賞・料金・顧客名・保証を新しく作らない。
- 読み手の得になることを先に言う。機能の羅列にしない。
- 誇張しない。「No.1」「必ず」「絶対」「最高」のような断定や最上級は、渡された情報に明記されていない限り使わない。金融・医療・不動産・人材など規制のある分野では、利益や効果を約束する表現をしない。
- ブランドの声のトーンに合わせる。指定が無ければ、業種と対象に合った落ち着いた丁寧体（です・ます）。
- 自然な日本語で書く。翻訳調、体言止めの連発、記号や感嘆符の多用を避ける。
- 見出しにブランド名を繰り返さない（ロゴがページの上にある）。本文では必要なところだけ使う。

項目ごとの指示:
- hero.headline: このページでいちばん大事な一行。サービスの説明（「〜を効率化する」「〜を提案します」）ではなく、読み手が手に入れる状態や安心を、短く言い切る。「〜を、〜に。」「〜という選択肢を。」のように余韻を残して終える型が見出しには合い、「〜する」「〜を始める」で終える平板な言い方は避ける。サイトのヒーロー見出しやタグラインがすでにこの役目を果たしているなら、言葉を活かす。
- closing.headline: ヒーローの見出しを繰り返さず、次の一歩を軽くする一行にする。
- cta_label: 「サイトのCTAの文言」が行動を促す10字以内の語句ならそのまま使う。入口の案内や長い文なら使わず、このサービスに合う語句を書く（例: お問い合わせ／無料で始める／資料請求）。
- overview.points: 渡された事実から言える具体的な要点だけ。足りなければ少なくてよい（0件でもよい）。
- features.items: 「サイトが挙げている特長」が3つ以上あれば、その中から最も強い3つを選び、内容を変えずに言葉を整える。足りない分は、説明と要約から言えることだけで書く。
- voice_picks: お客様の声が4件以上あるときだけ、利用者本人の言葉として読めるもの、内容が重ならないものを優先して3件を番号で選ぶ。記事の見出しにしか読めないものは後回しにする。文言は変えない。
- sample_voices: 差し替え前提の仮の内容。実在の人物・企業名を使わない。数字・成果・保証を含めない。サービスの説明を言い直すのではなく、使ってみた人が話し言葉で口にする感想にする（何が不安だったか、使ってどう感じたか）。3件で視点を変える。role はこのサービスの対象に合う一般的な属性（例: 40代・会社員／不動産管理会社・業務部）。
- closing.sub: 渡された事実の範囲で、始めやすさや相談のしやすさを伝える。事実が無ければ一般的な案内にとどめる。`;

function brandSheet(context: LpContext): string {
  const { kit } = context;
  const v = kit.values;
  const kind = isBrandKind(kit.brand.kind) ? BRAND_KIND_LABEL[kit.brand.kind] : kit.brand.kind;
  const nav = Array.isArray(v["layout.nav_items"])
    ? (v["layout.nav_items"] as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const row = (label: string, value: string | null | undefined) => (value ? `${label}: ${value}` : "");
  const features = context.features?.value ?? [];
  const voices = context.voices?.value ?? [];
  return [
    `ページの言語: ${context.lang}`,
    row("ブランド名", kit.brand.name),
    row("種別", kind),
    row("業種", kit.brand.industry),
    row("Web", kit.brand.website),
    row("サイトのタグライン", context.tagline?.value),
    row("サイトのヒーロー見出し", context.siteHeadline?.value !== context.tagline?.value ? context.siteHeadline?.value : null),
    row("説明", context.description?.value),
    row("提供内容の要約", context.summary?.value),
    row("主要な対象", context.audience?.value),
    row("運営者", context.operator?.value),
    row("声のトーン", context.tone?.value),
    row("サイトのCTAの文言", context.ctaLabel?.value),
    nav.length > 0 ? `サイトのナビゲーション: ${nav.join(" / ")}` : "",
    features.length > 0
      ? `サイトが挙げている特長（${features.length}件）:\n${features
          .map((item, index) => `${index + 1}. ${item.title}${item.description ? ` — ${item.description}` : ""}`)
          .join("\n")}`
      : "サイトが挙げている特長: なし（説明と要約から言えることだけで3つ書く）",
    voices.length > 0
      ? `お客様の声（${voices.length}件。そのまま載せるので書き直さない。sample_voices は空配列）:\n${voices
          .map((item, index) => `${index + 1}. 「${item.quote}」${[item.name, item.role].filter(Boolean).join("・")}`)
          .join("\n")}`
      : "お客様の声: なし（sample_voices を3件書く）",
  ]
    .filter(Boolean)
    .join("\n");
}

const clean = (value: string) => value.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
/** A heading keeps at most one intended break. */
const heading = (value: string) => {
  const [first, ...rest] = clean(value).split("\n");
  return rest.length > 0 ? `${first}\n${rest.join("")}` : first;
};
const oneLine = (value: string) => clean(value).replace(/\n/g, "");

export type WrittenLp = { content: LpContent; writer: BrandLpBrief["writer"] };

export async function writeLp(context: LpContext, framed: Framed): Promise<WrittenLp> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      content: framed.content,
      writer: { kind: "frame", model: null, note: "OPENAI_API_KEY が無いため、文章はフレームのままです" },
    };
  }
  try {
    const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
    const response = await parseOrExplain(
      () =>
        client.chat.completions.parse({
          model: LLM_MODEL,
          max_completion_tokens: LLM_BUDGET.long,
          reasoning_effort: LLM_EFFORT,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: brandSheet(context) },
          ],
          response_format: zodResponseFormat(WrittenSchema, "landing_page_copy"),
        }),
      "LPの文章が長さの上限に達しました",
    );
    const written = response.choices[0]?.message.parsed;
    if (!written) throw new Error("LPの文章を構造化できませんでした");

    const base = framed.content;
    const features = written.features.items
      .map((item) => ({ title: oneLine(item.title), body: oneLine(item.body) }))
      .filter((item) => item.title !== "" && item.body !== "")
      .slice(0, 3);
    const sampleVoices = written.sample_voices
      .map((item) => ({ quote: oneLine(item.quote), name: oneLine(item.name), role: oneLine(item.role) }))
      .filter((item) => item.quote !== "")
      .slice(0, 3);
    const cta = oneLine(written.cta_label);
    // The brand's own voices, word for word; the model only chooses which
    // three when there are more.
    const ownVoices = context.voices?.value ?? [];
    const picks = [...new Set(written.voice_picks)]
      .map((pick) => ownVoices[pick - 1])
      .filter((voice) => voice !== undefined);
    const chosenVoices = picks.length === 3 ? picks : base.voices.items;

    return {
      content: {
        hero: {
          eyebrow: oneLine(written.hero.eyebrow) || base.hero.eyebrow,
          headline: heading(written.hero.headline) || base.hero.headline,
          sub: oneLine(written.hero.sub) || base.hero.sub,
        },
        overview: {
          heading: heading(written.overview.heading) || base.overview.heading,
          body: oneLine(written.overview.body) || base.overview.body,
          points: written.overview.points.map(oneLine).filter(Boolean).slice(0, 3),
        },
        features: {
          heading: heading(written.features.heading) || base.features.heading,
          items: features.length === 3 ? features : base.features.items,
        },
        voices: {
          heading: oneLine(written.voices_heading) || base.voices.heading,
          // Stand-ins are the model's only when it wrote enough of them.
          items:
            framed.sourced.voices > 0
              ? chosenVoices
              : sampleVoices.length >= 2
                ? sampleVoices
                : SAMPLE_VOICES,
        },
        closing: {
          headline: heading(written.closing.headline) || base.closing.headline,
          sub: oneLine(written.closing.sub),
        },
        cta: {
          label: cta !== "" && [...cta].length <= CTA_MAX ? cta : base.cta.label,
          href: base.cta.href,
        },
      },
      writer: { kind: "model", model: LLM_MODEL, note: null },
    };
  } catch (error) {
    console.error("LP writing failed:", error);
    return {
      content: framed.content,
      writer: {
        kind: "frame",
        model: null,
        note: `文章の生成に失敗したため、フレームのままです（${error instanceof Error ? error.message : "不明なエラー"}）`,
      },
    };
  }
}
