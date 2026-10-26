import {
  goalFieldMap,
  goalProgress,
  provisionalFields,
  type FieldFill,
  type GoalField,
  type GoalFieldState,
  type GoalProgress,
} from "./stages";
import {
  EVENT_CM_SUPPRESSED_NOTE,
  narrationChars,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

/**
 * What an event video needs to know before it is any good.
 *
 * The product's opinion, in the same form as BRAND_ASSET_GOAL: an event video
 * is not "an EventBrief with no nulls", it is a film that answers what this
 * evening is, why it is worth attending, what happens, who speaks, and when.
 * Adding a row here raises the bar and the pipeline immediately reports it as
 * missing (§17.8).
 *
 * `required` marks what the film cannot work without. Everything else has a
 * designed fallback: no photo means an ink ground and gold particles, no guest
 * portrait means a monogram medallion. A fallback is not a defect (§6), which
 * is why the missing list is short and means something.
 */
export const EVENT_CM_GOAL: readonly GoalField[] = [
  // What it is
  { path: "title", label: "イベント名", required: true },
  { path: "subtitle", label: "サブタイトル", required: false },
  { path: "seriesLabel", label: "シリーズ・回次", required: false },
  { path: "presenter", label: "主催", required: true },
  // Why attend — the one thing the evening promises
  { path: "valueLines", label: "訴求（何が得られるか）", required: true },
  { path: "valueChip", label: "訴求の一言", required: false },
  // What happens
  { path: "programs", label: "プログラム", required: true },
  { path: "guests", label: "登壇者", required: false },
  // When, and what to do
  { path: "schedule.date", label: "開催日", required: true },
  { path: "schedule.time", label: "開始時刻", required: true },
  { path: "schedule.venue", label: "会場", required: false },
  { path: "schedule.fee", label: "参加費", required: false },
  { path: "cta", label: "行動喚起", required: true },
  // How it looks
  { path: "logos", label: "ロゴ", required: true },
  { path: "visuals.value", label: "主役の写真", required: false },
  // Grounds, not decoration: the film uses one if it has one and stands on its
  // own ink if it does not. Optional for that reason — a fallback is not a
  // defect (§6), so a video with no scene photography is finished, not short.
  { path: "visuals.programs", label: "プログラムの背景", required: false },
  { path: "visuals.closing", label: "締めの背景", required: false },
  { path: "bgm", label: "BGM", required: false },
  // What it says
  { path: "narration", label: "ナレーション", required: true },
  { path: "voice", label: "ボイス", required: false },
];

/** Whether each goal field currently holds anything. Structure only — an empty
 *  string, an empty list and a null are all "not filled". */
function filledPaths(brief: EventCmBrief): string[] {
  const paths: string[] = [];
  const text = (path: string, value: string | null | undefined) => {
    if (value && value.trim()) paths.push(path);
  };
  const list = (path: string, value: readonly unknown[] | undefined) => {
    if (value && value.length > 0) paths.push(path);
  };

  text("title", brief.title);
  text("subtitle", brief.subtitle);
  text("seriesLabel", brief.seriesLabel);
  text("presenter", brief.presenter);
  list("valueLines", brief.valueLines);
  text("valueChip", brief.valueChip);
  list("programs", brief.programs);
  list("guests", brief.guests);
  text("schedule.date", brief.schedule?.date);
  text("schedule.time", brief.schedule?.time);
  text("schedule.venue", brief.schedule?.venue);
  text("schedule.fee", brief.schedule?.fee);
  text("cta", brief.cta);
  list("logos", brief.logos);
  if (brief.visuals?.value) paths.push("visuals.value");
  if (brief.visuals?.programs) paths.push("visuals.programs");
  if (brief.visuals?.closing) paths.push("visuals.closing");
  text("bgm", brief.bgm);
  if (narrationChars(brief.narration) > 0) paths.push("narration");
  if (brief.voice) paths.push("voice");

  return paths;
}

export interface EventCmGoalState {
  progress: GoalProgress;
  fields: GoalFieldState[];
  /** Filled by the tool's guess. The publish warning lists exactly these. */
  provisional: GoalFieldState[];
  /** Deliberately taken off screen. Neither filled nor missing — decided. */
  suppressed: string[];
}

/** Marker the facts surface writes when a field is switched off. Read from the
 *  data contract so there is one spelling of it (the shape of the film depends
 *  on the same marker — see `eventCmScenePlan`). */
const SUPPRESSED_NOTE = EVENT_CM_SUPPRESSED_NOTE;

/**
 * Read a brief against the goal, carrying each value's origin.
 *
 * A field with no recorded provenance is treated as `user`: everything that
 * predates provenance was authored by hand, and calling that "inferred" would
 * put a warning on facts somebody actually checked.
 */
export function eventCmGoalState(brief: EventCmBrief): EventCmGoalState {
  const provenance = brief.provenance ?? {};
  const suppressed = Object.entries(provenance)
    .filter(([, entry]) => entry.note === SUPPRESSED_NOTE)
    .map(([path]) => path);
  const off = new Set(suppressed);

  // A field switched off counts as settled, not as something still to go and
  // find: it stops appearing on the collection list and stops being warned
  // about. That is the difference between "nobody has told us" and "we decided
  // not to show one".
  const filled = filledPaths(brief).filter((path) => !off.has(path));
  const goal = EVENT_CM_GOAL.filter((field) => !off.has(field.path));
  const fills: FieldFill[] = filled.map((path) => ({
    path,
    origin: provenance[path]?.origin ?? "user",
  }));

  const fields = goalFieldMap(goal, fills);
  return {
    progress: goalProgress(goal, filled),
    fields,
    provisional: provisionalFields(fields),
    suppressed,
  };
}
