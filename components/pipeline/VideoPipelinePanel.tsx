"use client";

// One video-pipeline stage, opened over the video page.
//
// The work happens HERE, not on the page behind it. This drawer used to be
// read-only, on the reasoning that actions belong to the surfaces that own
// them — but that split the pipeline in half: the bar said what a stage was
// waiting on and the user had to go somewhere else to give it. Slide-factory
// puts the form, the upload, the source list and the run button inside the
// stage itself, and the deliverable stays visible behind the drawer the whole
// time. Same here.
//
// The page still owns fetching and running; what each stage renders is passed
// in, so this component knows about stages and nothing about endpoints.

import type { ReactNode } from "react";
import type { GoalField, GoalProgress, PipelineStageId } from "@/lib/pipeline/stages";
import TakeRunLog from "./TakeRunLog";
import type { TakeRunRecord } from "@/app/api/brands/[id]/videos/[videoId]/runs/route";

function StatusBadge({ status }: { status: "empty" | "ready" | "stale" }) {
  const map = {
    empty: { dot: "bg-hairline", label: "未実行", text: "text-ink-muted" },
    ready: { dot: "bg-emerald-500", label: "最新", text: "text-emerald-700" },
    stale: { dot: "bg-amber-500", label: "要更新", text: "text-amber-700" },
  } as const;
  const tone = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
      <span className={`size-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

function FieldRow({
  field,
  tone,
}: {
  field: GoalField;
  tone: "filled" | "missing";
}) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span
        aria-hidden="true"
        className={
          tone === "filled"
            ? "size-1.5 rounded-full bg-emerald-500"
            : "size-1.5 rounded-full bg-amber-500"
        }
      />
      <span className="text-ink">{field.label}</span>
      {field.required && (
        <span className="rounded bg-ink/5 px-1.5 text-[10px] text-ink-muted">
          必須
        </span>
      )}
      <span className="ml-auto font-mono text-[11px] text-ink-faint">
        {field.path}
      </span>
    </li>
  );
}

export interface VideoPipelinePayload {
  stages: Array<{
    id: PipelineStageId;
    label: string;
    status: "empty" | "ready" | "stale";
    summary: string;
    producedAt: string | null;
  }>;
  goal: GoalProgress;
}

// What to do here, in the second person, and nothing else.
//
// These lines used to describe the machinery — which part parses text, what
// gets carried to the model, where meaning is decided. True, and no help at
// all: somebody opening a drawer wants to know what to give it and what will
// happen to the video, not how the stage is implemented.
const STAGE_DESCRIPTION: Record<PipelineStageId, string> = {
  input:
    "イベントの告知文やチラシをアップロードすると、動画の内容がその情報に合わせて書き換わります。ロゴや写真などの画像を入れると、動画の中に表示されます。",
  extract: "アップロードした資料を読み取ります。",
  structure:
    "読み取った資料から、イベント名・日時・会場・登壇者などを取り出して動画プレビューに反映します。資料に書かれていないことは埋めません。",
  map: "いま動画が何でできているか。各項目の由来と、まだ埋まっていないものの一覧です。値はここで直せます。",
  output:
    "絵コンテで直した内容が、動画プレビューに反映された時点です。MP4の書き出しはこのあとの別の操作です。",
};

export default function VideoPipelinePanel({
  stageId,
  payload,
  intake,
  extracted,
  structured,
  facts,
  output,
  description,
  ownAction,
  action,
  runs,
}: {
  stageId: PipelineStageId;
  payload: VideoPipelinePayload;
  /** Input stage: the source list and the upload UI. */
  intake?: ReactNode;
  /** Extract stage: what the last read produced. */
  extracted?: ReactNode;
  /** Structure stage: the facts the last reading worked out. */
  structured?: ReactNode;
  /** Map stage: the editable fact list. */
  facts?: ReactNode;
  /**
   * Last stage: what this template's chain ends with.
   *
   * Supplied by templates whose last step is the film rather than the file
   * (event-cm). Absent, the drawer keeps talking about the MP4, which is still
   * the truth for the templates that have no fixing step.
   */
  output?: ReactNode;
  /** Overrides the built-in description for this stage, for the same reason. */
  description?: string;
  /**
   * The work this stage does in place, drawn directly under what it acts on.
   *
   * 「入力・抽出を実行」 reads the documents listed above it. It used to sit at
   * the very bottom of the drawer, under the extract results, where it read as
   * an action on those results rather than the thing that produced them.
   */
  ownAction?: ReactNode;
  /**
   * The step OUT of this stage, always last: it consumes everything above it.
   */
  action?: ReactNode;
  /** Shown at the bottom of every stage, as in slide-factory. */
  runs?: TakeRunRecord[];
}) {
  const stage = payload.stages.find((item) => item.id === stageId);
  const filled = payload.goal.filled;
  const missing = payload.goal.missing;
  const missingRequired = payload.goal.missingRequired;

  return (
    <div className="flex flex-col gap-6">
      {stage ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-ink">{stage.label} の状態</h3>
            <StatusBadge status={stage.status} />
          </div>
          <p className="text-sm text-ink-muted">{stage.summary}</p>
          <p className="text-xs text-ink-faint">
            {description ?? STAGE_DESCRIPTION[stage.id]}
          </p>
          {stage.producedAt ? (
            <p className="font-mono text-[11px] text-ink-faint">
              最終更新: {new Date(stage.producedAt).toLocaleString("ja-JP")}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-ink-faint">まだ更新されていません</p>
          )}
        </section>
      ) : null}

      {/* The input UI belongs to the input stage and nowhere else. Putting a
          file picker inside 構造化 asked the user to supply material at a step
          that consumes it.

          Input and extraction are one stage, and the drawer reads top to bottom
          in the order the work happens: what was supplied → read it → what the
          reading produced → carry it into the video. Each button sits under the
          thing it acts on rather than both being collected at the foot. */}
      {stageId === "input" && intake ? (
        <section className="flex flex-col gap-4 border-t border-hairline pt-5">
          {intake}
          {ownAction ? <div className="flex justify-end">{ownAction}</div> : null}
        </section>
      ) : null}

      {stageId === "input" && extracted ? (
        <section className="border-t border-hairline pt-5">{extracted}</section>
      ) : null}

      {stageId === "map" && facts ? (
        <section className="border-t border-hairline pt-5">{facts}</section>
      ) : null}

      {stageId === "structure" ? (
        <section className="flex flex-col gap-3 border-t border-hairline pt-5">
          {structured}
          <div>
            <h3 className="text-sm font-medium text-ink">
              採用済み ({filled.length}項目)
            </h3>
            {filled.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {filled.map((field) => (
                  <FieldRow key={field.path} field={field} tone="filled" />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-faint">
                まだ何も採用されていません
              </p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink">
              不足 ({missing.length}項目)
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              この一覧が、次に取りに行くものです。
            </p>
            {missing.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {missing.map((field) => (
                  <FieldRow key={field.path} field={field} tone="missing" />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-faint">不足はありません</p>
            )}
          </div>
        </section>
      ) : null}

      {stageId === "output" && output ? (
        <section className="border-t border-hairline pt-5">{output}</section>
      ) : stageId === "output" ? (
        <section className="flex flex-col gap-2 border-t border-hairline pt-5">
          <h3 className="text-sm font-medium text-ink">MP4を作る</h3>
          <p className="text-sm text-ink-muted">
            レンダー操作はこのドロワーの外(ページ本体の「MP4を作成」ボタン)から行います。
            ここを開いている間は、書き出しの進行はそのままで確認できます。
          </p>
          {missingRequired.length > 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              必須項目が{missingRequired.length}件不足しています。
              {missingRequired.map((field) => field.label).join("、")}
              を先に確定してください。
            </p>
          ) : null}
        </section>
      ) : null}

      {action ? (
        <div className="flex justify-end border-t border-hairline pt-5">{action}</div>
      ) : null}

      {runs ? <TakeRunLog runs={runs} /> : null}
    </div>
  );
}