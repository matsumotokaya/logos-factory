"use client";

// The brand's logo list. Logos are owned by brand entities that live under
// the same organization as the brand shown here, so the list spans sibling
// brands (e.g. WealthPark Lab sees WealthPark's logos too). The detail page
// is /brands/[id]/logos/[logoId]; the global /logos/[logoId] redirect is in
// place for legacy bookmarks.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { authedFetch } from "@/lib/authed-fetch";
import type { LogoSummary } from "@/app/api/brands/[id]/logos/route";

const VISIBILITY_LABEL: Record<string, string> = {
  draft: "下書き",
  public: "公開",
  unlisted: "限定公開",
};

export default function LogoPortal({ brandId }: { brandId: string }) {
  const [logos, setLogos] = useState<LogoSummary[] | null>(null);
  const [brandName, setBrandName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/brands/${brandId}/logos`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "ロゴを取得できませんでした");
      }
      const json = (await res.json()) as {
        brand: { id: string; name: string };
        logos: LogoSummary[];
      };
      setLogos(json.logos);
      setBrandName(json.brand.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ロゴを取得できませんでした");
      setLogos([]);
    }
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">ASSETS / LOGOS</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
            {brandName ? `${brandName} の Logos` : "Logos"}
          </h1>
          <p className="mt-3 text-pretty text-sm text-ink-muted">
            同じOrganizationに紐づくブランド全体のロゴ一覧です。ロゴをクリックするとロゴプレゼンの編集画面が開きます。
          </p>
        </div>
        <Link
          href={`/brands/${brandId}/assets`}
          className="text-xs text-ink-muted underline-offset-4 hover:text-ink"
        >
          ← Assets
        </Link>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      {logos === null ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : logos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-sm text-ink-muted">
          このブランドのOrganizationにロゴがまだ登録されていません。
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {logos.map((logo) => (
            <li key={logo.id}>
              <LogoCard brandId={brandId} logo={logo} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function LogoCard({ brandId, logo }: { brandId: string; logo: LogoSummary }) {
  return (
    <Link
      href={`/brands/${brandId}/assets/logos/${logo.id}`}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-4 transition",
        "hover:border-ink hover:bg-ink/[0.02]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-ink/[0.04]">
        {logo.previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logo.previewUrl}
            alt={logo.title}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-ink-muted">プレビューなし</span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{logo.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-muted">
            {logo.subjectEntityName}
          </p>
        </div>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-muted">
          {VISIBILITY_LABEL[logo.visibility] ?? logo.visibility}
        </span>
      </div>
    </Link>
  );
}