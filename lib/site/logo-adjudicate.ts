import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { LLM_BUDGET, LLM_MODEL } from "@/lib/llm";

// Choosing which of a site's candidate images is its logo. Enumeration is
// rule-based (logo-resolve.ts); the pick among several is judgment, so a VLM
// makes it — choose-only: it may name a candidate or say "none", never invent.

// A stalled connection fails fast instead of hanging a detached run.
const LLM_TIMEOUT_MS = 120_000;
const openai = (): OpenAI => new OpenAI({ timeout: LLM_TIMEOUT_MS, maxRetries: 2 });

// Pricing (USD per 1M tokens), for the cost line in a run's log.
// GPT-5.6 family GA 2026-07-09. Update if the model or its pricing changes.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
};

/** Token usage + estimated cost of one LLM API call. */
export interface LlmUsage {
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export function usageOf(
  response: { usage?: { prompt_tokens: number; completion_tokens: number } | null },
  purpose: string,
): LlmUsage {
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const price = PRICE_PER_MTOK[LLM_MODEL] ?? { input: 0, output: 0 };
  return {
    model: LLM_MODEL,
    purpose,
    inputTokens,
    outputTokens,
    estimatedCostUsd: (inputTokens * price.input + outputTokens * price.output) / 1_000_000,
  };
}

type ContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

function imagePart(mediaType: string, base64: string): ContentPart {
  return { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } };
}

const LOGO_ADJUDICATOR_SYSTEM = `You verify which of several candidate images is THE logo of the organization or service that owns a website. Candidates were extracted mechanically (rendered-page crops, files the HTML declares, touch icons) and each carries an evidence note.

Rules:
- Choose exactly one candidate id, or "none".
- The logo is the mark the site uses to identify ITSELF (masthead mark, wordmark, symbol). It is NOT: a partner or client logo, a certification/award badge (e.g. privacy marks), an app-store badge, a social icon, a photo, a banner, or an illustration.
- A crop from the page header and a declared file may show the same mark — prefer the candidate whose image is cleanest (full mark, no surrounding UI). Prefer a vector/original file over a screenshot crop of the same mark.
- A touch icon that shows the same mark as another candidate is a weaker duplicate; prefer the fuller mark.
- "none" when no candidate is the organization's own logo, or images failed to load.
- Answer with the id and a 1-2 sentence rationale in Japanese.`;

export interface LogoAdjudicationCandidate {
  id: string;
  /** normalized PNG, base64 — what the adjudicator actually looks at */
  image: string;
  /** evidence line: where it came from, alt text, size, score */
  note: string;
}

export interface LogoAdjudication {
  choice: string | null; // candidate id, null = none
  rationale: string;
}

export async function adjudicateLogo(input: {
  siteTitle: string | null;
  url: string | null;
  /** desktop screenshot for context, when a capture exists */
  screenshot: string | null;
  candidates: LogoAdjudicationCandidate[];
}): Promise<{ adjudication: LogoAdjudication | null; usage: LlmUsage | null }> {
  if (input.candidates.length < 2) return { adjudication: null, usage: null };

  const ids = input.candidates.map((c) => c.id);
  const ChoiceEnum = z.enum(["none", ...ids] as [string, ...string[]]);
  const Schema = z.object({
    choice: ChoiceEnum,
    rationale: z.string().describe("1-2 sentences in Japanese"),
  });

  const client = openai();
  const content: ContentPart[] = [];
  content.push({
    type: "text",
    text: `Site: ${input.siteTitle ?? "(unknown title)"}${input.url ? ` — ${input.url}` : ""}`,
  });
  if (input.screenshot) {
    content.push({ type: "text", text: "Page screenshot (context):" });
    content.push(imagePart("image/jpeg", input.screenshot));
  }
  for (const cand of input.candidates) {
    content.push({ type: "text", text: `Candidate ${cand.id}: ${cand.note}` });
    content.push(imagePart("image/png", cand.image));
  }
  content.push({ type: "text", text: "Which candidate is the site's own logo? Choose now." });

  const response = await client.chat.completions.parse({
    model: LLM_MODEL,
    max_completion_tokens: LLM_BUDGET.short,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: LOGO_ADJUDICATOR_SYSTEM },
      { role: "user", content },
    ],
    response_format: zodResponseFormat(Schema, "logo_adjudication"),
  });

  const usage = usageOf(response, "logo-adjudication");
  const out = response.choices[0]?.message.parsed;
  if (!out) return { adjudication: null, usage };
  return {
    adjudication: {
      choice: out.choice === "none" ? null : out.choice,
      rationale: out.rationale,
    },
    usage,
  };
}
