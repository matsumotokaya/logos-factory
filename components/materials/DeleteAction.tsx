"use client";

import { useState } from "react";

// The bin, and the one question it has to ask first.
//
// docs/asset-normalization.md §9.4. This deletes the file: the row, the bytes,
// and anything that came out of it. There is no undo, because a
// content-addressed object nobody points at cannot be recovered — so the icon
// asks once, in the same two-click shape promotion uses (MaterialInventory's
// PromoteAction). Not a dialog: a modal for every small act teaches people to
// click through modals, and this act is small and local.
//
// Every list that shows a material shows this, so the question reads the same
// everywhere and the answer means the same thing.

export default function DeleteAction({
  name,
  disabled,
  onDelete,
}: {
  /** The file, named in the confirmation so the wrong row is obvious. */
  name: string;
  disabled: boolean;
  onDelete: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        disabled={disabled}
        title="削除"
        aria-label={`${name}を削除`}
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
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px]">
      <span className="text-ink-muted">戻せません</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onDelete();
        }}
        className="font-semibold text-red-700 underline underline-offset-2 disabled:opacity-50"
      >
        削除する
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="text-ink-faint underline underline-offset-2"
      >
        やめる
      </button>
    </span>
  );
}
