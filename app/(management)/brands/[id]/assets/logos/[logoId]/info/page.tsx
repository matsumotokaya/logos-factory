"use client";

// The text page about a logo — format, master file, owner, tags, credits,
// trademarks, history. Reached only from the sidebar row menu (「詳細」); the
// row itself opens the presentation one level up. Embeds the canonical
// LogoInfoPage so every edit surface stays in one place.

import { use } from "react";
import Link from "next/link";
import LogoInfoPage from "@/app/brand/logos/[id]/page";

export default function BrandLogoInfoPage({
  params,
}: {
  params: Promise<{ id: string; logoId: string }>;
}) {
  // React.use() resolves the segment params. The page reads them only after
  // they are settled, so the embedded LogoInfoPage receives a stable id.
  const { id, logoId } = use(params);

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-6 pt-6 text-xs text-ink-muted">
        <Link href={`/brands/${id}/logos/${logoId}`} className="hover:text-ink">
          ← プレゼンテーション
        </Link>
        <Link href={`/brands/${id}`} className="hover:text-ink">
          ブランドトップ
        </Link>
      </div>
      <LogoInfoPage params={Promise.resolve({ id: logoId })} embedded />
    </div>
  );
}
