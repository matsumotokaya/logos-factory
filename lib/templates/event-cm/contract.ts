// Checking the written film against the contract it was written to.
//
// The budgets are already declared (remotion/event-cm/types.ts) and their own
// comment says what is supposed to happen to them:
//
//   Told to the writer AND checked after, since a model asked for 62
//   characters returns 89.
//
// The first half was true and the second was not. The prompt states every
// budget; nothing then looked at the answer. A beat at twice its budget is not
// a long sentence — it is a twelve-second picture where eight were designed —
// and it reached the screen with nothing said about it.
//
// Pure and total, so the same report is available to the workspace, to a
// script, and to whatever writes a run record later. It reports PASSING checks
// too: 「何も文句を言っていない」と「合っていると分かっている」は違う feeling,
// and only the second is the one wanted before publishing.
//
// What this does NOT check: whether the narration states a fact nobody gave us.
// That needs the facts beside the text and belongs with the mapping stage
// (lib/event-cm/facts.ts), not here.

import {
  EVENT_CM_CHARS_PER_SECOND,
  EVENT_CM_MAX_CHARS,
  EVENT_CM_MIN_CHARS,
  EVENT_CM_SCENE_LABELS,
  eventCmSceneBudget,
  eventCmSceneKey,
  eventCmNarratedSteps,
  sceneChars,
  narrationBudgetIssues,
  type EventCmBrief,
  type EventCmScene,
} from "@/remotion/event-cm/types";

export interface EventCmCheck {
  id: "scenes" | "scene-chars" | "total-chars";
  /** What was looked at. */
  label: string;
  ok: boolean;
  /** The numbers, whether it passed or not. A check that only speaks when it
   *  fails cannot be told apart from one that never ran. */
  detail: string;
}

/** 「テーマ」「アジェンダ2」 — the scene as a person names it. */
const sceneLabel = (scene: { role: EventCmScene["role"]; index?: number }): string =>
  scene.index === undefined
    ? EVENT_CM_SCENE_LABELS[scene.role]
    : `${EVENT_CM_SCENE_LABELS[scene.role]}${scene.index + 1}`;

const seconds = (chars: number): number =>
  Math.round((chars / EVENT_CM_CHARS_PER_SECOND) * 10) / 10;

export function eventCmContract(brief: EventCmBrief): EventCmCheck[] {
  const scenes = brief.narration.scenes;
  const expected = eventCmNarratedSteps(brief);
  const expectedKeys = expected.map((step) => eventCmSceneKey(step));
  const actualKeys = scenes.map((scene) => eventCmSceneKey(scene));

  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const orphan = actualKeys.filter((key) => !expectedKeys.includes(key));
  const shapeOk = missing.length === 0 && orphan.length === 0;

  const issues = narrationBudgetIssues(brief.narration);
  const total = scenes.reduce((sum, scene) => sum + sceneChars(scene), 0);
  const totalOk = total >= EVENT_CM_MIN_CHARS && total <= EVENT_CM_MAX_CHARS;

  return [
    {
      id: "scenes",
      label: "語るシーンと行の対応",
      ok: shapeOk,
      detail: shapeOk
        ? `${expected.length}シーンすべてに行があります`
        : [
            missing.length ? `行が無い: ${missing.join("、")}` : "",
            orphan.length ? `映像に無い行: ${orphan.join("、")}` : "",
          ]
            .filter(Boolean)
            .join(" / "),
    },
    {
      id: "scene-chars",
      label: "シーンごとの文字数",
      ok: issues.length === 0,
      detail:
        issues.length === 0
          ? `${scenes.length}シーンすべて予算内`
          : issues
              .map((issue) => {
                const budget = eventCmSceneBudget(issue);
                return `${sceneLabel(issue)} ${issue.chars}字（予算${budget.min}〜${budget.max}字・${issue.over ? "超過" : "不足"}）`;
              })
              .join(" / "),
    },
    {
      id: "total-chars",
      label: "全体の文字数",
      ok: totalOk,
      // The seconds are an estimate from the writing pace, not a measurement:
      // the timeline is whatever the voice turns out to be. Said as 約 so it is
      // not mistaken for the film's length.
      detail: `${total}字・約${seconds(total)}秒（予算${EVENT_CM_MIN_CHARS}〜${EVENT_CM_MAX_CHARS}字）`,
    },
  ];
}

/** Checks that did not pass. The workspace shows all of them; a caller that
 *  only wants to know whether to complain wants this. */
export const eventCmContractFailures = (brief: EventCmBrief): EventCmCheck[] =>
  eventCmContract(brief).filter((check) => !check.ok);
