"use client";

// The brand's LPs: every landing page made from this kit, newest first, and
// the button that makes another.
//
// Making one takes no input. The page is drawn from the kit as it stands, and
// each one keeps the kit it was drawn from — so the list is also the record
// of how the kit's pages have changed as the kit was filled in.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import type { LpSummary } from "@/app/api/brands/[id]/lps/route";
import CreateLpButton from "@/components/lp/CreateLpButton";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });

export default function LpPortal({ brandId }: { brandId: string }) {
  const [lps, setLps] = useState<LpSummary[] | null>(null);
  const [brandName, setBrandName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/brands/${brandId}/lps`);
      const json = (await res.json().catch(() => null)) as
        | { brand?: { name: string }; lps?: LpSummary[]; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? "LPを取得できませんでした");
      setLps(json?.lps ?? []);
      setBrandName(json?.brand?.name ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "LPを取得できませんでした");
      setLps([]);
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
    <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">WORKS / LPS</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
            {brandName ? `${brandName} の LPs` : "LPs"}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-ink-muted">
            キットの色・書体・形・ロゴで組んだランディングページです。入力は要りません。キットに無かった内容は印が付き、キットに足すものの一覧になります。
          </p>
        </div>
        <CreateLpButton brandId={brandId} label="＋ LPを作る" />
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">{error}</p>
      ) : null}

      {lps === null ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : lps.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-sm text-ink-muted">
          まだLPがありません。「＋ LPを作る」を押すと、このブランドのキットから1ページのLPを作ります（30秒ほど）。
        </p>
      ) : (
        <ul className="space-y-3">
          {lps.map((lp) => (
            <li key={lp.id}>
              <Link
                href={`/brands/${brandId}/works/lp/${lp.id}`}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline px-5 py-4 transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{lp.headline || lp.title}</span>
                  <span className="mt-1.5 block text-[11px] text-ink-muted">
                    {stamp(lp.createdAt)}
                    {lp.gaps > 0 ? ` ・ キットに無い節 ${lp.gaps}` : " ・ すべてキットから"}
                  </span>
                </span>
                <span className="text-xs text-accent">開く →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
