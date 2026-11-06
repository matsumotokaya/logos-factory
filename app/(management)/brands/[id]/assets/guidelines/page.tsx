import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guidelines — Assets",
  robots: { index: false, follow: false },
};

// Guidelines — the rules a kit states beyond its measurements: clear space,
// minimum size, forbidden backgrounds, inversion, voice. The branch is in the
// tree so the structure is complete; the content comes with the mark.* and
// voice.* fields (docs/product.md §4-5). Until then the kit's brand.md says
// what little the product can say about use.

export default async function BrandGuidelinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">ASSETS / GUIDELINES</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">Guidelines</h1>
          <p className="mt-3 text-pretty text-sm text-ink-muted">
            ロゴの余白・最小サイズ・禁止・反転、声のトーン。測定値ではなく、ブランドの持ち主が決める規則です。
          </p>
        </div>
        <Link href={`/brands/${id}/assets`} className="text-xs text-ink-muted underline-offset-4 hover:text-ink">
          ← Assets
        </Link>
      </header>
      <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-sm text-ink-muted">
        準備中です。いまは公開したキットの{" "}
        <Link href={`/k/${id}/brand.md`} className="font-mono text-accent hover:underline">
          brand.md
        </Link>{" "}
        の「ロゴ」と「使い方」の節が、使い方の規則を言います。ここに規則を書けるようになると、それが brand.md と
        SKILL.md に流れます。
      </p>
    </main>
  );
}
