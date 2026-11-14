"use client";

// The contents of each stage of the brand-asset pipeline: what the brand is
// currently made of, what each step turned that into, and what is still
// missing. The missing list is the point — it is the collection task
// (deliverable-architecture §17.8).

import type { GoalField, GoalProgress } from "@/lib/pipeline/stages";

export interface BrandPipelinePayload {
  sources: Array<{ label: string; addedAt: string | null }>;
  extractedFields: string[];
  structuredFields: string[];
  adoptedFields: string[];
  goal: GoalProgress;
}

function FieldList({
  fields,
  empty,
}: {
  fields: string[];
  empty: string;
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-ink-faint">{empty}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {fields.map((field) => (
        <li
          key={field}
          className="rounded border border-hairline px-2 py-0.5 font-mono text-xs text-ink-muted"
        >
          {field}
        </li>
      ))}
    </ul>
  );
}

function GoalList({ fields, tone }: { fields: GoalField[]; tone: "filled" | "missing" }) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        {tone === "missing" ? "不足はありません" : "まだ何も採用されていません"}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {fields.map((field) => (
        <li key={field.path} className="flex items-baseline gap-2 text-sm">
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
      ))}
    </ul>
  );
}

export default function BrandPipelinePanel({
  stageId,
  payload,
}: {
  stageId: string;
  payload: BrandPipelinePayload;
}) {
  // The input stage is the brand's input form (BrandInputForm), drawn by the
  // page that owns the handlers.
  if (stageId === "extract") {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">
          ページから機械的に取り出した値
        </h3>
        <p className="text-sm text-ink-muted">
          LLMは使いません。色・書体・余白をレンダリング済みのページから読み取ります。
        </p>
        <FieldList fields={payload.extractedFields} empty="未抽出です" />
      </section>
    );
  }

  if (stageId === "structure") {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">意味づけされた情報</h3>
        <p className="text-sm text-ink-muted">
          抽出結果をLLMが構造化した項目です。まだ採用されたとは限りません。
        </p>
        <FieldList fields={payload.structuredFields} empty="未構造化です" />
      </section>
    );
  }

  if (stageId === "map") {
    return (
      <>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">
            採用済み({payload.goal.filled.length}項目)
          </h3>
          <GoalList fields={payload.goal.filled} tone="filled" />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">
            不足({payload.goal.missing.length}項目)
          </h3>
          <p className="text-sm text-ink-muted">
            この一覧が、次に取りに行くものです。
          </p>
          <GoalList fields={payload.goal.missing} tone="missing" />
        </section>
      </>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">できあがっているもの</h3>
      <p className="text-sm text-ink-muted">
        必須{payload.goal.missingRequired.length === 0 ? "項目は揃っています" : `項目が${payload.goal.missingRequired.length}件不足しています`}。
        ブランドアセットはこの採用値から組み立てられます。
      </p>
      <GoalList fields={payload.goal.missingRequired} tone="missing" />
    </section>
  );
}
