// What a pipeline drawer lets you press, and what it says when it does not.
//
// The same shape as lib/brand-tree-actions.ts and lib/event-cm/panel-actions.ts:
// the decision is data, tested here, and the component only draws it. A button
// that is disabled for the wrong reason is invisible in a screenshot and obvious
// in a test — and this file exists because one of them was: `disabled` meant
// "no material has been added", which is a real reason not to read anything and
// no reason at all not to write a narration. A freshly seeded video has no
// documents by design (§9.9), so the film step has to stay pressable.
//
// Two buttons per drawer, at most:
//   own      the work this stage does in place, while it has something new
//   advance  the step OUT of this stage, which runs the next stage's work and
//            opens its drawer — so progress appears where the work happens
//
// The chain is input → structure → map → film. The last link is not a stage of
// `run/[stage]`: it is the narration, the reading aloud and the fixing, three
// endpoints the page owns. So `run: "film"` hands the work back to the page and
// this file only decides whether there is any (§9.6).

import { FILM_STEP_LABEL, type FilmStep } from "@/lib/event-cm/bake";
import type { PipelineStage, PipelineStageId } from "@/lib/pipeline/stages";
import type { RunnableStage } from "@/app/api/brands/[id]/videos/[videoId]/run/[stage]/route";

/** What the last link runs. Not a `RunnableStage` — see the file header. */
export type StageRun = RunnableStage | "film";

export interface StageButton {
  run: StageRun;
  label: string;
  enabled: boolean;
  /** Why not, in the user's words. Null when enabled. */
  reason: string | null;
}

export interface StageAdvanceButton extends StageButton {
  /** The drawer to open before running. */
  to: PipelineStageId;
}

export interface StageActions {
  own: StageButton | null;
  advance: StageAdvanceButton | null;
}

const OWN: Partial<Record<PipelineStageId, { run: RunnableStage; label: string }>> = {
  input: { run: "extract", label: "入力・抽出を実行" },
};

const ADVANCE: Partial<
  Record<PipelineStageId, { to: PipelineStageId; run: StageRun; label: string }>
> = {
  input: { to: "structure", run: "structure", label: "構造化して反映する" },
  structure: { to: "map", run: "map", label: "動画へ反映する" },
  map: { to: "output", run: "film", label: "動画にする" },
};

export function stageActions(input: {
  stageId: PipelineStageId;
  /** Every stage's freshness. Both buttons are decided from it. */
  stages: PipelineStage[];
  /** Whether anything has been pinned to read. Only the reading steps care. */
  hasMaterial: boolean;
  /**
   * What the film step would do, from `pendingFilmSteps`.
   *
   * Null for a template with no fixing step (product-cm, event-promo): the chain
   * ends at the mapping, so that drawer offers nothing rather than a button that
   * would call nothing. An empty array means the played film already says
   * everything the workbench holds.
   */
  filmSteps: FilmStep[] | null;
}): StageActions {
  const here = input.stages.find((stage) => stage.id === input.stageId);
  const own = OWN[input.stageId];
  const declared = ADVANCE[input.stageId];
  const advance = declared?.run === "film" && input.filmSteps === null ? undefined : declared;

  return {
    own: own
      ? {
          ...own,
          // Nothing new to read: the last run already covers everything supplied.
          enabled: input.hasMaterial && here?.status !== "ready",
          reason: !input.hasMaterial
            ? "先に資料かテキストを追加してください"
            : here?.status === "ready"
              ? "すべて読み取り済みです"
              : null,
        }
      : null,
    advance: advance ? advanceButton(advance, here, input) : null,
  };
}

function advanceButton(
  advance: { to: PipelineStageId; run: StageRun; label: string },
  here: PipelineStage | undefined,
  input: { stages: PipelineStage[]; hasMaterial: boolean; filmSteps: FilmStep[] | null },
): StageAdvanceButton {
  const next = input.stages.find((stage) => stage.id === advance.to);
  const film = advance.run === "film";
  const steps = input.filmSteps ?? [];

  // "Already current" is a different question for the film.
  //
  // A stage is current when its run is newer than its input. A film can be fixed
  // and still owe work: a recording the narration has outrun is not a stale
  // stage, it is a step nobody has taken. So the film asks the steps.
  const done = film ? steps.length === 0 : next?.status === "ready";
  // The step consumes this stage's output, so a stale stage blocks it — fixing a
  // film whose facts have not been applied fixes the wrong film.
  const waiting = here?.status !== "ready";
  // Material gates the reading steps only. The film half runs on the brief,
  // which every take has from its first second.
  const needsMaterial = !film && !input.hasMaterial;

  return {
    to: advance.to,
    run: advance.run,
    // Says the things it would do, in the words the rest of the page uses for
    // them. One fixed label would be wrong whenever only one step is left.
    label:
      film && steps.length > 0
        ? steps.map((step) => FILM_STEP_LABEL[step]).join("・")
        : advance.label,
    enabled: !needsMaterial && !waiting && !done,
    reason: needsMaterial
      ? "先に資料かテキストを追加してください"
      : done
        ? film
          ? "動画プレビューに反映済みです"
          : `${advance.label}は反映済みです`
        : waiting
          ? `${here?.label ?? "前の段"}が最新になると実行できます`
          : null,
  };
}

/**
 * What the one button can still do — the reading half of the chain.
 *
 * Lived inside BrandVideoDetail until 2026-08-25, which put a second authority
 * on "what is runnable" outside the file the README names as the canonical one.
 * It moved here the day its answer was wrong and there was no test to catch it.
 *
 * The map stage has a seeded brief from the moment a Take is created, so its raw
 * status can look ready while it is still waiting for structure to finish. That
 * dependency is counted here, because the number has to match what the button
 * will actually run rather than what the seeded brief happens to contain.
 */
export function pendingReadStages(
  stages: readonly PipelineStage[],
  sourceCount: number,
): RunnableStage[] {
  // Nothing to read is not the same as nothing to do. Returning [] here is
  // correct — the caller must not read it as "re-run everything".
  if (sourceCount === 0) return [];

  const input = stages.find((stage) => stage.id === "input");
  const structure = stages.find((stage) => stage.id === "structure");
  const map = stages.find((stage) => stage.id === "map");
  if (!input || !structure || !map) return [];

  const pending: RunnableStage[] = [];
  const inputPending = input.status !== "ready";
  const structurePending = inputPending || structure.status !== "ready";
  const mapPending = structurePending || map.status !== "ready";

  if (inputPending) pending.push("extract");
  if (structurePending) pending.push("structure");
  if (mapPending) pending.push("map");
  return pending;
}

/**
 * Everything the one button will run, given documents and outstanding film work.
 *
 * **The bug this exists to prevent.** The button was disabled whenever there
 * were no documents, and `runAll` treated an empty read-list as "nothing is
 * pending, so do it all again" — including the reading it had just been told it
 * could not do. A take seeded and then given a voice therefore showed 「未処理
 * 2件」 on a button that refused to be pressed, with the reason only in a
 * `title` on a disabled element, where browsers do not show it.
 *
 * The rule that was already written down and not applied here: **資料の有無が
 * 門になるのは読み取り側だけ.** A seeded take has a brief, so the film half —
 * narration, voice, bake — can always run. Which is also the whole point of
 * the badge: it counts work, and work that cannot be started is not work.
 */
export function bulkRunPlan(input: {
  stages: readonly PipelineStage[];
  sourceCount: number;
  /** Outstanding film work, from `pendingFilmSteps`. */
  filmStepCount: number;
}): { read: RunnableStage[]; redo: boolean } {
  const canRead = input.sourceCount > 0;
  const pending = pendingReadStages(input.stages, input.sourceCount);

  // "Asked with nothing outstanding" — re-read, re-write, re-record. Only
  // meaningful where there is something to re-read from.
  const redo = pending.length === 0 && input.filmStepCount === 0;
  const read = !canRead ? [] : pending.length > 0 ? pending : ALL_READ_STAGES;

  // No `runnable` flag: the film half can always run from a seeded brief, so
  // the answer would be a constant `true`. A field that cannot be false is a
  // gate somebody will later believe in.
  return { read, redo };
}

const ALL_READ_STAGES: RunnableStage[] = ["extract", "structure", "map"];
