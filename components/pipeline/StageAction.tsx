"use client";

// What a stage lets you do: its own work, and the step into the next stage.
//
// The API still keeps each stage separate so every result is traceable. The
// input-stage shortcut may chain structure -> map in the page, because a user
// asking to structure new material expects the storyboard to update as well.
//
// **What can be pressed, and what is said when it cannot, is decided in
// [lib/pipeline/stage-actions.ts](../../lib/pipeline/stage-actions.ts)** (tested
// there). This file only draws it. The decision left this component because one
// of its rules was wrong in a way no screenshot shows: "no material yet"
// disabled every button, including the film step, which does not read material.
//
// Running everything at once still belongs outside the flow, as a single
// control over the whole pipeline (the "動画を作り直す" button).

import { stageActions, type StageRun } from "@/lib/pipeline/stage-actions";
import type { FilmStep } from "@/lib/templates/event-cm/bake";
import type { PipelineStage, PipelineStageId } from "@/lib/pipeline/stages";
import type { RunnableStage } from "@/app/api/brands/[id]/videos/[videoId]/run/[stage]/route";

export default function StageAction({
  stageId,
  stages,
  busy,
  disabled,
  part = "both",
  onRun,
  onRunFilm,
  filmSteps,
  onOpenStage,
  onRewriteNarration,
}: {
  stageId: PipelineStageId;
  /**
   * Which of the two buttons to draw here.
   *
   * A button belongs directly under the thing it acts on. 「入力・抽出を実行」
   * reads the list of documents, so it sits under that list; 「構造化して反映
   * する」 consumes what the reading produced, so it sits under those results.
   * Both at the bottom of the drawer made the reading button look like a second
   * opinion about the extract results above it.
   */
  part?: "own" | "advance" | "both";
  /** Every stage's freshness — what decides whether either button has work. */
  stages: PipelineStage[];
  busy: boolean;
  /** No material pinned yet. Gates the reading steps, never the film step. */
  disabled: boolean;
  onRun: (stage: RunnableStage) => void;
  /**
   * Run the film half of the chain: narration → reading aloud → fix.
   *
   * Absent for templates with no fixing step, which is
   * what takes the mapping stage's button away — nothing follows the mapping
   * there.
   */
  onRunFilm?: () => void;
  /**
   * What that step would actually do, from `pendingFilmSteps`.
   *
   * Passed in rather than computed here so this button, the badge on the one
   * button and the notice under the player are three phrasings of ONE answer
   * (§9.7).
   */
  filmSteps?: FilmStep[];
  /** Open another stage's drawer. The advance button uses it before running,
   *  so the progress appears where the work is happening. */
  onOpenStage: (stage: PipelineStageId) => void;
  /**
   * Rewrite the narration without re-reading anything.
   *
   * Offered on the structuring stage because that is where the words are
   * decided. Applying facts already rewrites the narration; this is for wanting a
   * different take on the same facts, which is the commonest reason to touch a
   * narration at all.
   */
  onRewriteNarration?: () => void;
}) {
  const decided = stageActions({
    stageId,
    stages,
    hasMaterial: !disabled,
    filmSteps: onRunFilm ? (filmSteps ?? []) : null,
  });
  const own = part === "advance" ? null : decided.own;
  const advance = part === "own" ? null : decided.advance;
  if (!own && !advance) return null;

  const run = (step: StageRun) => {
    if (step === "film") onRunFilm?.();
    else onRun(step);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {stageId === "structure" && onRewriteNarration && part !== "own" ? (
        <button
          type="button"
          onClick={onRewriteNarration}
          disabled={busy}
          className="mr-auto text-xs text-accent hover:underline disabled:opacity-50"
        >
          ナレーションだけ書き直す
        </button>
      ) : null}

      {own ? (
        <>
          {own.reason ? (
            <span className="text-[11px] text-ink-faint">{own.reason}</span>
          ) : null}
          <button
            type="button"
            onClick={() => run(own.run)}
            disabled={busy || !own.enabled}
            className="rounded-full border border-hairline px-5 py-2 text-xs font-semibold transition hover:border-ink disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:border-hairline"
          >
            {busy ? "実行中…" : own.label}
          </button>
        </>
      ) : null}

      {advance ? (
        <>
          {advance.reason ? (
            <span className="text-[11px] text-ink-faint">{advance.reason}</span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              // Open first, then run: the same order the studio uses, so the
              // progress shows up in the stage that is doing the work rather
              // than in the one you just left.
              onOpenStage(advance.to);
              run(advance.run);
            }}
            disabled={busy || !advance.enabled}
            className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:bg-hairline disabled:text-ink-faint"
          >
            {advance.label} →
          </button>
        </>
      ) : null}
    </div>
  );
}
