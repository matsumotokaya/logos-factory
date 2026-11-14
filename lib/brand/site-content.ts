import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CONTENT_PATHS, type BrandFeature, type BrandVoice } from "@/lib/brand/content";
import type { AppendKnowledgeField } from "@/lib/brand/knowledge";
import { LLM_BUDGET, LLM_EFFORT, LLM_MODEL, parseOrExplain } from "@/lib/llm";
import type { RawServiceInfo } from "@/lib/site/ingest";

// What the brand's own site says FOR itself: the features it lists and the
// customers it quotes.
//
// analyze-site.ts reads who runs the site and what it offers. A landing page
// needs the next layer down — the three things the offering is good at, and
// someone saying so — and the first LP made from a kit had nothing to draw
// them from (docs/product.md §2). They belong to the brand, not to the LP:
// every deliverable wants them, so they are read into brand knowledge and the
// kit carries them once adopted.
//
// Extraction only. A model structures text the page contains; a feature the
// page does not state and a quote nobody gave are left out, and the brand
// records that it looked and found none.

const TIMEOUT_MS = 90_000;

const SiteContentSchema = z.object({
  features: z
    .array(
      z.object({
        title: z.string().describe("ページが掲げる特長・強みの見出し。ページの言い回しを保ち、20字以内"),
        description: z.string().describe("その特長についてページが述べていること。1〜2文。ページに無い内容を足さない"),
      }),
    )
    .describe("ページが自ら挙げている特長・強み・選ばれる理由。最大6件。見当たらなければ空配列"),
  voices: z
    .array(
      z.object({
        quote: z.string().describe("利用者・顧客の言葉。ページの文言のまま、120字以内に収める"),
        name: z.string().describe("ページに書かれた発言者の名前・社名・イニシャル。無ければ空文字"),
        role: z.string().describe("ページに書かれた肩書き・属性・種別（例: 40代・会社員 / 導入事例）。無ければ空文字"),
      }),
    )
    .describe("ページに載っているお客様の声・導入事例・体験談。最大4件。見当たらなければ空配列"),
});

export type SiteContent = { features: BrandFeature[]; voices: BrandVoice[] };

const SYSTEM_PROMPT = `あなたはブランド台帳の登録担当です。Webページの本文から、そのブランドが自分で述べている「特長」と「お客様の声」を抜き出してください。

ルール:
- ページに書かれていることだけを使う。推測で補わない。新しいコピーを書かない。
- 特長は、ページが見出しや箇条書きで掲げているものを選ぶ。ナビゲーションの項目名、キャンペーン、お知らせ、記事の一覧は特長ではない。
- お客様の声は、利用者・顧客本人の言葉か、導入事例・体験談として載っているものに限る。体験談の記事タイトルしか無い場合は、そのタイトルを quote に、role に「ご利用体験談」などページ上の種別を入れ、name は空文字にする。
- 運営者自身の宣伝文、数字の実績、受賞歴はお客様の声ではない。
- 見当たらない場合は空配列を返す。空配列は正しい答えであり、埋めようとしない。
- ページの言語のまま返す。`;

export async function readSiteContent(raw: RawServiceInfo): Promise<SiteContent> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await parseOrExplain(
    () =>
      client.chat.completions.parse({
        model: LLM_MODEL,
        max_completion_tokens: LLM_BUDGET.short,
        reasoning_effort: LLM_EFFORT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `URL: ${raw.url}`,
              raw.title ? `タイトル: ${raw.title}` : "",
              raw.description ? `メタ説明: ${raw.description}` : "",
              raw.headings.length ? `見出し:\n${raw.headings.join("\n")}` : "",
              raw.bodyText ? `本文:\n${raw.bodyText}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        response_format: zodResponseFormat(SiteContentSchema, "site_content"),
      }),
    "ページの本文が長く、特長とお客様の声を読み取りきれませんでした",
  );
  const content = response.choices[0]?.message.parsed;
  if (!content) throw new Error("ページの特長とお客様の声を構造化できませんでした");
  return {
    features: content.features
      .map((item) => ({ title: item.title.trim(), description: item.description.trim() }))
      .filter((item) => item.title !== "")
      .slice(0, 6),
    voices: content.voices
      .map((item) => ({ quote: item.quote.trim(), name: item.name.trim(), role: item.role.trim() }))
      .filter((item) => item.quote !== "")
      .slice(0, 4),
  };
}

/**
 * The reading as claims. An empty list is still recorded, as `unknown`: the
 * brand looked and found none, which is different from never having looked —
 * and is what stops the next deliverable from reading the page again.
 */
export function siteContentClaims(content: SiteContent): AppendKnowledgeField[] {
  const claim = (field_path: string, items: unknown[]): AppendKnowledgeField => ({
    field_path,
    layer: "fact",
    value: items,
    confidence: items.length > 0 ? "inferred" : "unknown",
  });
  const [features, voices] = CONTENT_PATHS;
  return [claim(features, content.features), claim(voices, content.voices)];
}
