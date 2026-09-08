"use client";

// What the extract and structure stages actually produced.
//
// A stage that only reports "succeeded" gives a person no way to judge it.
// These read the last successful run of their own stage, so the drawer for a
// step shows the step's own output — the sources it could read, or the facts
// it worked out — and the decision about whether to carry on is informed.

import { cn } from "@/lib/cn";
import type { TakeRunRecord } from "@/app/api/brands/[id]/videos/[videoId]/runs/route";
import type { PdfChild } from "@/app/api/brands/[id]/videos/[videoId]/materials/route";
import type { MaterialBody } from "@/components/materials/MaterialContents";
import MaterialRow from "@/components/materials/MaterialRow";
import type { BriefSource } from "@/components/video/BriefSourceIntake";

interface ExtractedSourceRow {
  /** The pin it was read from. Older runs recorded rows without it. */
  materialId?: string;
  label: string;
  mediaType: string;
  mode: "text" | "passthrough" | "skipped";
  chars: number;
  note?: string;
}

const MODE_LABEL: Record<ExtractedSourceRow["mode"], string> = {
  text: "読み取り済み",
  passthrough: "構造化で直接読む",
  skipped: "対象外",
};

const MODE_STYLE: Record<ExtractedSourceRow["mode"], string> = {
  text: "border-emerald-200 bg-emerald-50 text-emerald-700",
  passthrough: "border-hairline bg-ink/[0.03] text-ink-muted",
  skipped: "border-hairline bg-ink/[0.03] text-ink-faint",
};

const lastRun = (runs: TakeRunRecord[], stage: string): TakeRunRecord | null =>
  runs.find((run) => run.stage === stage && run.status === "succeeded") ?? null;

const extractRows = (runs: TakeRunRecord[]): ExtractedSourceRow[] =>
  (lastRun(runs, "extract")?.steps as ExtractedSourceRow[] | null) ?? [];

/**
 * The materials the last successful reading read, by id.
 *
 * What splits the input drawer in two: a pin in here has been read and sits
 * under 「抽出した資料」; a pin not in here is still staged under 「追加した資料」.
 * Empty when nothing has run yet, so everything pinned is staged.
 */
export function lastExtractReadIds(runs: TakeRunRecord[]): Set<string> {
  return new Set(
    extractRows(runs)
      .map((row) => row.materialId)
      .filter((id): id is string => typeof id === "string"),
  );
}

/**
 * The documents the reading took in, and the one verb that applies to them.
 *
 * Joined against what is pinned NOW, not read off the run alone. A run is a
 * record; a document removed since it ran is gone from this list at once and
 * does not need the reading re-run to stop being listed — the pipeline says
 * 「外した1件が未反映」 instead, and re-running is how that is cleared.
 *
 * 「外す」 lives here and only here (docs/asset-normalization.md §9.4): a
 * staged document has not been read, so there is nothing of it in the video to
 * take out; a read one has, and removing it withdraws what rested on it.
 */
export function ExtractResults({
  runs,
  sources,
  contents = [],
  busy,
  onRemove,
  onExpand,
}: {
  runs: TakeRunRecord[];
  /** Every document pinned to the video now. Rows appear for these only. */
  sources: readonly BriefSource[];
  /** What came out of the containers among them, keyed to their parent. */
  contents?: readonly PdfChild[];
  busy: boolean;
  onRemove: (materialId: string) => Promise<void>;
  /** Take a PDF apart now — for one that arrived before intake did this. */
  onExpand?: (materialId: string) => Promise<void>;
}) {
  const run = lastRun(runs, "extract");
  const byId = new Map(sources.map((source) => [source.id, source]));
  const rows = extractRows(runs).flatMap((row) => {
    const source = row.materialId ? byId.get(row.materialId) : undefined;
    return source ? [{ ...row, source }] : [];
  });
  const derivedOf = new Map<string, MaterialBody[]>();
  for (const child of contents) {
    const list = derivedOf.get(child.parentId) ?? [];
    list.push({
      id: child.id,
      label: child.label,
      media_type: child.media_type,
      bytes: child.bytes,
      width: child.width,
      height: child.height,
      url: child.url,
      page: child.page,
      pages: child.pages,
      inline: child.inline,
    });
    derivedOf.set(child.parentId, list);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium text-ink">
          抽出した資料
          {rows.length > 0 ? (
            <span className="ml-1.5 font-normal tabular-nums text-ink-faint">{rows.length}</span>
          ) : null}
        </h3>
        <p className="mt-1 text-[11px] text-ink-muted">
          読み取り済みで、構造化が読むもの。▸ を押すと中身が開き、1点ずつダウンロードできます。この動画から外すと、その資料だけに立っていた値は仮の値に戻り、下の工程が要更新になります。
        </p>
      </div>
      {!run ? (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-ink-muted">
          まだ読み取っていません。上に資料を入れて「入力・抽出を実行」を押すと、ここに移ります。
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-ink-muted">
          抽出した資料はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const derived = derivedOf.get(row.source.id) ?? [];
            const isPdf = row.source.media_type === "application/pdf";
            return (
              <MaterialRow
                key={row.source.id}
                data={{
                  id: row.source.id,
                  name: row.source.label,
                  media_type: row.source.media_type,
                  bytes: row.source.bytes,
                  width: row.source.width ?? null,
                  height: row.source.height ?? null,
                  url: row.source.url ?? null,
                }}
                lead={
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      MODE_STYLE[row.mode],
                    )}
                  >
                    {MODE_LABEL[row.mode]}
                  </span>
                }
                trailing={row.mode === "text" ? `${row.chars}字` : noteOf(row.note)}
                derived={derived}
                actions={
                  /* A bin rather than the word 「外す」, which was our
                     vocabulary and nobody else's (2026-09-08). The accessible
                     name stays exact, because this unpins the document from
                     this video and does not delete the file. */
                  <button
                    type="button"
                    onClick={() => void onRemove(row.source.id)}
                    disabled={busy}
                    title="この動画から外す"
                    aria-label={`${row.source.label}をこの動画から外す`}
                    className="shrink-0 rounded p-1 text-ink-faint transition hover:text-red-700 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                      <path
                        d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9h5.8l.6-9M9 8.5v4M11 8.5v4"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                }
                footer={
                  // Only a PDF has contents to go looking for. One with none is
                  // either older than this feature or genuinely made of text
                  // and vectors, and pressing it says which.
                  isPdf && derived.length === 0 && onExpand ? (
                    <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                      <span className="min-w-0 flex-1">
                        中身はまだ取り出していません。この機能より前に入れた資料か、画像を持たないPDFです。
                      </span>
                      <button
                        type="button"
                        onClick={() => void onExpand(row.source.id)}
                        disabled={busy}
                        className="shrink-0 rounded-full border border-hairline bg-paper px-3 py-1 text-[11px] font-semibold hover:border-ink disabled:opacity-50"
                      >
                        中身を取り出す
                      </button>
                    </div>
                  ) : null
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * A note worth printing beside the reading's verdict.
 *
 * 「読み取り対象ではありません」 was the 「対象外」 chip said twice, and runs
 * recorded before 2026-09-08 still carry it, so it is dropped on the way to the
 * screen as well as at the source (lib/event-cm/extract.ts).
 */
const REDUNDANT_NOTE = "読み取り対象ではありません";
const noteOf = (note: string | undefined): string =>
  !note || note === REDUNDANT_NOTE ? "" : note;

/** Facts the structuring run read out of the material. `null` = not stated. */
type Facts = Record<string, unknown> & { note?: string | null };

const FACT_LABEL: Record<string, string> = {
  title: "イベント名",
  subtitle: "サブタイトル",
  seriesLabel: "シリーズ・回次",
  presenter: "主催",
  valueLines: "訴求",
  valueChip: "訴求の一言",
  programs: "プログラム",
  guests: "登壇者",
  date: "開催日",
  weekday: "曜日",
  time: "開始時刻",
  venue: "会場",
  fee: "参加費",
  cta: "行動喚起",
  footnote: "注記",
};

const preview = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === "object" && "name" in item
          ? String((item as { name: unknown }).name)
          : String(item),
      )
      .join("、");
  }
  return String(value);
};

export function StructureResults({ runs }: { runs: TakeRunRecord[] }) {
  const run = lastRun(runs, "structure");
  const steps = run?.steps as { facts?: Facts; read?: string[] } | null;
  const facts = steps?.facts;

  if (!facts) {
    return (
      <p className="text-[12px] text-ink-muted">
        まだ構造化していません。資料を読み取ってから実行してください。
      </p>
    );
  }

  const found = Object.entries(facts).filter(
    ([key, value]) => key !== "note" && value !== null && value !== undefined,
  );
  const missing = Object.entries(facts).filter(
    ([key, value]) => key !== "note" && (value === null || value === undefined),
  );

  return (
    <div className="flex flex-col gap-4">
      {steps?.read?.length ? (
        <p className="text-[11px] text-ink-faint">読んだ資料: {steps.read.join("、")}</p>
      ) : null}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          資料に書かれていたこと（{found.length}件）
        </h4>
        <ul className="mt-2 flex flex-col gap-1">
          {found.map(([key, value]) => (
            <li key={key} className="flex gap-3 text-[13px]">
              <span className="w-28 shrink-0 text-ink-muted">
                {FACT_LABEL[key] ?? key}
              </span>
              <span className="min-w-0 flex-1 text-ink">{preview(value)}</span>
            </li>
          ))}
        </ul>
      </div>
      {missing.length > 0 ? (
        <p className="text-[11px] text-ink-faint">
          資料に無かった項目（{missing.length}件）:{" "}
          {missing.map(([key]) => FACT_LABEL[key] ?? key).join("、")}
          。これらは仮の値のまま残ります。
        </p>
      ) : null}
      {facts.note ? (
        <p className="rounded-xl border border-hairline bg-ink/[0.03] px-3 py-2 text-[12px] text-ink-muted">
          読み取りメモ: {facts.note}
        </p>
      ) : null}
    </div>
  );
}
