// Labs index — the R&D constellation, grouped by mode. Server-rendered,
// internal, noindex. The mode split (assurance / exploration / integration)
// is the product's core promise made visible: what never touches the logo
// vs. what interprets it — see labs/README.md.

import type { Metadata } from "next";
import Link from "next/link";
import { LABS, MODE_INFO, MODE_ORDER } from "@/labs/directory";
import { COST_SOURCES } from "@/labs/cost-sources";
import { cn } from "@/lib/cn";
import LabHeader from "@/labs/shared/components/LabHeader";

export const metadata: Metadata = {
  title: "Labs — R&D",
  robots: { index: false, follow: false },
};

export default function LabsIndexPage() {
  return (
    <div className="min-h-screen flex-1 bg-paper text-ink">
      <LabHeader />

      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <CostSection />

        {MODE_ORDER.map((mode) => {
          const labs = LABS.filter((lab) => lab.mode === mode);
          if (labs.length === 0) return null;
          const info = MODE_INFO[mode];
          return (
            <section key={mode} className="mt-10">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {info.label}
                </h2>
                <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              </div>
              <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-ink-muted">
                {info.description}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {labs.map((lab) => (
                  <Link
                    key={lab.slug}
                    href={`/labs/${lab.slug}`}
                    className={cn(
                      "group flex flex-col rounded-xl border bg-white p-6 transition",
                      lab.status === "active"
                        ? "border-hairline hover:border-accent hover:shadow-sm"
                        : "border-dashed border-ink-faint hover:border-ink-muted",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-display text-lg font-semibold tracking-tight">
                        {lab.name}
                      </h3>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px]",
                          lab.status === "active"
                            ? "bg-accent text-white"
                            : "border border-dashed border-ink-faint text-ink-muted",
                        )}
                      >
                        {lab.status === "active" ? "稼働中" : "準備中"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">{lab.titleJa}</p>
                    <p className="mt-3 text-sm leading-relaxed">{lab.tagline}</p>
                    <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                      {lab.layer}
                    </p>
                    <span
                      className={cn(
                        "mt-4 text-xs",
                        lab.status === "active"
                          ? "text-accent"
                          : "text-ink-muted group-hover:text-ink",
                      )}
                    >
                      {lab.status === "active" ? "ラボに入る →" : "計画を見る →"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

// Cost overview — which external APIs cost money, and where. Static for now
// (the seed of a monthly cost dashboard); `metered` sources already log
// per-job cost and will feed the live monthly total later. Data comes from
// the single catalog labs/cost-sources.ts.
function CostSection() {
  const perCall = COST_SOURCES.filter((s) => s.billing === "per-call");
  const infra = COST_SOURCES.filter((s) => s.billing === "infra");
  const meteredCount = COST_SOURCES.filter((s) => s.metered).length;

  return (
    <section className="mb-10 rounded-xl border border-hairline bg-white">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-5 py-3.5">
        <h2 className="font-display text-base font-semibold tracking-tight">コスト</h2>
        <p className="text-[11px] text-ink-muted">
          課金が発生する外部APIの一覧。将来ここを
          <strong className="font-medium text-ink">月次コストダッシュボード</strong>
          にする——現状は静的表示で、ライブ集計(月額合計)は未実装
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12px]">
          <thead>
            <tr className="text-[10px] tracking-wider text-ink-faint uppercase">
              <th className="px-5 py-2 font-medium">API / モデル</th>
              <th className="px-3 py-2 font-medium">提供元</th>
              <th className="px-3 py-2 font-medium">用途</th>
              <th className="px-3 py-2 font-medium">単価</th>
              <th className="px-3 py-2 font-medium">計測</th>
              <th className="px-5 py-2 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {perCall.map((s) => (
              <tr key={s.id} className="border-t border-hairline align-top">
                <td className="px-5 py-2.5">
                  <span className="font-medium text-ink">{s.name}</span>
                  {s.note && (
                    <span className="mt-0.5 block text-[10px] leading-snug text-ink-faint">
                      {s.note}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{s.provider}</td>
                <td className="px-3 py-2.5 text-ink-muted">{s.usedFor}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-ink">
                  {s.unitCost}
                </td>
                <td className="px-3 py-2.5">
                  {s.metered ? (
                    <span
                      className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent"
                      title={s.jobLog}
                    >
                      原価ログ有
                    </span>
                  ) : (
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-faint">
                      未計測
                    </span>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px]",
                      s.status === "active"
                        ? "bg-emerald-500/12 text-emerald-700"
                        : "border border-dashed border-ink-faint text-ink-muted",
                    )}
                  >
                    {s.status === "active" ? "稼働中" : "予定"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-hairline px-5 py-3 text-[11px] text-ink-muted">
        {infra.map((s) => (
          <p key={s.id}>
            <span className="font-medium text-ink">基盤費</span> — {s.name}: {s.unitCost}。{s.note}
          </p>
        ))}
        <p className="text-ink-faint">
          単価「実測」は自社ジョブログ由来、「目安」は各社公表値ベース。
          {meteredCount}/{COST_SOURCES.length} が原価ログ対応済み(Generative Lab の生成は
          <code className="mx-1 rounded bg-ink/5 px-1 font-mono">var/generative-lab/jobs.jsonl</code>
          に全ジョブ記録)。月次ダッシュボードはこれらのログを集計して構築する。
        </p>
      </div>
    </section>
  );
}
