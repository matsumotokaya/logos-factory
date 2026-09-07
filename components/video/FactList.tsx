"use client";

// The facts a video is made of — and where you correct them.
//
// Deliberately the same list that reports each value's origin. A separate edit
// form would mean reading here and typing somewhere else; the row that admits
// "this date is a guess" is the row you fix it in.
//
// The stance the whole screen takes: fill everything in confidently, then be
// honest about which parts were made up. The user reacts — corrects a wrong
// name, switches off a field they do not want — rather than briefing anything.

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ORIGIN_LABELS, type FieldOrigin } from "@/lib/pipeline/stages";
import type { GoalFieldState } from "@/lib/pipeline/stages";
import {
  editableValue,
  factFieldsFor,
  isPhotoSlot,
  isSuppressed,
  photoOf,
  previewOf,
} from "@/lib/event-cm/facts";
import { resolveSrc } from "@/remotion/kit/paint";
import type { BriefSource } from "./BriefSourceIntake";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const ORIGIN_STYLE: Record<FieldOrigin, string> = {
  brand: "border-accent/40 bg-accent/5 text-accent",
  extracted: "border-emerald-300/60 bg-emerald-50 text-emerald-800",
  inferred: "border-amber-300/60 bg-amber-50 text-amber-800",
  user: "border-hairline bg-ink/[0.03] text-ink-muted",
};

/** What the badge says. `inferred` is the one that has to be blunt. */
const ORIGIN_TEXT: Record<FieldOrigin, string> = {
  brand: ORIGIN_LABELS.brand,
  extracted: ORIGIN_LABELS.extracted,
  inferred: "仮に入れた値",
  user: ORIGIN_LABELS.user,
};

export interface FactEdit {
  path: string;
  lines?: string[];
  suppressed?: boolean;
  /** Asset slots are chosen, not typed. `null` clears the slot. */
  src?: string | null;
}

export default function FactList({
  brief,
  goalFields,
  busy,
  onEdit,
  paths,
  imageSources = [],
}: {
  brief: EventCmBrief;
  goalFields: GoalFieldState[];
  busy?: boolean;
  onEdit: (edit: FactEdit) => void;
  /**
   * Show only these fields, in this order. Used by one storyboard panel, whose
   * business is the values that picture shows and no others. Omitted = the whole
   * list, which is what the pipeline's structure stage wants.
   */
  paths?: string[];
  /**
   * The images pinned to this video, as the candidate list for a photo slot.
   *
   * There is no separate table of "candidates": every picture that was uploaded
   * is still here, whether the automatic pass used it or left it alone. So the
   * material list IS the candidate list, and choosing is picking from it.
   */
  imageSources?: BriefSource[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [choosing, setChoosing] = useState<string | null>(null);

  const originOf = new Map(goalFields.map((field) => [field.path, field.origin]));
  const byPath = new Map(factFieldsFor(brief).map((field) => [field.path, field]));
  const fields = paths
    ? paths.flatMap((path) => {
        const field = byPath.get(path);
        return field ? [field] : [];
      })
    : factFieldsFor(brief);

  const startEdit = (path: string) => {
    setDraft(editableValue(brief, path).join("\n"));
    setEditing(path);
  };

  const commit = (path: string) => {
    onEdit({ path, lines: draft.split("\n") });
    setEditing(null);
  };

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {fields.map((field) => {
        const suppressed = isSuppressed(brief, field.path);
        const origin = originOf.get(field.path) ?? null;
        // 「資料から読んだ」 names which one on hover. The label, not the ids:
        // this is for a person, and the ids are for the pin.
        const readFrom = brief.provenance?.[field.path]?.source ?? null;
        const preview = previewOf(brief, field.path);
        const editable = field.input === "text" || field.input === "lines";
        const isEditingThis = editing === field.path;
        const photoSlot = isPhotoSlot(field.path);
        const currentPhoto = photoSlot ? photoOf(brief, field.path) : null;
        const isChoosingThis = choosing === field.path;

        return (
          <li
            key={field.path}
            className={cn(
              "rounded-xl border border-hairline bg-white px-4 py-3",
              suppressed && "opacity-55",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-32 text-[13px] font-medium text-ink">
                {field.label}
              </span>

              {suppressed ? (
                <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold text-ink-faint">
                  表示しない
                </span>
              ) : origin ? (
                <span
                  title={origin === "extracted" && readFrom ? `資料: ${readFrom}` : undefined}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    ORIGIN_STYLE[origin],
                  )}
                >
                  {ORIGIN_TEXT[origin]}
                </span>
              ) : (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    field.required
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-hairline bg-ink/[0.03] text-ink-faint",
                  )}
                >
                  {field.required ? "必須・未取得" : "なし"}
                </span>
              )}

              {!isEditingThis ? (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {/* The picture itself, small. A row that says 「写真あり」 and
                      nothing else cannot answer the only question worth asking
                      here — which photograph. */}
                  {currentPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      // The renderer's rule (remotion/kit/paint.ts): a pool
                      // asset's path is bare (`defaults/…`) and an <img> would
                      // resolve it against this page's URL, not the site root.
                      src={resolveSrc(currentPhoto)}
                      alt=""
                      className="h-9 w-14 shrink-0 rounded border border-hairline object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                    {preview || "—"}
                  </span>
                </span>
              ) : null}

              <span className="ml-auto flex shrink-0 items-center gap-2">
                {photoSlot && !suppressed ? (
                  <button
                    type="button"
                    onClick={() => setChoosing(isChoosingThis ? null : field.path)}
                    disabled={busy}
                    className="text-[11px] text-accent hover:underline disabled:opacity-50"
                  >
                    {isChoosingThis ? "やめる" : currentPhoto ? "差し替え" : "選ぶ"}
                  </button>
                ) : null}
                {editable && !suppressed ? (
                  isEditingThis ? (
                    <>
                      <button
                        type="button"
                        onClick={() => commit(field.path)}
                        disabled={busy}
                        className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-paper disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-[11px] text-ink-faint hover:text-ink"
                      >
                        やめる
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(field.path)}
                      disabled={busy}
                      className="text-[11px] text-accent hover:underline disabled:opacity-50"
                    >
                      直す
                    </button>
                  )
                ) : null}
                <button
                  type="button"
                  onClick={() => onEdit({ path: field.path, suppressed: !suppressed })}
                  disabled={busy}
                  className="text-[11px] text-ink-faint hover:text-ink disabled:opacity-50"
                >
                  {suppressed ? "表示する" : "消す"}
                </button>
              </span>
            </div>

            {isEditingThis ? (
              <div className="mt-3">
                {field.input === "lines" ? (
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={Math.max(2, draft.split("\n").length)}
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-[13px] outline-none focus:border-ink"
                  />
                ) : (
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-[13px] outline-none focus:border-ink"
                  />
                )}
                {field.input === "lines" ? (
                  <p className="mt-1.5 text-[11px] text-ink-faint">1行に1項目</p>
                ) : null}
              </div>
            ) : null}

            {isChoosingThis ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {imageSources.length === 0 ? (
                  <p className="text-[11px] text-ink-faint">
                    入力ステージに画像を追加すると、ここで選べるようになります。
                  </p>
                ) : (
                  <>
                    {imageSources.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          onEdit({ path: field.path, src: `material:${source.id}` });
                          setChoosing(null);
                        }}
                        disabled={busy}
                        className="max-w-56 truncate rounded-full border border-hairline px-3 py-1 text-[11px] hover:border-ink disabled:opacity-50"
                      >
                        {source.label}
                      </button>
                    ))}
                    {currentPhoto ? (
                      <button
                        type="button"
                        onClick={() => {
                          onEdit({ path: field.path, src: null });
                          setChoosing(null);
                        }}
                        disabled={busy}
                        className="rounded-full border border-hairline px-3 py-1 text-[11px] text-ink-faint hover:text-ink disabled:opacity-50"
                      >
                        写真を使わない
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {field.hint && !isEditingThis ? (
              <p className="mt-1.5 text-[11px] text-ink-faint">{field.hint}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
