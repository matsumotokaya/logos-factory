"use client";

// Assets — the folder's own page: what the brand IS, in three kinds.
//
// A folder row in the tree opens a list of what is inside it, the way a
// folder does. Here that list is the three kinds (Logos / Materials /
// Guidelines), each with its count and a glimpse of its first items, because
// a reader arriving at 「Assets」 wants to know which door to open next.

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOverview } from "@/app/api/brands/[id]/overview/route";
import type { LogoSummary } from "@/app/api/brands/[id]/logos/route";
import FolderIndex, { type FolderEntry } from "@/components/management/FolderIndex";

export default function AssetsIndex({ brandId }: { brandId: string }) {
  const [overview, setOverview] = useState<BrandOverview | null>(null);
  const [logos, setLogos] = useState<LogoSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overviewRes, logoRes] = await Promise.all([
        authedFetch(`/api/brands/${brandId}/overview`),
        authedFetch(`/api/brands/${brandId}/logos`),
      ]);
      const overviewJson = overviewRes.ok
        ? ((await overviewRes.json()) as { overview?: BrandOverview })
        : null;
      if (!overviewJson?.overview) throw new Error("ブランドを取得できませんでした");
      setOverview(overviewJson.overview);
      const logoJson = logoRes.ok ? ((await logoRes.json()) as { logos?: LogoSummary[] }) : null;
      setLogos((logoJson?.logos ?? []).filter((logo) => logo.subjectEntityId === brandId));
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

  const base = `/brands/${brandId}/assets`;
  const files = overview?.files ?? [];
  const entries: FolderEntry[] = [
    {
      key: "logos",
      label: "Logos",
      href: `${base}/logos`,
      count: logos.length,
      description: "マークの正本と、そのプレゼンテーション。動画の冒頭と締め、LPのヘッダーに出ます",
      thumbs: logos.slice(0, 4).map((logo) => ({ id: logo.id, url: logo.previewUrl, label: logo.title, contain: true })),
      emptyNote: "まだロゴがありません。サイトから取り込むか、トップからSVGをアップロードします",
    },
    {
      key: "materials",
      label: "Materials",
      href: `${base}/materials`,
      count: files.length,
      description: "キービジュアル・写真・画面・地紋・資料。キットと作品がここから引きます",
      thumbs: files.slice(0, 4).map((file) => ({ id: file.id, url: file.url, label: file.label })),
      emptyNote: "まだ素材がありません。サイトを読み取ると画面と画像が入ります",
    },
    {
      key: "guidelines",
      label: "Guidelines",
      href: `${base}/guidelines`,
      count: 0,
      description: "余白・最小サイズ・禁止・声の規則。brand.md と SKILL.md の源になります",
      thumbs: [],
      emptyNote: "準備中。いまはキットの brand.md が使い方を言います",
    },
  ];

  return (
    <FolderIndex
      eyebrow="ASSETS"
      title={overview ? `${overview.name} の Assets` : "Assets"}
      lead="このブランドが何かを決めるもの。動画・LP・バナーはすべてここから作られます。"
      backHref={`/brands/${brandId}`}
      backLabel="← ブランドキット"
      error={error}
      loading={overview === null && error === null}
      entries={entries}
    />
  );
}
