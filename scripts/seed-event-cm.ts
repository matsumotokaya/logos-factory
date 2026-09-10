// What a brand gets handed the moment it asks for an event video — read only.
//
// Seeds the brief from the brand's adopted values plus the archetype, reports
// it against the goal with each field's origin, and (with --narration) writes the
// narration on top. Nothing is stored: this is for judging the result before
// the Take-creation path is built on it.
//
//   npm run event-cm:seed -- --brand <UUID> [--narration]

import { createAdminSupabase } from "@/lib/supabase/server";
import { seedEventCmBrief } from "@/lib/templates/event-cm/seed";
import { archetypeFor } from "@/lib/templates/event-cm/archetypes";
import { draftEventCmNarration, eventCmNarrationAvailable } from "@/lib/templates/event-cm/narration";
import { eventCmGoalState } from "@/lib/pipeline/event-cm";
import { EVENT_CM_CHARS_PER_SECOND } from "@/remotion/event-cm/types";
import { ORIGIN_LABELS } from "@/lib/pipeline/stages";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};
const has = (name: string): boolean => args.includes(`--${name}`);

async function main() {
  const brandId = flag("brand");
  if (!brandId) throw new Error("--brand <UUID> が必要です");

  const supabase = createAdminSupabase();
  const [brandResult, knowledgeResult] = await Promise.all([
    supabase
      .from("brand_entities")
      .select("id, name, industry, description")
      .eq("id", brandId)
      .maybeSingle(),
    supabase
      .from("brand_knowledge_values")
      .select("field_path, value")
      .eq("brand_id", brandId)
      .is("variant_id", null),
  ]);
  if (brandResult.error || !brandResult.data) {
    throw new Error("ブランドを読めませんでした");
  }
  const brand = brandResult.data;
  const palette: Record<string, string> = {};
  for (const row of knowledgeResult.data ?? []) {
    const path = row.field_path as string;
    if (path.startsWith("palette.") && typeof row.value === "string") {
      palette[path.slice("palette.".length)] = row.value;
    }
  }

  const archetype = archetypeFor(brand);
  const brief = seedEventCmBrief(
    {
      name: brand.name as string,
      industry: brand.industry as string,
      description: brand.description as string,
      palette,
    },
    { now: new Date(), seed: brandId },
  );

  console.log(`\n■ ${brand.name}（${brand.industry}）`);
  console.log(`イベント型: ${archetype.kind}  [${archetype.id}]`);
  console.log(
    `ブランドの色: ${
      Object.keys(palette).length
        ? Object.entries(palette)
            .map(([role, hex]) => `${role} ${hex}`)
            .join(" / ")
        : "なし"
    }`,
  );

  console.log("\n── シードされたブリーフ ──");
  console.log(`シリーズ   ${brief.seriesLabel}`);
  console.log(`タイトル   ${brief.title}`);
  console.log(`サブ       ${brief.subtitle}`);
  console.log(`主催       ${brief.presenter}`);
  console.log(`訴求       ${brief.valueLines.join("")}（${brief.valueChip}）`);
  console.log(`日時       ${brief.schedule.date} ${brief.schedule.weekday} ${brief.schedule.time}`);
  console.log(`会場       ${brief.schedule.venue ?? "—（未確定のため画面から省略）"}`);
  console.log(`プログラム ${brief.programs.map((p) => p.title).join(" / ")}`);
  console.log(`登壇者     ${brief.guests.length === 0 ? "—（捏造しない）" : ""}`);
  console.log(`CTA        ${brief.cta}`);
  console.log(
    `素材       ロゴ ${brief.logos[0]?.src ?? "なし（明朝のクレジットで代替）"} / BGM ${brief.bgm ?? "なし"}`,
  );

  const state = eventCmGoalState(brief);
  console.log("\n── ゴール（14項目中の必須8） ──");
  for (const field of state.fields) {
    const mark = field.origin ? "✓" : field.required ? "✗" : "・";
    const origin = field.origin ? `  ${ORIGIN_LABELS[field.origin]}` : "";
    console.log(`  ${mark} ${field.label}${origin}`);
  }
  console.log(
    `\n埋まった ${state.progress.filled.length}/${state.fields.length}  必須の不足 ${state.progress.missingRequired.length}  推定 ${state.provisional.length}`,
  );

  if (!has("narration")) return;
  if (!eventCmNarrationAvailable()) throw new Error("OPENAI_API_KEY が未設定です");

  const draft = await draftEventCmNarration(brief, { now: new Date().toISOString() });
  console.log("\n── 訴求軸 ──");
  console.log(draft.narration.angle);
  console.log("\n── ナレーション ──");
  let total = 0;
  for (const scene of draft.narration.scenes) {
    const chars = scene.text.replace(/\s/g, "").length;
    total += chars;
    console.log(`\n${scene.role}  (${chars}字 / 約${(chars / EVENT_CM_CHARS_PER_SECOND).toFixed(1)}秒)`);
    console.log(`   ${scene.text}`);
  }
  console.log(`\n合計 ${total}字 / 推定 約${(total / EVENT_CM_CHARS_PER_SECOND).toFixed(1)}秒`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
