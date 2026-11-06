"use client";

// A folder's page: the kinds inside it, each as a card with its count, a
// row of thumbnails and the door to its own list. Assets and Works are both
// drawn with this, so the two branches of the tree read the same way.

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FolderThumb = {
  id: string;
  url: string | null;
  label: string;
  /** Fit the whole image (a logo) rather than fill the tile (a photo). */
  contain?: boolean;
};

export type FolderEntry = {
  key: string;
  label: string;
  href: string;
  count: number;
  description: string;
  thumbs: FolderThumb[];
  emptyNote: string;
  /** Something to do from the card, like 「＋ 動画を追加」. */
  action?: ReactNode;
};

export default function FolderIndex({
  eyebrow,
  title,
  lead,
  backHref,
  backLabel,
  error,
  loading,
  entries,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  backHref: string;
  backLabel: string;
  error: string | null;
  loading: boolean;
  entries: FolderEntry[];
}) {
  return (
    <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">{eyebrow}</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-3 text-pretty text-sm text-ink-muted">{lead}</p>
        </div>
        <Link href={backHref} className="text-xs text-ink-muted underline-offset-4 hover:text-ink">
          {backLabel}
        </Link>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-ink-muted">読み込み中…</p> : null}

      <ul className="grid gap-4 md:grid-cols-3">
        {entries.map((entry) => (
          <li key={entry.key} className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-5">
            <Link
              href={entry.href}
              className="flex items-baseline justify-between gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="text-lg font-semibold">{entry.label}</span>
              <span className="tabular-nums text-2xl font-semibold text-ink">{entry.count}</span>
            </Link>
            <p className="text-pretty text-xs leading-relaxed text-ink-muted">{entry.description}</p>
            {entry.thumbs.length > 0 ? (
              <ul className="grid grid-cols-4 gap-1.5">
                {entry.thumbs.map((thumb) => (
                  <li
                    key={thumb.id}
                    className="aspect-square overflow-hidden rounded-lg border border-hairline bg-ink/[0.03]"
                    title={thumb.label}
                  >
                    {thumb.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
                      <img
                        src={thumb.url}
                        alt=""
                        className={cn("size-full", thumb.contain ? "object-contain p-1.5" : "object-cover")}
                        loading="lazy"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-hairline px-3 py-3 text-[11px] text-ink-muted">
                {entry.emptyNote}
              </p>
            )}
            <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-[11px]">
              {entry.action ?? <span />}
              <Link href={entry.href} className="text-accent hover:underline">
                開く →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
