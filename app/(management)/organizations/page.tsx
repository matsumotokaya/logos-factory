import type { Metadata } from "next";
import Link from "next/link";
import WorkspaceList from "./WorkspaceList";

export const metadata: Metadata = {
  title: "ワークスペース",
  robots: { index: false, follow: false },
};

export default function OrganizationsPage() {
  return (
    <main className="w-full px-6 py-10 md:px-10">
      <p className="text-xs text-ink-muted">WORKSPACES</p>
      <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
        ワークスペース
      </h1>
      <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-ink-muted">
        ワークスペースはひとつの世界です。ブランド・成果物・メンバーはその中で完結し、
        またぐことはありません。別の世界の作業をするときは、ここで切り替えます。
      </p>

      <div className="mt-8">
        <WorkspaceList />
      </div>

      <p className="mt-8 text-pretty text-xs text-ink-faint">
        メンバーの招待と権限は <Link href="/brand" className="underline underline-offset-2 hover:text-ink">ワークスペース設定</Link> で行います。
      </p>
    </main>
  );
}
