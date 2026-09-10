// Draft the narration for a narrated event promo, from an existing take's brief.
//
// A reading tool, not a writing one: it prints the narration and never stores it.
// The point is to judge the words — the angle, whether it invents anything,
// whether it lands near 30 seconds — before the screen work starts.
//
//   npm run event-cm:draft -- --take <UUID> [--notes "主催者の補足"]

import { createAdminSupabase } from "@/lib/supabase/server";
import {
  draftEventCmNarration,
  eventCmNarrationAvailable,
  type EventCmNarrationInput,
} from "@/lib/templates/event-cm/narration";
import {
  EVENT_CM_CHARS_PER_SECOND,
  EVENT_CM_MAX_CHARS,
  EVENT_CM_MIN_CHARS,
  eventCmSceneBudget,
  narrationBudgetIssues,
  narrationChars,
} from "@/remotion/event-cm/types";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};

const CHARS_PER_SECOND = EVENT_CM_CHARS_PER_SECOND;

async function main() {
  const takeId = flag("take");
  if (!takeId) throw new Error("--take <UUID> が必要です");
  if (!eventCmNarrationAvailable()) {
    throw new Error("OPENAI_API_KEY が設定されていません");
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("takes")
    .select("id, title, template_id, brief")
    .eq("id", takeId)
    .maybeSingle();
  if (error) throw new Error(`Takeを読めませんでした: ${error.message}`);
  if (!data) throw new Error(`Takeが見つかりません: ${takeId}`);
  if (data.template_id !== "event-promo" && data.template_id !== "event-cm") {
    throw new Error(`イベントTakeではありません: ${data.template_id}`);
  }

  const brief = data.brief as EventCmNarrationInput;
  const draft = await draftEventCmNarration(brief, {
    notes: flag("notes"),
    now: new Date().toISOString(),
  });

  const chars = narrationChars(draft.narration);
  const seconds = (chars / CHARS_PER_SECOND).toFixed(1);

  console.log(`\n■ ${data.title}  (${data.id})`);
  console.log("\n── 渡した事実 ──");
  console.log(draft.facts);
  console.log("\n── 訴求軸 ──");
  console.log(draft.narration.angle);
  console.log("\n── ナレーション ──");
  for (const [i, scene] of draft.narration.scenes.entries()) {
    const sceneChars = scene.text.replace(/\s/g, "").length;
    const budget = eventCmSceneBudget(scene);
    const onSpec = sceneChars >= budget.min && sceneChars <= budget.max;
    console.log(
      `\n${String(i + 1).padStart(2, "0")} ${scene.role}  (${sceneChars}字 / 約${(sceneChars / CHARS_PER_SECOND).toFixed(1)}秒)  予算 ${budget.min}〜${budget.max}字 ${onSpec ? "✓" : "✗"}`,
    );
    console.log(`   ${scene.text}`);
  }
  const withinBudget = chars >= EVENT_CM_MIN_CHARS && chars <= EVENT_CM_MAX_CHARS;
  console.log(
    `\n合計 ${chars}字 / 推定 約${seconds}秒  ${
      withinBudget ? "✓ 予算内" : `✗ 予算(${EVENT_CM_MIN_CHARS}〜${EVENT_CM_MAX_CHARS}字)外`
    }`,
  );
  const issues = narrationBudgetIssues(draft.narration);
  if (issues.length) {
    console.log(
      `シーン予算外: ${issues
        .map((issue) => `${issue.role} ${issue.chars}字(${issue.over ? "超過" : "不足"})`)
        .join(" / ")}`,
    );
  }
  if (draft.usage) {
    console.log(
      `tokens: in ${draft.usage.inputTokens} / out ${draft.usage.outputTokens}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
