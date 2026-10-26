import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { BRAND_KINDS } from "@/lib/brand-kind";
import { LLM_BUDGET, LLM_MODEL } from "@/lib/llm";
import type { RawServiceInfo } from "@/lib/site/ingest";
import { usageOf, type LlmUsage } from "@/lib/site/logo-adjudicate";

// What a brand's own site says it is: who runs it, what it offers, and which
// kind of brand that makes it. Rules cannot read this off a page, so a model
// structures the text the page contains — and only that. It writes no copy
// for any deliverable; a deliverable reads the brand and writes its own.

const TIMEOUT_MS = 90_000;

const SiteAnalysisSchema = z.object({
  operator: z.object({
    name: z.string().describe("運営主体（企業・団体・個人）の名称。サービス名と混同しない。特定不能なら空文字"),
    description: z.string().describe("運営主体を一文で。ページに根拠が無ければ空文字"),
    confidence: z
      .enum(["high", "medium", "low"])
      .describe("フッター・会社概要・JSON-LD等の根拠の強さ"),
  }),
  subject: z.object({
    name: z.string().describe("このサイトが名乗るブランド・サービス・製品の名称"),
    tagline: z.string().describe("サイトが掲げる一言。無ければ空文字"),
    description: z.string().describe("何を提供しているかを2〜3文で、中立に"),
    industry: z.string().describe("業種を日本語の短い語句で。根拠不足なら空文字"),
    audience: z.string().describe("主な対象。根拠不足なら空文字"),
    offering: z.string().describe("提供内容の要約。根拠不足なら空文字"),
  }),
  brand_kind: z
    .enum(BRAND_KINDS)
    .describe(
      "このサイトの主体の種別。corporate=企業そのもの, organization=非営利・団体, business=事業, service=サービス, product=製品, media=メディア, event=イベント",
    ),
  kind_confidence: z.enum(["high", "medium", "low"]),
});

export type SiteAnalysis = z.infer<typeof SiteAnalysisSchema>;

const SYSTEM_PROMPT = `あなたはブランド台帳の登録担当です。Webサイトの内容から、そのサイトのブランドについての事実だけを構造化してください。

ルール:
- ページに書かれていることだけを使う。推測で埋めない。根拠が無い項目は空文字にする。
- 運営主体（operator）と、サイトが名乗るブランド（subject）を区別する。コーポレートサイトなら両者は同じ会社になる。
- 広告コピーを新しく書かない。台帳に保存できる簡潔な事実として返す。
- 日本語で返す（固有名詞は原文のまま）。`;

export async function analyzeSite(
  raw: RawServiceInfo,
): Promise<{ analysis: SiteAnalysis; usage: LlmUsage }> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.chat.completions.parse({
    model: LLM_MODEL,
    max_completion_tokens: LLM_BUDGET.short,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `URL: ${raw.url}`,
          raw.title ? `タイトル: ${raw.title}` : "",
          raw.description ? `メタ説明: ${raw.description}` : "",
          raw.organizationHints.length
            ? `機械抽出した運営者名の候補: ${raw.organizationHints.join("、")}`
            : "",
          raw.headings.length ? `見出し:\n${raw.headings.join("\n")}` : "",
          raw.footerText ? `フッター・法的表記:\n${raw.footerText}` : "",
          raw.bodyText ? `本文:\n${raw.bodyText}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    response_format: zodResponseFormat(SiteAnalysisSchema, "site_analysis"),
  });
  const analysis = response.choices[0]?.message.parsed;
  if (!analysis) throw new Error("サイトの内容を構造化できませんでした");
  return { analysis, usage: usageOf(response, "site-analysis") };
}
