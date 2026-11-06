"use client";

// The shared skeleton of an asset's text page.
//
// Every leaf in the brand tree has two faces: the thing itself (a logo's
// presentation, a video's player, an LP's preview) and a page of secondary
// facts about it. The facts differ by kind — a video has a length, an LP has a
// template version — but the page does not: a title, a way back to the thing
// itself, and sections of label/value rows. A value that is not known says
// 「—」 rather than disappearing, so "not set" and "no such property" stay
// distinguishable, the same rule BrandAssetSlots follows.

import Link from "next/link";

export interface InfoRow {
  label: string;
  /** null / undefined renders as 「—」. */
  value: string | null | undefined;
  /** When set, the value is a link opening in a new tab. */
  href?: string;
  mono?: boolean;
}

export interface InfoSection {
  title: string;
  rows: InfoRow[];
}

export const formatDateTime = (value: string | null | undefined): string | null =>
  value
    ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : null;

export const formatBytes = (bytes: number): string =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(0, Math.round(bytes / 1_000))} KB`;

export default function InfoPage({
  kindLabel,
  title,
  bodyHref,
  bodyLabel,
  brandId,
  sections,
  error = null,
}: {
  /** 「動画」「LP」— the noun above the title. */
  kindLabel: string;
  title: string;
  /** The thing itself, one level up. */
  bodyHref: string;
  bodyLabel: string;
  brandId: string;
  sections: InfoSection[];
  error?: string | null;
}) {
  return (
    <main className="flex w-full flex-col gap-6 px-6 py-8 md:px-10">
      <nav aria-label="パンくず" className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Link href={`/brands/${brandId}`} className="hover:text-ink">
          ブランドトップ
        </Link>
        <span aria-hidden className="text-ink-faint">/</span>
        <Link href={bodyHref} className="hover:text-ink">
          {title}
        </Link>
        <span aria-hidden className="text-ink-faint">/</span>
        <span className="font-semibold text-ink">詳細</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">{kindLabel}の詳細</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">{title}</h1>
        </div>
        <Link
          href={bodyHref}
          className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {bodyLabel}
        </Link>
      </header>

      {error ? (
        <p role="alert" className="text-pretty text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.title} className="rounded-2xl border border-hairline p-5">
          <h2 className="text-sm font-semibold">{section.title}</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            {section.rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-ink-muted">{row.label}</dt>
                <dd className={row.mono ? "break-all font-mono text-xs" : "break-words"}>
                  {row.value == null || row.value === "" ? (
                    <span className="text-ink-faint">—</span>
                  ) : row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-accent"
                    >
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  );
}
