import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ロゴ管理",
  robots: { index: false, follow: false },
};

export default function LogosIndexPage() {
  return (
    <main className="w-full px-6 py-12 md:px-10">
      <h1 className="text-balance font-display text-3xl font-semibold">ロゴ</h1>
      <p className="mt-4 max-w-2xl text-pretty text-sm text-ink-muted">
        左のOrganizationまたは事業を開き、表示するロゴを選択してください。ロゴのプレゼンテーションとガイドラインを確認できます。
      </p>
    </main>
  );
}
