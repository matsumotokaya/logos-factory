"use client";

// The kit's publish line: one state word, the public address, and the one
// button that changes the state. The same bar, in the same place and the
// same words, is what every page in the workspace gets (docs/product.md
// §2.1), so the eye learns it once.
//
//   下書き    never published             → 公開する
//   公開中    live and equal to the draft → (nothing to do)
//   更新あり  live but the draft moved on → 更新を公開
//   非公開    was live, taken down        → 公開する
//
// Publishing opens a dialog first, because the kit carries adopted values
// only: what is still 推定 is listed as what will NOT be in it. The warning
// never blocks — the choice is the user's (deliverable-architecture §15.2-4).

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { frameLabel } from "@/lib/brand/capture-frame";
import { isMeasuredClaim } from "@/lib/brand/profile";
import type { KnowledgeClaim, KnowledgeValue } from "@/app/api/brands/[id]/overview/route";

export type KitState = "draft" | "live" | "stale" | "unpublished";

export type KitStatusView = {
  state: KitState;
  urlPath: string;
  publishedAt: string | null;
};

const STATE_LABEL: Record<KitState, string> = {
  draft: "下書き",
  live: "公開中",
  stale: "更新あり",
  unpublished: "非公開",
};

const STATE_DOT: Record<KitState, string> = {
  draft: "bg-hairline",
  live: "bg-emerald-500",
  stale: "bg-accent",
  unpublished: "bg-ink-faint",
};

export function PublishStateBadge({ state }: { state: KitState }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 text-[11px] font-semibold text-ink">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", STATE_DOT[state])} />
      {STATE_LABEL[state]}
    </span>
  );
}

export default function KitPublishBar({
  status,
  values,
  claims,
  busy,
  previewing,
  onTogglePreview,
  onPublish,
  onUnpublish,
}: {
  status: KitStatusView | null;
  values: KnowledgeValue[];
  claims: KnowledgeClaim[];
  busy: boolean;
  previewing: boolean;
  onTogglePreview: () => void;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) dialog.showModal();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);

  if (!status) return null;
  const state = status.state;
  const url =
    typeof window === "undefined" ? status.urlPath : `${window.location.origin}${status.urlPath}`;

  // What the published kit will leave out: every GUESS that no value covers.
  // A measured fact (a footer's social link) goes with the values.
  const adoptedPaths = new Set(values.map((value) => value.fieldPath));
  const pending = claims.filter(
    (claim) =>
      claim.confidence !== "unknown" &&
      !isMeasuredClaim(claim) &&
      !adoptedPaths.has(claim.fieldPath),
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused: the address is still on screen to select.
    }
  };

  const actionLabel = state === "stale" ? "更新を公開" : "公開する";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-2.5 text-[12px]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PublishStateBadge state={state} />
          {state === "live" || state === "stale" ? (
            <span className="flex min-w-0 items-center gap-2 text-ink-muted">
              <a
                href={status.urlPath}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-[11px] text-accent hover:underline"
              >
                {url}
              </a>
              <button
                type="button"
                onClick={() => void copy()}
                className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-muted hover:border-ink hover:text-ink"
              >
                {copied ? "コピーしました" : "URLをコピー"}
              </button>
              {status.publishedAt ? (
                <span className="shrink-0 text-ink-faint">
                  {new Date(status.publishedAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-ink-muted">
              {state === "draft"
                ? "このページはまだ公開されていません。中身を確かめて「公開する」と、URLを渡すだけで使えるブランドキットになります。"
                : "公開を取り下げています。URLは404を返します。"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onTogglePreview}
            aria-pressed={previewing}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
              previewing
                ? "border-ink bg-ink text-paper"
                : "border-hairline text-ink-muted hover:border-ink hover:text-ink",
            )}
          >
            {previewing ? "編集に戻る" : "プレビュー"}
          </button>
          {state === "live" || state === "stale" ? (
            <button
              type="button"
              onClick={() => void onUnpublish()}
              disabled={busy}
              className="rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
            >
              非公開にする
            </button>
          ) : null}
          {state !== "live" ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded-full border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-paper transition hover:bg-paper hover:text-ink disabled:cursor-wait disabled:opacity-50"
            >
              {busy ? "公開しています…" : actionLabel}
            </button>
          ) : null}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setConfirming(false)}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <form
          method="dialog"
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming(false);
            void onPublish();
          }}
        >
          <div>
            <h2 className="text-base font-semibold">{actionLabel}</h2>
            <p className="mt-1 text-[12px] text-ink-muted">
              いまの内容を凍結して {status.urlPath} に出します。あとで下書きが変わっても、公開版はこの版のままです。
            </p>
          </div>
          {pending.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
              <p className="font-semibold">{pending.length}項目が推定のままで、公開版には含まれません</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {pending.map((claim) => (
                  <li key={claim.fieldPath}>{frameLabel(claim.fieldPath)}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-amber-800/80">
                載せたい項目は、閉じてから「推定 → 採用」を押してください。このまま公開もできます。
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-hairline px-4 py-3 text-[12px] text-ink-muted">
              推定のまま残っている項目はありません。
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-hairline px-4 py-1.5 text-xs font-semibold text-ink-muted hover:border-ink hover:text-ink"
            >
              閉じる
            </button>
            <button
              type="submit"
              className="rounded-full border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-paper hover:bg-paper hover:text-ink"
            >
              {actionLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
