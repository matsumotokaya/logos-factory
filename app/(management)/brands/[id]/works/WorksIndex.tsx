"use client";

// Works — what was made from the kit, by kind.
//
// The factory's side of the brand (docs/product.md §2): what the kit was put
// to work on, and so the check on it. One card per kind of deliverable, in the
// order the catalog's families come; a kind the product cannot make yet is
// still listed, saying so, because the shape of the folder is the promise.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOverview } from "@/app/api/brands/[id]/overview/route";
import FolderIndex, { type FolderEntry } from "@/components/management/FolderIndex";
import { VIDEO_STATE_LABEL, type VideoSummary } from "@/lib/video/asset";
import type { LpSummary } from "@/app/api/brands/[id]/lps/route";
import CreateLpButton from "@/components/lp/CreateLpButton";

export default function WorksIndex({ brandId }: { brandId: string }) {
  const [overview, setOverview] = useState<BrandOverview | null>(null);
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [lps, setLps] = useState<LpSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overviewRes, videoRes, lpRes] = await Promise.all([
        authedFetch(`/api/brands/${brandId}/overview`),
        authedFetch(`/api/brands/${brandId}/videos`),
        authedFetch(`/api/brands/${brandId}/lps`),
      ]);
      const overviewJson = overviewRes.ok
        ? ((await overviewRes.json()) as { overview?: BrandOverview })
        : null;
      if (!overviewJson?.overview) throw new Error("ブランドを取得できませんでした");
      setOverview(overviewJson.overview);
      const videoJson = videoRes.ok ? ((await videoRes.json()) as { videos?: VideoSummary[] }) : null;
      setVideos((videoJson?.videos ?? []).filter((video) => !video.isPlaceholder));
      const lpJson = lpRes.ok ? ((await lpRes.json()) as { lps?: LpSummary[] }) : null;
      setLps(lpJson?.lps ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
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

  const base = `/brands/${brandId}/works`;
  const entries: FolderEntry[] = [
    {
      key: "video",
      label: "Videos",
      href: `${base}/video`,
      count: videos.length,
      description: "イベント紹介動画など。キットの色・書体・ロゴで描かれ、ナレーションに合わせて組み立てます",
      thumbs: [],
      emptyNote: "まだ動画がありません。「＋ 動画を追加」でテンプレートを選びます",
      action: (
        <Link href={`${base}/video`} className="rounded-full border border-ink px-3 py-1 text-[11px] font-semibold text-ink hover:bg-ink hover:text-paper">
          ＋ 動画を追加
        </Link>
      ),
    },
    {
      key: "lp",
      label: "LPs",
      href: `${base}/lp`,
      count: lps.length,
      description: "ランディングページ。入力なしでキットから組み、キットに無かった内容に印を付けます",
      thumbs: [],
      emptyNote:
        lps.length > 0
          ? `最新: ${lps[0].headline || lps[0].title}`
          : "まだLPがありません。「＋ LPを作る」で、このキットから1ページ作ります",
      action: <CreateLpButton brandId={brandId} label="＋ LPを作る" variant="outline" className="px-3 py-1 text-[11px]" />,
    },
    {
      key: "banner",
      label: "Banners",
      href: `${base}/banner`,
      count: 0,
      description: "広告・SNS 用の静止画。サイズ違いを一度に出します",
      thumbs: [],
      emptyNote: "準備中",
    },
  ];

  return (
    <>
      <FolderIndex
        eyebrow="WORKS"
        title={overview ? `${overview.name} の Works` : "Works"}
        lead="このキットから作ったもの。作ってみて足りなかったものが、キットに足す項目になります。"
        backHref={`/brands/${brandId}`}
        backLabel="← ブランドキット"
        error={error}
        loading={overview === null && error === null}
        entries={entries}
      />
      {videos.length > 0 ? (
        <section className="w-full px-6 pb-10 md:px-10">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Videos</h2>
            <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
          </div>
          <ul className="mt-3 space-y-2">
            {videos.map((video) => (
              <li key={video.id}>
                <Link
                  href={`${base}/video/${video.id}`}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline px-5 py-3 transition hover:border-ink"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{video.title}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">
                      {VIDEO_STATE_LABEL[video.state]}
                      {video.published ? " ・ 公開中" : " ・ 未公開"}
                    </span>
                  </span>
                  <span className="text-xs text-accent">開く →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
