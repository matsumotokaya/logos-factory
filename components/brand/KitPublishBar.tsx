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
// Publishing opens a dialog that says one thing: where it goes. Pressing it
// publishes what the page shows — the AI's readings included, confirmed by
// the press (owner's decision, 2026-11-14; lib/brand/kit/publish.ts).

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

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
  busy,
  previewing,
  onTogglePreview,
  onPublish,
  onUnpublish,
}: {
  status: KitStatusView | null;
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12px]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="w-24 shrink-0 font-semibold text-ink">ブランドキット</span>
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
                ? "まだ公開していません。公開すると、URLを渡すだけで使えるキットになります"
                : "公開を取り下げています"}
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
            <p className="mt-2 text-[12px] text-ink-muted">
              {state === "stale" ? "公開中のブランドキットを、いまの内容に置き換えます。" : "このブランドキットを公開します。"}
            </p>
            <p className="mt-3 break-all rounded-lg bg-ink/[0.04] px-3 py-2 font-mono text-[12px] text-ink">{url}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-hairline px-4 py-1.5 text-xs font-semibold text-ink-muted hover:border-ink hover:text-ink"
            >
              キャンセル
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
