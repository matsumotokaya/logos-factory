import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ブランド管理",
  robots: { index: false, follow: false },
};

export default function BrandsIndexPage() {
  return (
    <main className="w-full px-6 py-10 md:px-10">
      <p className="text-xs text-ink-muted">BRANDS</p>
      <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
        ブランド管理
      </h1>
      <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-ink-muted">
        左の一覧からOrganization、企業ブランド、事業ブランド、各アセットを選択できます。
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-hairline p-6">
          <h2 className="text-balance text-lg font-semibold">
            登録済みブランドを開く
          </h2>
          <p className="mt-2 text-pretty text-sm text-ink-muted">
            左のOrganizationを開き、管理するブランドを選択してください。
          </p>
        </section>
        <section className="rounded-2xl border border-hairline p-6">
          <h2 className="text-balance text-lg font-semibold">新しく登録する</h2>
          <p className="mt-2 text-pretty text-sm text-ink-muted">
            URLや資料からOrganizationとブランドを登録し、LPを生成できます。
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            新しいブランド
          </Link>
        </section>
      </div>
    </main>
  );
}
