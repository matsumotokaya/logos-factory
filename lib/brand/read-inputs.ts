import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { appendBrandKnowledgeClaims, type AppendKnowledgeField } from "@/lib/brand/knowledge";
import { inputOf, type InputKind } from "@/lib/brand/inputs";
import { LLM_BUDGET, LLM_EFFORT, LLM_MODEL, parseOrExplain } from "@/lib/llm";
import { getR2Object } from "@/lib/r2";

// Reading what a person fed into a brand: the files, the added pages, the
// notes. The site is read by import-site.ts; this reads everything else, so
// that adding a brand book or a page about the company changes the brand —
// the input changes and the brand is made again, rather than someone typing
// over a value (owner's direction, 2026-11-14).
//
// It answers in the same fields the site reading does — who runs it, what it
// offers, what it says it is good at, what its customers say — and records
// them as claims (`file_extraction`), so they show as 推定 on the kit page and
// reach the kit when adopted. Read after the site, so where both speak, the
// person's own material is the newer word.
//
// Each input read is marked (provenance.read_at), which is what turns
// 未読み取り into 読み取り済み on the input list.

const TIMEOUT_MS = 150_000;
/** What one read hands the model. The rest is reported, not dropped silently. */
const LIMITS = { documents: 6, images: 8, textChars: 60_000 };
const IMAGE_LONG_EDGE = 1280;

const InputsReadingSchema = z.object({
  operator_name: z.string().describe("運営主体（企業・団体・個人）の名称。資料に無ければ空文字"),
  operator_description: z.string().describe("運営主体を一文で。資料に無ければ空文字"),
  name: z.string().describe("ブランド・サービス・製品の名称。資料に無ければ空文字"),
  tagline: z.string().describe("資料が掲げるキャッチコピー・一言。無ければ空文字"),
  description: z.string().describe("何を提供しているかを2〜3文で、中立に。資料に無ければ空文字"),
  audience: z.string().describe("主な対象。資料に無ければ空文字"),
  offering: z.string().describe("提供内容の要約。資料に無ければ空文字"),
  tone: z.string().describe("資料の文章の声のトーン（例: 丁寧で落ち着いた、親しみやすい）。判断できなければ空文字"),
  features: z
    .array(
      z.object({
        title: z.string().describe("資料が掲げる特長の見出し。資料の言い回しを保ち、20字以内"),
        description: z.string().describe("その特長について資料が述べていること。1〜2文"),
      }),
    )
    .describe("資料が挙げている特長・強み。最大6件。無ければ空配列"),
  voices: z
    .array(
      z.object({
        quote: z.string().describe("利用者・顧客の言葉。資料の文言のまま、120字以内"),
        name: z.string().describe("資料に書かれた発言者。無ければ空文字"),
        role: z.string().describe("資料に書かれた肩書き・属性。無ければ空文字"),
      }),
    )
    .describe("資料に載っているお客様の声・導入事例。最大4件。無ければ空配列"),
});
export type InputsReading = z.infer<typeof InputsReadingSchema>;

const SYSTEM_PROMPT = `あなたはブランド台帳の登録担当です。ブランドの持ち主が渡した資料（ファイル・Webページの写し・メモ）から、そのブランドについての事実だけを構造化してください。

ルール:
- 渡された資料に書かれていることだけを使う。推測で埋めない。新しいコピーを書かない。根拠が無い項目は空文字・空配列にする。
- メモは持ち主が書いたものなので、事実として扱ってよい。
- 特長は資料が見出しや箇条書きで掲げているもの。お客様の声は利用者本人の言葉か、導入事例として載っているものに限る。
- 運営主体と、ブランド（サービス・製品）を区別する。
- 資料の言語のまま返す。`;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type InputRead = {
  /** Inputs handed to the model, by label. */
  read: string[];
  /** Inputs left out of this read, with why. */
  skipped: { label: string; reason: string }[];
  /** Claims recorded. */
  recorded: number;
};

const KIND_ORDER: Record<InputKind, number> = { note: 0, url: 1, file: 2 };

/** Every input of the brand, read into claims. Resolves with nothing read when it has none. */
export async function readBrandInputs(input: {
  supabase: SupabaseClient;
  brandId: string;
  userId: string;
}): Promise<InputRead> {
  const { supabase, brandId, userId } = input;
  const { data, error } = await supabase
    .from("brand_materials")
    .select("id, label, media_type, r2_key, source_kind, source_url, derived_from_material_id, provenance, created_at")
    .eq("brand_id", brandId)
    .eq("scope", "brand")
    .eq("source_kind", "upload")
    .is("derived_from_material_id", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const inputs = (data ?? [])
    .map((row) => ({ row, input: inputOf(row as never) }))
    .filter((item): item is { row: (typeof data)[number]; input: { kind: InputKind; readAt: string | null } } => item.input !== null)
    .sort((a, b) => KIND_ORDER[a.input.kind] - KIND_ORDER[b.input.kind]);
  if (inputs.length === 0) return { read: [], skipped: [], recorded: 0 };

  const content: ContentPart[] = [];
  const read: { id: string; label: string; provenance: Record<string, unknown> }[] = [];
  const skipped: InputRead["skipped"] = [];
  let documents = 0;
  let images = 0;
  let textChars = 0;

  for (const { row, input: kind } of inputs) {
    const label = (row.label as string) || "素材";
    const mediaType = (row.media_type as string | null) ?? "";
    const key = row.r2_key as string | null;
    const bytes = key ? await getR2Object(key) : null;
    if (!bytes) {
      skipped.push({ label, reason: "ファイルを取り出せませんでした" });
      continue;
    }
    const heading =
      kind.kind === "note"
        ? `【メモ（持ち主が書いたもの）】`
        : kind.kind === "url"
          ? `【Webページの写し ${row.source_url ?? label}】`
          : `【資料 ${label}】`;

    if (mediaType.startsWith("text/")) {
      const text = bytes.toString("utf8").trim();
      if (!text) {
        skipped.push({ label, reason: "中身が空です" });
        continue;
      }
      if (textChars + text.length > LIMITS.textChars) {
        skipped.push({ label, reason: "1回に読む文章の量を超えたため、今回は読みませんでした" });
        continue;
      }
      textChars += text.length;
      content.push({ type: "text", text: `${heading}\n${text}` });
    } else if (mediaType === "application/pdf") {
      if (documents >= LIMITS.documents) {
        skipped.push({ label, reason: `PDFは1回に${LIMITS.documents}件までです` });
        continue;
      }
      documents += 1;
      content.push({ type: "text", text: heading });
      content.push({
        type: "file",
        file: {
          filename: label.toLowerCase().endsWith(".pdf") ? label : `${label}.pdf`,
          file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
        },
      });
    } else if (/^image\/(png|jpeg|webp|gif)$/.test(mediaType)) {
      if (images >= LIMITS.images) {
        skipped.push({ label, reason: `画像は1回に${LIMITS.images}枚までです` });
        continue;
      }
      try {
        const jpeg = await sharp(bytes, { failOn: "none" })
          .rotate()
          .resize(IMAGE_LONG_EDGE, IMAGE_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 80 })
          .toBuffer();
        images += 1;
        content.push({ type: "text", text: heading });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } });
      } catch {
        skipped.push({ label, reason: "画像を開けませんでした" });
        continue;
      }
    } else {
      // An SVG mark carries no sentences; it is a logo, not a reading.
      skipped.push({ label, reason: "この形式からは文章を読み取りません" });
      continue;
    }
    read.push({ id: row.id as string, label, provenance: (row.provenance as Record<string, unknown> | null) ?? {} });
  }

  if (read.length === 0) return { read: [], skipped, recorded: 0 };

  const reading = await structureInputs(content);

  const at = new Date().toISOString();
  const appended = await appendBrandKnowledgeClaims(supabase, {
    brandId,
    fields: inputClaims(reading),
    sourceKind: "file_extraction",
    sourceRef: { source: "brand_inputs", material_ids: read.map((item) => item.id), at },
    userId,
  });
  if (!appended.ok) throw new Error(appended.error);

  // Mark what was read. One row at a time: the provenance is each row's own.
  for (const item of read) {
    const marked = await supabase
      .from("brand_materials")
      .update({ provenance: { ...item.provenance, read_at: at }, updated_at: at })
      .eq("id", item.id);
    if (marked.error) console.error("Marking an input as read failed:", marked.error.message);
  }

  return { read: read.map((item) => item.label), skipped, recorded: appended.appended };
}

/** One model call over the prepared inputs. Exported for the dry-run checks. */
export async function structureInputs(content: ContentPart[]): Promise<InputsReading> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await parseOrExplain(
    () =>
      client.chat.completions.parse({
        model: LLM_MODEL,
        max_completion_tokens: LLM_BUDGET.long,
        reasoning_effort: LLM_EFFORT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              ...content,
              { type: "text", text: "これらの資料から、このブランドについて書かれている事実だけを抜き出してください。" },
            ] as never,
          },
        ],
        response_format: zodResponseFormat(InputsReadingSchema, "brand_inputs"),
      }),
    "資料が多すぎて読み切れませんでした。資料を分けるか減らしてから、もう一度お試しください",
  );
  const reading = response.choices[0]?.message.parsed;
  if (!reading) throw new Error("資料からブランドの事実を読み取れませんでした");
  return reading;
}

/** The reading as claims. Empty answers are not recorded: silence is not a fact. */
export function inputClaims(reading: InputsReading): AppendKnowledgeField[] {
  const fact = (field_path: string, value: string): AppendKnowledgeField | null =>
    value.trim() ? { field_path, layer: "fact", value: value.trim(), confidence: "inferred" } : null;
  const features = reading.features
    .map((item) => ({ title: item.title.trim(), description: item.description.trim() }))
    .filter((item) => item.title !== "")
    .slice(0, 6);
  const voices = reading.voices
    .map((item) => ({ quote: item.quote.trim(), name: item.name.trim(), role: item.role.trim() }))
    .filter((item) => item.quote !== "")
    .slice(0, 4);
  return [
    fact("identity.legal_name", reading.operator_name),
    fact("identity.description", reading.operator_description),
    fact("offering.name", reading.name),
    fact("offering.tagline", reading.tagline),
    fact("offering.description", reading.description),
    fact("offering.audience", reading.audience),
    fact("offering.summary", reading.offering),
    reading.tone.trim()
      ? ({ field_path: "voice.tone", layer: "expression", value: reading.tone.trim(), confidence: "suggested" } as AppendKnowledgeField)
      : null,
    features.length > 0 ? ({ field_path: "offering.features", layer: "fact", value: features, confidence: "inferred" } as AppendKnowledgeField) : null,
    voices.length > 0 ? ({ field_path: "proof.voices", layer: "fact", value: voices, confidence: "inferred" } as AppendKnowledgeField) : null,
  ].filter((field): field is AppendKnowledgeField => field !== null);
}
