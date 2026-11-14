import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ASSET_USE, ASSET_USES, type AssetJudgement } from "@/lib/brand/asset-use";
import { LLM_BUDGET, LLM_EFFORT, LLM_MODEL, parseOrExplain } from "@/lib/llm";
import { getR2Object } from "@/lib/r2";

// Looking at every image the site gave the brand and saying what it is FOR —
// the brand's own asset (hero texture, product, illustration, the people who
// run it) or a picture that only happened to be on the page (a news thumbnail,
// a campaign banner). A rule can see where an image sat; only looking at it
// tells a portrait of the CEO from a stock photo (lib/brand/asset-use.ts).
//
// The judgement goes onto the material (provenance.asset) and its category,
// unless a person has set the category. Images already judged are not judged
// again; a person's tick (`picked`) is kept.

const TIMEOUT_MS = 150_000;
const BATCH = 16;
/** Per read. The rest are judged on the next one. */
const MAX_PER_RUN = 64;
const LONG_EDGE = 512;

const JudgementSchema = z.object({
  images: z.array(
    z.object({
      id: z.string().describe("画像の見出しにある ID"),
      use: z.enum(ASSET_USES).describe(
        ASSET_USES.map((use) => `${use}=${ASSET_USE[use].label}（${ASSET_USE[use].hint}）`).join(" / "),
      ),
      note: z.string().describe("何が写っていて、なぜその用途と判断したかを日本語で1文、40字以内"),
    }),
  ),
});

const SYSTEM_PROMPT = `あなたはブランドのアートディレクターです。ある企業のWebサイトから集めた画像を1枚ずつ見て、それがこのブランドの「素材（アセット）」かどうかを、人が見て判断するのと同じように分類してください。

ブランドの素材（優先して見分ける）:
- keyvisual: ヒーローやOGPの主役の絵。ブランドの顔になるビジュアル。ブランドのスローガンを文字で描いた画像（ヒーローの大きな文字など）もここ
- texture: 背景の地紋・グラデーション・質感。文字が載っていない背景用の絵
- product: 提供している製品の写真、アプリ・Webの画面、デバイスのモックアップ
- illustration: ブランドのタッチで描かれたイラスト
- icon: そろいのアイコン・ピクトグラム
- leadership: 代表・役員など経営陣の写真
- team: 社員・メンバーの写真
- place: オフィス・拠点・店舗の写真

ブランドの素材ではないもの（サイトにあっただけ）:
- editorial: ニュース・お知らせ・ブログ・コラム・プレスリリースのサムネイル。記事タイトルが入った画像
- campaign: 期間限定のキャンペーンや告知のバナー、セミナー・ウェビナーの告知
- partner: 取引先・提携先・導入企業・掲載メディアなど、他社のロゴ
- decoration: ブランド固有でない汎用のストックフォト
- other: どれにも当てはまらない

判断のしかた:
- 画像に添えた情報（alt・ページ上の位置・表示サイズ・ファイル名・ページのURL）も手がかりにする。記事一覧やニュース欄にある画像、記事タイトル入りの画像は editorial。
- 人物写真は、肩書き・名前のalt、会社概要や役員紹介のページにあることを手がかりに leadership / team を分ける。モデル風のストックフォトは decoration。
- 迷ったら、ブランドの素材として広告やLPに使い回せるかで決める。
- すべての画像に答える。`;

export type Row = {
  id: string;
  label: string | null;
  r2_key: string | null;
  media_type: string | null;
  category_source: string | null;
  source_url: string | null;
  provenance: Record<string, unknown> | null;
};

export type ClassifyResult = { judged: number; core: number; remaining: number };

async function thumbnail(bytes: Buffer, mediaType: string): Promise<string | null> {
  try {
    const jpeg = await sharp(bytes, { failOn: "none", density: mediaType === "image/svg+xml" ? 144 : undefined })
      .rotate()
      .resize(LONG_EDGE, LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 72 })
      .toBuffer();
    return jpeg.toString("base64");
  } catch {
    return null;
  }
}

function context(row: Row): string {
  const p = row.provenance ?? {};
  const facts = [
    row.label ? `名前: ${row.label}` : "",
    typeof p.alt === "string" && p.alt ? `alt: ${p.alt}` : "",
    typeof p.role === "string" ? `ページ上の扱い: ${p.role}` : "",
    typeof p.rendered_width === "number" ? `表示サイズ: ${p.rendered_width}×${p.rendered_height}` : "",
    typeof p.page_url === "string" ? `ページ: ${p.page_url}` : "",
    row.source_url ? `ファイル: ${row.source_url.split("?")[0].split("/").pop()}` : "",
  ];
  return facts.filter(Boolean).join(" / ");
}

/** One model call over up to BATCH images. Writes nothing. */
export async function judgeImages(
  batch: Row[],
): Promise<{ row: Row; use: AssetJudgement["use"]; note: string }[]> {
  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [];
  const sent = new Map<string, Row>();
  for (const row of batch) {
    const bytes = row.r2_key ? await getR2Object(row.r2_key) : null;
    const jpeg = bytes ? await thumbnail(bytes, row.media_type ?? "") : null;
    if (!jpeg) continue;
    sent.set(row.id, row);
    content.push({ type: "text", text: `【画像 ID: ${row.id}】${context(row)}` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg}` } });
  }
  if (sent.size === 0) return [];
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await parseOrExplain(
    () =>
      client.chat.completions.parse({
        model: LLM_MODEL,
        max_completion_tokens: LLM_BUDGET.long,
        reasoning_effort: LLM_EFFORT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [...content, { type: "text", text: "各画像の用途を答えてください。" }] as never },
        ],
        response_format: zodResponseFormat(JudgementSchema, "site_image_uses"),
      }),
    "画像が多すぎて一度に判断できませんでした",
  );
  const answers = response.choices[0]?.message.parsed?.images ?? [];
  return answers.flatMap((answer) => {
    const row = sent.get(answer.id);
    return row ? [{ row, use: answer.use, note: answer.note.trim().slice(0, 120) }] : [];
  });
}

/** Judge the brand's not-yet-judged site images. Never throws past a batch. */
export async function classifySiteImages(input: {
  supabase: SupabaseClient;
  brandId: string;
}): Promise<ClassifyResult> {
  const { supabase, brandId } = input;
  const { data, error } = await supabase
    .from("brand_materials")
    .select("id, label, r2_key, media_type, category, category_source, source_url, provenance")
    .eq("brand_id", brandId)
    .eq("scope", "brand")
    .eq("source_kind", "url_fetch")
    .or("category.is.null,category.neq.screen")
    .not("r2_key", "is", null)
    .like("media_type", "image/%")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const pending = ((data ?? []) as Row[]).filter((row) => !(row.provenance as Record<string, unknown> | null)?.asset);
  const now = pending.slice(0, MAX_PER_RUN);
  if (now.length === 0) return { judged: 0, core: 0, remaining: 0 };

  let judged = 0;
  let core = 0;
  for (let start = 0; start < now.length; start += BATCH) {
    const batch = now.slice(start, start + BATCH);
    let answers: { row: Row; use: AssetJudgement["use"]; note: string }[] = [];
    try {
      answers = await judgeImages(batch);
    } catch (batchError) {
      console.error("Judging a batch of site images failed:", batchError);
      continue;
    }
    const at = new Date().toISOString();
    for (const answer of answers) {
      const { row } = answer;
      const judgement: AssetJudgement = { use: answer.use, note: answer.note, model: LLM_MODEL, at };
      const patch: Record<string, unknown> = {
        provenance: { ...(row.provenance ?? {}), asset: judgement },
        updated_at: at,
      };
      // A person's category stands (lib/materials/classify.ts).
      if (row.category_source !== "user") {
        patch.category = ASSET_USE[answer.use].category;
        patch.category_source = "inferred";
      }
      const written = await supabase.from("brand_materials").update(patch).eq("id", row.id);
      if (written.error) {
        console.error("Storing an image judgement failed:", written.error.message);
        continue;
      }
      judged += 1;
      if (ASSET_USE[answer.use].tier === "core") core += 1;
    }
  }
  return { judged, core, remaining: pending.length - judged };
}
