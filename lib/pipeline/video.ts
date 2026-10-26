/**
 * The five-stage pipeline for one V2 video Take.
 *
 * The same five stages as the brand-asset pipeline (deliverable-architecture
 * §15.2), but the inputs and outputs are read from rows the video product
 * already has — `takes` (brief), `take_renders` (status), `render_artifacts`
 * (MP4). Nothing here is stored: each stage is a read of its inputs and
 * outputs, so it cannot drift.
 *
 * Stage definitions stay close to the brand-asset ones (lib/pipeline/brand-
 * assets.ts). The point of staging is to give the user one mental model
 * across surfaces; if the video pipeline quietly renamed "map" to "render"
 * the metaphor would stop paying off.
 */

import {
  STAGE_LABELS,
  goalProgress,
  type GoalField,
  type GoalProgress,
  type PipelineStage,
  type PipelineStageStatus,
} from "./stages";

export interface VideoPipelineInput {
  template: string;
  hasBrief: boolean;
  /** Materials the user actually supplied, pinned to this take. */
  sourceCount?: number;
  /** When the newest of them was pinned. */
  sourcePinnedAt?: string | null;
  /** The materials pinned now, by id. */
  sourceIds?: string[];
  /**
   * The materials the last successful reading actually read, by id. Null when
   * no reading has recorded ids; absent when the caller did not look.
   *
   * The input stage is stale when this differs from `sourceIds` in EITHER
   * direction. Timestamps could only see additions: a removed pin takes its
   * time with it, the newest remaining pin is older than the reading, and
   * 「すべて読み取り済み」 stood over a list that had changed (2026-09-07).
   */
  readIds?: string[] | null;
  /** Last successful run per stage, when there has been one. */
  runs?: Partial<Record<"extract" | "structure" | "map", string | null>>;
  /** When the brief was last written. */
  briefUpdatedAt: string | null;
  /** Resolved brief payload (or whatever the take currently holds). */
  brief: Record<string, unknown> | null;
  /** Render job status, when one exists. */
  renderStatus: "running" | "ready" | "failed" | "empty";
  /** When the render was last produced (successful or attempted). */
  renderUpdatedAt: string | null;
  /** When the most recent MP4 artifact was uploaded. */
  artifactCreatedAt: string | null;
  /**
   * The fixing step, for templates that have one (event-cm).
   *
   * Present means the chain ends at the film rather than at a file: `at` is
   * when the workbench was last made the film, `changes` how many edits have
   * happened since (lib/event-cm/bake.ts). Absent means this template has no
   * such step and its last stage is the render, as it always was.
   */
  bake?: { at: string | null; changes: number } | null;
}

export interface VideoPipeline {
  stages: PipelineStage[];
  goal: GoalProgress;
}

/** The fields a video brief must fill before its output is more than a shell.
 *  No video template declares any yet, so the bar grades nothing. */
const VIDEO_BRIEF_GOAL: readonly GoalField[] = [];

/** Field paths that are actually populated in the current brief. */
function filledPaths(brief: Record<string, unknown> | null): string[] {
  if (!brief) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(brief)) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && Object.keys(value as object).length === 0) continue;
    out.push(key);
  }
  return out;
}

/**
 * Staleness travels: if any upstream is newer than a stage's output, or if
 * the upstream itself is stale, the stage is stale. Same rule as brand-asset
 * pipeline; timestamps suffice while each stage writes once per run.
 */
function statusFor(
  produced: string | null,
  upstream: string | null,
  hasOutput: boolean,
  upstreamStale: boolean,
): PipelineStageStatus {
  if (!hasOutput) return "empty";
  if (upstreamStale) return "stale";
  if (produced && upstream && upstream > produced) return "stale";
  return "ready";
}

/** Helper retained for future stages that will have multiple upstream rows. */
export function latest(times: Array<string | null | undefined>): string | null {
  const valid = times.filter((value): value is string => Boolean(value)).sort();
  return valid.length > 0 ? valid[valid.length - 1] : null;
}

/**
 * Derive the video pipeline from the rows the video product already keeps.
 * Read-only — the only way a stage gets out of sync is if the rows do.
 */
export function videoPipeline(input: VideoPipelineInput): VideoPipeline {
  const goal = goalProgress(VIDEO_BRIEF_GOAL, filledPaths(input.brief));

  // input: material the USER supplied — not the brief.
  //
  // This used to read `hasBrief`, which meant every take reported its input
  // stage complete the moment it was created, because a seeded take is created
  // with a brief. That said somebody had given us something when they had
  // given us nothing. A seeded brief is the tool's proposal; the input stage
  // is about what came in from outside.
  const sourceCount = input.sourceCount ?? 0;
  const inputAt = input.sourcePinnedAt ?? null;
  const extractAt = input.runs?.extract ?? null;

  // input and extraction are one stage.
  //
  // They were two, and the split cost a user a whole round trip: a flyer was
  // uploaded, "資料を読み取る" was pressed, it said 成功, and the video still
  // described a different event — because reading is not applying, and the two
  // steps that do apply were in drawers nobody had been told to open.
  //
  // Merging them is also honest about what reading currently is. slide-factory
  // keeps ①入力・抽出 as one stage because its extractor really parses PDFs and
  // spreadsheets; here extraction reads text files and *carries* everything
  // else to the model, so a stage of its own was announcing work that mostly
  // does not happen. When a real parser arrives it can split again.
  //
  // `stale` with material and no run is the state that matters: there is
  // something to read and it has not been read.
  // What changed since the reading, as sets. Both directions count: a document
  // taken out is as much a change to the input as one put in, and the same
  // 「未反映」 has to follow either.
  const current = new Set(input.sourceIds ?? []);
  const read = input.readIds ? new Set(input.readIds) : null;
  const added = read ? [...current].filter((id) => !read.has(id)).length : 0;
  const removed = read ? [...read].filter((id) => !current.has(id)).length : 0;
  const inputStatus: PipelineStageStatus =
    sourceCount === 0
      ? "empty"
      : !extractAt
        ? "stale"
        : read && input.sourceIds
          ? added + removed > 0
            ? "stale"
            : "ready"
          : statusFor(extractAt, inputAt, true, false);
  const changed = [
    added > 0 ? `追加${added}件` : null,
    removed > 0 ? `外した${removed}件` : null,
  ].filter(Boolean);

  // structure: a run that worked out the event's facts from what was read.
  // Recorded, not applied — applying is the map stage's job, which is what
  // gives that stage something a person can actually run.
  const structureAt = input.runs?.structure ?? null;
  const structureStatus = statusFor(
    structureAt,
    extractAt ?? inputAt,
    Boolean(structureAt),
    inputStatus === "stale",
  );

  // map: the brief as it now stands — what the template renders from. It has
  // an output as soon as the take has a brief, because a seeded take is a
  // complete film from the first second; what changes is where its values came
  // from. Its timestamp is the map run when there has been one, and otherwise
  // the brief's own, so a hand-corrected value still counts as work done.
  const mapAt = input.runs?.map ?? input.briefUpdatedAt;
  const mapHasOutput = input.hasBrief && Boolean(input.template);
  const mapStatus = statusFor(
    mapAt,
    structureAt,
    mapHasOutput,
    structureStatus === "stale",
  );

  // The last stage: the film, or — for templates with no fixing step — the file.
  //
  // MP4 used to be the fourth link of the chain for everything, which read as
  // "this is not finished until you export". Exporting is outside the chain
  // (§9.4): most people never ask for it, and putting it here made a video that
  // plays perfectly look three quarters done. What actually completes the chain
  // for event-cm is the bake — the moment the workbench becomes the film — so
  // that is what the fourth dot reports when the template has one.
  //
  // A failed render still counts as "the stage produced something" — the user
  // can see it failed from the bar dot, but the row exists and the latest
  // attempt is what would be re-rendered.
  const outputAt = input.bake
    ? input.bake.at
    : (input.artifactCreatedAt ?? input.renderUpdatedAt);
  const outputHasOutput = input.bake
    ? input.bake.at !== null
    : input.renderStatus !== "empty";
  const outputStatus: PipelineStageStatus = input.bake
    ? !input.bake.at
      ? "empty"
      : mapStatus === "stale" || input.bake.changes > 0
        ? "stale"
        : "ready"
    : statusFor(outputAt, mapAt, outputHasOutput, mapStatus === "stale");

  const templateLabel = input.template || "テンプレート未選択";

  const stages: PipelineStage[] = [
    {
      id: "input",
      // Not STAGE_LABELS.input: the merge is this pipeline's decision, and the
      // brand-asset pipeline still has the two stages separately.
      label: "入力・抽出",
      status: inputStatus,
      summary:
        sourceCount === 0
          ? "資料なし（すべてこちらの提案）"
          : inputStatus === "ready"
            ? `資料${sourceCount}件・読み取り済み`
            : changed.length > 0
              ? `資料${sourceCount}件・${changed.join("、")}が未反映`
              : `資料${sourceCount}件・未読み取り`,
      producedAt: extractAt ?? inputAt,
    },
    {
      id: "structure",
      label: STAGE_LABELS.structure,
      status: structureStatus,
      summary: structureAt ? "資料の内容を反映済み" : "未実行",
      producedAt: structureAt,
    },
    {
      id: "map",
      label: STAGE_LABELS.map,
      status: mapStatus,
      summary:
        goal.missing.length === 0
          ? `テンプレート: ${templateLabel}`
          : `${goal.filled.length}/${goal.filled.length + goal.missing.length}項目を充足`,
      producedAt: mapAt,
    },
    {
      id: "output",
      // 「動画プレビュー」, not 「動画」: with an MP4 on the same page, 「動画に
      // 反映」 read as 「MP4に反映」 (2026-09-08). The player and the MP4 are
      // drawn from the same fixed brief; "preview" means before export, not
      // lesser.
      label: input.bake ? "動画プレビュー" : STAGE_LABELS.output,
      status: outputStatus,
      summary: input.bake
        ? !input.bake.at
          ? "未実行（下書きのまま再生中）"
          : input.bake.changes > 0
            ? `未反映の変更が${input.bake.changes}件`
            : "絵コンテの内容を反映済み"
        : input.renderStatus === "ready"
          ? "MP4を作成済み"
          : input.renderStatus === "running"
            ? "MP4を作成中"
            : input.renderStatus === "failed"
              ? "前回の作成に失敗"
              : "MP4未作成",
      producedAt: outputAt,
    },
  ];

  return { stages, goal };
}

