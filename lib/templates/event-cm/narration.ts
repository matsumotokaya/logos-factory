import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { LLM_BUDGET, LLM_MODEL, parseOrExplain } from "@/lib/llm";
import { z } from "zod";
import {
  EVENT_CM_MAX_CHARS,
  EVENT_CM_MIN_CHARS,
  eventCmNarratedSteps,
  eventCmSceneBudget,
  eventCmSceneKey,
  EVENT_CM_TARGET_SECONDS,
  EVENT_CM_SCENE_LABELS,
  type EventCmBrief,
  type EventCmNarration,
  type EventCmSceneRole,
  type EventCmSceneStep,
} from "@/remotion/event-cm/types";

// Write the narration for a narrated event promo.
//
// Rules come from deliverable-architecture §17.2: exhaust what is decided
// before asking the model to decide it. The facts (title, guests, programs,
// date) are already in the brief and are handed over as fixed truth; what the
// model does is the one thing rules cannot — choose an angle and compress the
// evening into five spoken beats.
//
// The reason this stage is worth an LLM call: an announcement that lists its
// own agenda is not a reason to attend. Deciding what the evening actually
// offers, and saying it in the first four seconds, is a judgment.

const LLM_TIMEOUT_MS = 120_000;

const openai = (): OpenAI => new OpenAI({ timeout: LLM_TIMEOUT_MS, maxRetries: 2 });

/**
 * What each narrated scene's line has to do, and how long it may be.
 *
 * One line per picture, so this table is also the film's structure. The two mark
 * scenes are absent because nothing is said over them: the film opens and closes
 * on the presenter's logo with music only, and the narration starts by calling
 * the title — an announcement names itself first rather than teasing.
 */
// The label is not repeated here: the model is told the same scene name the
// storyboard shows, so a rename cannot leave the two describing one picture
// differently (remotion/event-cm/types.ts EVENT_CM_SCENE_LABELS).
const ROLE_BRIEFS: Record<string, { seconds: number; instruction: string }> = {
  title: {
    seconds: 4,
    instruction:
      "イベント名を名乗る。主催とシリーズ名を添えてよい。ここが第一声なので、前置きや誘い文句を置かずタイトルコールから入る。",
  },
  value: {
    seconds: 6,
    instruction:
      "なぜこの回に来る価値があるのか。体験として言う。抽象的な理念で終わらせない。",
  },
  program: {
    seconds: 6,
    instruction:
      "実際に何が起きるか。**全部は言えません。** 最も具体的で魅力のあるものを選び、流れとして1〜2文で。列挙にしない。",
  },
  guests: {
    seconds: 4,
    instruction:
      "誰が話すか。名前と、その人がなぜ聞く価値があるのかを一言で。全員を読み上げなくてよい。",
  },
  cta: {
    seconds: 5,
    instruction: "日付と、場所があれば場所、そして次にすること。それだけ。",
  },
};

function systemFor(
  steps: readonly EventCmSceneStep[],
  programs: readonly { title: string; detail?: string }[],
): string {
  const keys = steps.map(eventCmSceneKey);
  const specs = steps
    .map((step) => {
      const spec = ROLE_BRIEFS[step.role];
      const budget = eventCmSceneBudget(step);
      const key = eventCmSceneKey(step);
      // A repeated role needs its own instruction: the picture shows ONE
      // programme, so its line has to be about that programme and nothing else.
      // Without naming the item here the model writes three summaries of all
      // three, and the film says the same thing three times.
      const item = step.role === "program" ? programs[step.index ?? 0] : null;
      const instruction =
        step.role === "program" && step.index !== undefined && item
          ? [
              `${step.index + 1}つ目のプログラム「${item.title}」だけを話す。他のプログラムには触れない。`,
              // The name alone is a label; the film has to say what is IN it.
              // Two sentences: what it is, then what it covers.
              item.detail?.trim()
                ? `内容は「${item.detail.trim()}」。まず名前を言い、続けてその中身を一文で言う（合計2文程度）。この内容の範囲を超えたことは足さない。`
                : "名前だけを短く言う。書かれていない中身を想像で足さない。",
              step.index === 0
                ? `冒頭に「${programs.length}つのプログラムを通して何が身につくか」を一文だけ置いてから、1つ目に入る。`
                : "前置きを置かず、この内容から入る。",
            ].join("")
          : spec.instruction;
      const label =
        step.role === "program" && step.index !== undefined
          ? `${EVENT_CM_SCENE_LABELS.program}${step.index + 1}`
          : EVENT_CM_SCENE_LABELS[step.role as EventCmSceneRole];
      return `- **${key}（${label}・約${spec.seconds}秒 / ${budget.min}〜${budget.max}字）**: ${instruction}`;
    })
    .join("\n");
  const roles = keys;

  // Vocabulary note: the code, the UI and this prompt now all say ナレーション
  // (2026-08-17). The parenthetical 「読み上げ原稿」 stays as an INSTRUCTION, not
  // as a second name: it is what keeps the words speakable, and asking for a
  // bare 「ナレーション」 invites the screenplay furniture that rule 2 below then
  // has to forbid. 「台本」 was removed because it is ambiguous in the same
  // direction, not to rename it.
  //
  // The three-way split (ナレーション the words / ボイス the recording / 字幕 the
  // cards) exists for OUR sake — three surfaces used to argue about which one
  // the film was made from. The model has no such confusion: it is asked once,
  // for the words that will be spoken.
  return `あなたは日本のイベント告知CMのコピーライター兼構成作家です。${EVENT_CM_TARGET_SECONDS}秒のCMナレーション（読み上げ原稿）を書きます。

## 絶対の制約

1. **事実を捏造しない。** 提示された事実だけを話す。日時・会場・料金・人名・肩書き・プログラム内容を推測で補わない。提示されていない情報（例: 会場がnull）は「後日発表」等と言い換えず、単に触れない。
2. **読み上げる言葉だけを書く。** 見出し、ト書き、記号、括弧書き、英数字の羅列を入れない。数字は読み上げる形にする（「2026.10.2」→「10月2日」）。
3. **${roles.length}つの役割をこの順で厳密に1回ずつ**: ${roles.join(" → ")}。
4. **1つの役割=画面1枚=1メッセージ。** 1つの役割の中で話題を2つ扱わない。次の役割の内容を先取りしない。
5. 映像の冒頭と末尾には主催のロゴだけが出る無音のシーンがある。**そこで読む言葉は無い**ので書かない。

## 各役割の仕事と長さ

**日本語のCMナレーションは1秒あたり約7字です。各シーンの字数は下の予算を守ってください。ここが崩れると映像の配分が崩れます。**

${specs}

## 読み上げの整え方

- 数字は読み上げる形に開く。ただし**固有名詞に含まれる数字は開かない**（「レオパレス21」「Miss SAKE 2026」はそのまま名前として扱い、不自然な数詞に分解しない）。
- **日付に年を含めない。** 近い将来の開催日は月・日・曜日で足りる。「二千二十六年九月十一日」ではなく「九月十一日、金曜日」。
- **行動喚起は一度だけ言う。** 提示された行動喚起の文言をそのまま貼り付けて重ねない（「詳しくは、詳細とお申し込みは、こちら」のような重複を作らない）。自然な一文にまとめる。
- 人名は初出でフルネーム、以降は姓のみ。肩書きは短く言い換えてよい（「一社）Miss SAKE 代表理事」→「ミス・サケ代表理事」）。
- **年齢制限・定員・注記はナレーションで読まない。** 画面に文字で出るので、音声で読むと最後の一押しが濁ります。

## 文体

- 話し言葉。1文は短く。読点で息継ぎができること。
- 体言止めを多用しない（読み上げると素っ気なく聞こえる）。
- 誇張した最上級（「最高の」「唯一の」）を使わない。事実の強さで語る。
- 全体で${EVENT_CM_MIN_CHARS}〜${EVENT_CM_MAX_CHARS}字（約${EVENT_CM_TARGET_SECONDS}秒）。

## angle

この原稿を書く前に決めた訴求軸を1文で書く。「何を約束する${EVENT_CM_TARGET_SECONDS}秒か」を、書き手の判断として述べる。`;
}

const draftSchemaFor = (roles: readonly string[]) =>
  z.object({
    angle: z
      .string()
      .describe(
        "この原稿が約束していることを1文の日本語で。書き手の判断であって、事実の要約ではない",
      ),
    scenes: z
      .array(
        z.object({
          role: z.enum(roles as [string, ...string[]]),
          text: z
            .string()
            .describe("このシーンで読み上げる言葉そのもの。日本語。ト書き・見出しを含まない"),
        }),
      )
      .describe(
        `Exactly ${roles.length} scenes, each role once, in order: ${roles.join(" → ")}`,
      ),
  });

/** The facts, written out for the model. Only what the brief actually holds —
 *  an absent fact is absent from the prompt, so it cannot be echoed back. */
export function describeEventFacts(brief: EventCmNarrationInput): string {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  push("タイトル", brief.title);
  push("サブタイトル", brief.subtitle);
  push("シリーズ", brief.seriesLabel);
  push("主催", brief.presenter);
  if (brief.valueLines.length) push("価値の訴求", brief.valueLines.join(""));
  push("価値のチップ", brief.valueChip);

  if (brief.programs.length) {
    lines.push("プログラム:");
    for (const program of brief.programs) {
      // The detail is the only thing an agenda line can be ABOUT. Omitting it
      // here is what left the model with 「専門家による解説」 and nothing else.
      lines.push(
        program.detail?.trim()
          ? `  - ${program.title}: ${program.detail.trim()}`
          : `  - ${program.title}`,
      );
    }
  }
  if (brief.guests.length) {
    lines.push("登壇者:");
    for (const guest of brief.guests) {
      lines.push(`  - ${guest.name}（${guest.role.replace(/\n/g, " / ")}）`);
    }
  }

  const schedule: string[] = [];
  if (brief.schedule.date.trim()) schedule.push(brief.schedule.date);
  if (brief.schedule.weekday.trim()) schedule.push(brief.schedule.weekday);
  if (brief.schedule.time.trim()) schedule.push(brief.schedule.time);
  if (schedule.length) lines.push(`開催日時: ${schedule.join(" ")}`);
  push("会場", brief.schedule.venue);
  push("参加費", brief.schedule.fee);
  push("行動喚起", brief.cta);
  push("注記", brief.footnote);

  const logos = brief.logos.map((logo) => logo.name).filter(Boolean);
  if (logos.length) lines.push(`関係団体: ${logos.join("、")}`);

  return lines.join("\n");
}

export interface EventCmNarrationDraft {
  narration: EventCmNarration;
  facts: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

/**
 * What writing a narration needs: the facts, and the shape they imply.
 *
 * Not the narration — that is the output, and asking for it as input is how a
 * caller ends up handing over the words it is about to replace. Not the
 * recording either. Narrow on purpose so an `event-promo` brief can be drafted
 * against too (scripts/draft-event-cm-narration.ts reads real takes of both
 * templates to see what the model does with them).
 */
export type EventCmNarrationInput = Omit<EventCmBrief, "narration" | "voice">;

export function eventCmNarrationAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Draft a narration from the brief's facts.
 *
 * `notes` carries anything the brief cannot hold — the organiser's own words
 * about who this is for, what happened at the last one. It is injected as
 * additional source material, under the same no-invention rule.
 */
export async function draftEventCmNarration(
  brief: EventCmNarrationInput,
  options: { notes?: string | null; now: string } = { now: new Date().toISOString() },
): Promise<EventCmNarrationDraft> {
  const facts = describeEventFacts(brief);
  const notes = options.notes?.trim();
  // Which lines this brief needs. With nobody announced there is no speaker
  // picture, so asking for a speaker line would produce one with nowhere to go —
  // and with three programmes there are three programme pictures, each wanting
  // its own line about its own item.
  const steps = eventCmNarratedSteps(brief);
  const keys = steps.map(eventCmSceneKey);

  const response = await parseOrExplain(() =>
    openai().chat.completions.parse({
    model: LLM_MODEL,
    max_completion_tokens: LLM_BUDGET.long,
    reasoning_effort: "medium",
    messages: [
      {
        role: "system",
        content: systemFor(steps, brief.programs),
      },
      {
        role: "user",
        content: `このイベントについて分かっている事実は以下がすべてです。ここに無い情報は存在しないものとして扱ってください。

${facts}${notes ? `\n\n主催者からの補足（事実として扱ってよい）:\n${notes}` : ""}

${EVENT_CM_TARGET_SECONDS}秒のCMナレーションを書いてください。`,
      },
    ],
    response_format: zodResponseFormat(draftSchemaFor(keys), "event_cm_narration"),
    }),
    "ナレーションが長さの上限に達しました。シーン数が多いか、事実の量が多すぎます。プログラムを減らすか、資料を整理してからもう一度お試しください",
  );

  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) throw new Error("ナレーションを生成できませんでした");

  // Order is part of the contract, and the model is asked for it rather than
  // trusted with it: rebuild in the canonical scene order before storing.
  const byKey = new Map(parsed.scenes.map((scene) => [scene.role, scene.text]));
  const scenes = steps.map((step) => ({
    role: step.role,
    ...(step.index === undefined ? {} : { index: step.index }),
    text: (byKey.get(eventCmSceneKey(step)) ?? "").trim(),
  }));
  const missing = scenes
    .filter((scene) => !scene.text)
    .map((scene) => eventCmSceneKey(scene));
  if (missing.length) {
    throw new Error(`ナレーションに欠けているシーンがあります: ${missing.join(", ")}`);
  }

  return {
    narration: {
      version: 1,
      scenes,
      source: "llm",
      updatedAt: options.now,
      angle: parsed.angle.trim(),
    },
    facts,
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        }
      : null,
  };
}
