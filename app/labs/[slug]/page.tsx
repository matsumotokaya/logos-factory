// Placeholder pages for planned labs.
// Active labs have their own static routes (app/labs/motion/, app/labs/
// workflow/), which take precedence over this dynamic segment.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LABS, getLab } from "@/labs/directory";
import LabHeader from "@/labs/shared/components/LabHeader";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return LABS.filter((lab) => lab.status === "planned").map((lab) => ({
    slug: lab.slug,
  }));
}

export default async function PlannedLabPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lab = getLab(slug);
  if (!lab || lab.status !== "planned") notFound();

  return (
    <div className="min-h-screen flex-1 bg-paper text-ink">
      <LabHeader current={{ name: lab.name, titleJa: lab.titleJa, mode: lab.mode }} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[11px] tracking-widest text-ink-faint uppercase">
          {lab.titleJa}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-balance">
          {lab.tagline}
        </h2>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{lab.layer}</p>

        <p className="mt-6 text-sm leading-relaxed text-ink-muted">{lab.description}</p>

        <section className="mt-8">
          <h3 className="font-mono text-[11px] tracking-widest text-ink-muted uppercase">
            研究対象
          </h3>
          <ul className="mt-3 space-y-2">
            {lab.scope.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h3 className="font-mono text-[11px] tracking-widest text-ink-muted uppercase">
            計画中のモジュール
          </h3>
          <div className="mt-3 space-y-3">
            {lab.modules.map((m) => (
              <div key={m.title} className="rounded-xl border border-hairline bg-white p-4">
                <p className="text-sm font-medium">{m.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{m.body}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-10 border-t border-hairline pt-6 text-[11px] leading-relaxed text-ink-faint">
          このラボはまだ準備中。判断基準は全ラボ共通——「動いていてすごい」ではなく、
          ロゴデザインの価値がプレゼンテーションされるかどうか。稼働中のラボは{" "}
          <Link href="/labs/motion" className="underline underline-offset-2 hover:text-ink">
            Motion Lab
          </Link>
          。
        </p>
      </main>
    </div>
  );
}
