/**
 * The five stages every deliverable is built through (deliverable-architecture
 * §15.2). These are what the user sees; whatever parallelism or node splitting
 * a stage needs internally stays inside it.
 *
 * A stage is not a screen. The deliverable itself stays on screen and a stage
 * opens over it, so "which stage is open" is a property of the URL rather than
 * a place the app navigates to (§17.3).
 */
export const PIPELINE_STAGES = [
  "input",
  "extract",
  "structure",
  "map",
  "output",
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStageId, string> = {
  input: "入力",
  extract: "抽出",
  structure: "構造化",
  map: "マッピング",
  output: "出力",
};

/**
 * `stale` is the whole point of modelling stages at all: adding one source
 * must invalidate what came after it and nothing before it, so the user can
 * keep injecting information without re-running everything (§17.4).
 */
export type PipelineStageStatus = "empty" | "ready" | "stale";

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  /** One line of fact — counts, never an estimated percentage. */
  summary: string;
  /** When this stage last produced something. */
  producedAt: string | null;
}

/**
 * What a deliverable is trying to become. Goals are the product's standard of
 * value (§17.1): a field is not judged against a reference answer, only
 * against whether the goal is met.
 *
 * `required` fields are what the deliverable cannot be considered complete
 * without. Everything else improves it.
 */
export interface GoalField {
  path: string;
  label: string;
  required: boolean;
}

export interface GoalProgress {
  /** Goal fields that have an adopted value. */
  filled: GoalField[];
  /** Goal fields with nothing adopted yet — the list of things to go get. */
  missing: GoalField[];
  /** Missing fields that are required. */
  missingRequired: GoalField[];
}

export function goalProgress(
  goal: readonly GoalField[],
  filledPaths: Iterable<string>,
): GoalProgress {
  const have = new Set(filledPaths);
  const filled = goal.filter((field) => have.has(field.path));
  const missing = goal.filter((field) => !have.has(field.path));
  return {
    filled,
    missing,
    missingRequired: missing.filter((field) => field.required),
  };
}

/**
 * Where a filled value came from (§17.5, slide-factory's `fieldmap.ts`).
 *
 * This exists because a deliverable is handed to the user complete — dates,
 * programmes and all — before anyone has told us anything. That is only
 * honest if the screen can say which parts are the customer's own material and
 * which parts the tool proposed.
 *
 * - `brand`     — taken from what this brand actually has (adopted knowledge,
 *                 its logos, its site). Treated as settled.
 * - `extracted` — read out of material the user supplied. Their own evidence,
 *                 so it is not warned about, but it stays traceable to the
 *                 document it came from.
 * - `inferred`  — the tool's proposal. A plausible date, a likely programme.
 *                 Never presented as established fact, and warned about on
 *                 publish (§15.2-4) rather than blocked.
 * - `user`      — someone typed or confirmed it. Settled, and never
 *                 overwritten by a re-run.
 */
export const FIELD_ORIGINS = ["brand", "extracted", "inferred", "user"] as const;
export type FieldOrigin = (typeof FIELD_ORIGINS)[number];

export const ORIGIN_LABELS: Record<FieldOrigin, string> = {
  brand: "ブランドから",
  extracted: "資料から読んだ",
  inferred: "推定",
  user: "あなたの入力",
};

export interface FieldFill {
  path: string;
  origin: FieldOrigin;
}

/** A goal field plus where its value came from. `null` origin = still missing. */
export interface GoalFieldState extends GoalField {
  origin: FieldOrigin | null;
}

export function goalFieldMap(
  goal: readonly GoalField[],
  fills: readonly FieldFill[],
): GoalFieldState[] {
  const origins = new Map(fills.map((fill) => [fill.path, fill.origin]));
  return goal.map((field) => ({ ...field, origin: origins.get(field.path) ?? null }));
}

/** Filled, but by the tool's guess — what a publish warning has to list. */
export const provisionalFields = (states: readonly GoalFieldState[]): GoalFieldState[] =>
  states.filter((state) => state.origin === "inferred");
