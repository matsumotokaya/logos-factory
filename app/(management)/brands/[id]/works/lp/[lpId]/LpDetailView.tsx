"use client";

// One LP in the workspace: the page, and one line above it saying where it
// stands.
//
// The pipeline is not on the page. 「LPを更新」 opens it in a drawer — the kit
// the page was made from, then input to output, top to bottom — the same
// drawer the brand kit opens (components/pipeline/PipelineDrawer.tsx). The
// way to change an LP is to change the kit and make it again, never to type
// over the page; when the kit has moved on, every stage says 要更新.
//
// The structure stage carries the point of the whole thing: which sections
// stood on the kit, which on a reading nobody adopted, and which the frame
// had to make up — each with the one act that closes it.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authedFetch } from "@/lib/authed-fetch";
import { refreshBrandTree } from "@/lib/brand-events";
import { frameLabel } from "@/lib/brand/capture-frame";
import { cn } from "@/lib/cn";
import { getRuns, subscribeRuns } from "@/lib/runs/store";
import type { PipelineStageId } from "@/lib/pipeline/stages";
import type { LpDetail } from "@/app/api/brands/[id]/lps/[lpId]/route";
import CreateLpButton from "@/components/lp/CreateLpButton";
import PipelineDrawer, { UPSTREAM_STAGE } from "@/components/pipeline/PipelineDrawer";
import { LP_SECTION_LABEL, LP_SECTIONS, type LpOrigin } from "@/lib/templates/brand-lp/brief-schema";

const ORIGIN: Record<LpOrigin, { label: string; className: string }> = {
  kit: { label: "キットから", className: "border-hairline text-ink-muted" },
  workspace: { label: "AIの読み取りから", className: "border-amber-300 bg-amber-50 text-amber-800" },
  sample: { label: "仮の内容", className: "border-dashed border-amber-500 bg-amber-50 text-amber-900" },
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });

/** A field's name in the product's words; the brand row's own fields are not in the frame. */
const fieldLabel = (path: string) => (path === "brand.description" ? "説明" : frameLabel(path));

const STAGE_LEAD: Record<PipelineStageId | typeof UPSTREAM_STAGE, string> = {
  upstream: "このLPを作ったときのブランドキットです。キットを直すと、ここが「更新あり」になります。",
  input: "LPの材料になったもの。キットの値と、ヒーローに置いたサイトの画面です。",
  extract: "ブランドのサイトから読み取った、特長とお客様の声です。LPはこの中から3件ずつ使います。",
  structure: "ヒーロー・概要・特長・お客様の声・締めのCTAの5節と、それぞれの事実がどこから来たか。キットに無かったものは、キットに足す項目です。",
  map: "キットの色・書体・形を、ページで使える値に当てはめた結果です。",
  output: "できあがったページです。",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

export default function LpDetailView({ brandId, lpId }: { brandId: string; lpId: string }) {
  const router = useRouter();
  const [lp, setLp] = useState<LpDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [marked, setMarked] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /** The pipeline drawer, and the stage it opens on. */
  const [updating, setUpdating] = useState<{ stage: string | null } | null>(null);

  // A run making this brand's next LP, wherever it was started: its stage
  // lights up on this bar while the card in the corner logs it.
  const activeStage = useSyncExternalStore(
    subscribeRuns,
    () => getRuns().find((run) => run.key === `lp:${brandId}` && run.status === "running")?.stage ?? null,
    () => null,
  );

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/brands/${brandId}/lps/${lpId}`);
      const json = (await res.json().catch(() => null)) as { lp?: LpDetail; error?: string } | null;
      if (!res.ok || !json?.lp) throw new Error(json?.error ?? "LPを取得できませんでした");
      setLp(json.lp);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "LPを取得できませんでした");
    }
  }, [brandId, lpId]);

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

  const adopt = useCallback(
    async (fieldPath: string) => {
      setBusy(fieldPath);
      setError(null);
      try {
        const res = await authedFetch(`/api/brands/${brandId}/knowledge/adopt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldPath }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? "確定できませんでした");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "確定できませんでした");
      } finally {
        setBusy(null);
      }
    },
    [brandId, load],
  );

  const remove = useCallback(async () => {
    if (!window.confirm("このLPを削除しますか？この操作は取り消せません。")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await authedFetch(`/api/brands/${brandId}/lps/${lpId}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "削除できませんでした");
      refreshBrandTree();
      router.push(`/brands/${brandId}/works/lp`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
      setBusy(null);
    }
  }, [brandId, lpId, router]);

  const openInTab = useCallback(() => {
    if (!lp) return;
    const url = URL.createObjectURL(new Blob([lp.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    // The tab has read it by then; a blob left alive is the page held in memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [lp]);

  const listHref = `/brands/${brandId}/works/lp`;
  if (!lp) {
    return (
      <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
        {error ? (
          <>
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">{error}</p>
            <Link href={listHref} className="text-xs text-ink-muted underline-offset-4 hover:text-ink">
              ← LPs
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-muted">読み込み中…</p>
        )}
      </main>
    );
  }

  const gaps = LP_SECTIONS.filter((section) => lp.basis[section].origin !== "kit").length;
  const toggle = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-[11px] font-semibold transition",
      active ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
    );

  const adoptButton = (path: string) =>
    lp.nowInKit.includes(path) ? (
      <span className="shrink-0 text-[11px] text-ink-muted">確定済み</span>
    ) : (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => adopt(path)}
        title="いまキットに確定します（公開するときにも確定されます）"
        className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:border-ink hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        {busy === path ? "確定中…" : "キットに確定"}
      </button>
    );

  const remake = (
    <CreateLpButton brandId={brandId} label={lp.kitChanged ? "いまのキットで作り直す" : "もう一度作る"} />
  );

  function stageBody(stage: string) {
    if (!lp) return null;
    switch (stage) {
      case UPSTREAM_STAGE:
        return (
          <>
            <p className="text-sm text-ink">
              {lp.kitChanged
                ? "このLPを作ったあとで、ブランドキットが変わりました。いまのキットで作り直すと、新しいLPができます（このLPは残ります）。"
                : "ブランドキットは、このLPを作ったときのままです。"}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {lp.kitChanged ? remake : null}
              <Link href={`/brands/${brandId}`} className="text-xs font-semibold text-accent hover:underline">
                ブランドキットを開く →
              </Link>
            </div>
          </>
        );
      case "input":
        return (
          <Section title="使ったもの">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-muted">キットの読み取り</dt>
              <dd>{stamp(lp.kitReadAt)}</dd>
              <dt className="text-ink-muted">キットの値</dt>
              <dd>{lp.input.values}項目</dd>
              <dt className="text-ink-muted">ロゴ</dt>
              <dd>{lp.input.logo ? "あり" : "なし（名前を文字で置いています）"}</dd>
              <dt className="text-ink-muted">サイトの画面</dt>
              <dd>{lp.input.screen ? "ヒーローに置いています" : "なし（ヒーローは文字だけです）"}</dd>
              <dt className="text-ink-muted">サイト</dt>
              <dd className="break-all">{lp.input.website || "—"}</dd>
            </dl>
          </Section>
        );
      case "extract": {
        const features = lp.read?.features ?? [];
        const voices = lp.read?.voices ?? [];
        const pendingFeatures = lp.basis.features.pending.includes("offering.features");
        const pendingVoices = lp.basis.voices.pending.includes("proof.voices");
        return (
          <>
            {!lp.read ? (
              <p className="text-sm text-ink-muted">このLPは、読み取った内容を記録する前に作られました。作り直すと、ここに出ます。</p>
            ) : null}
            <Section title={`特長 ${features.length}件`}>
              {pendingFeatures ? (
                <div className="flex items-center justify-between gap-3 text-[12px] text-amber-900">
                  <span>キットにはまだ確定していません。ブランドキットを公開すると確定します。</span>
                  {adoptButton("offering.features")}
                </div>
              ) : null}
              {features.length > 0 ? (
                <ol className="flex flex-col gap-2.5 text-sm">
                  {features.map((feature, index) => (
                    <li key={`${feature.title}-${index}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)]">
                      <span className="font-mono text-[11px] text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <span className="block font-semibold">{feature.title}</span>
                        {feature.description ? <span className="block text-ink-muted">{feature.description}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : lp.read ? (
                <p className="text-sm text-ink-faint">サイトに見つかりませんでした。LPの特長は仮の内容です。</p>
              ) : null}
            </Section>
            <Section title={`お客様の声 ${voices.length}件`}>
              {pendingVoices ? (
                <div className="flex items-center justify-between gap-3 text-[12px] text-amber-900">
                  <span>キットにはまだ確定していません。ブランドキットを公開すると確定します。</span>
                  {adoptButton("proof.voices")}
                </div>
              ) : null}
              {voices.length > 0 ? (
                <ul className="flex flex-col gap-2.5 text-sm">
                  {voices.map((voice, index) => (
                    <li key={`${voice.quote}-${index}`}>
                      <p>「{voice.quote}」</p>
                      {voice.name || voice.role ? (
                        <p className="text-[12px] text-ink-muted">{[voice.name, voice.role].filter(Boolean).join(" ・ ")}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : lp.read ? (
                <p className="text-sm text-ink-faint">サイトに見つかりませんでした。LPのお客様の声は架空の仮の内容です。</p>
              ) : null}
            </Section>
          </>
        );
      }
      case "structure":
        return (
          <ul className="flex flex-col divide-y divide-hairline rounded-2xl border border-hairline">
            {LP_SECTIONS.map((section) => {
              const basis = lp.basis[section];
              const origin = ORIGIN[basis.origin];
              return (
                <li key={section} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{LP_SECTION_LABEL[section]}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", origin.className)}>
                      {origin.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-pretty text-[12px] leading-relaxed text-ink-muted">{basis.note}</p>
                  {basis.pending.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {basis.pending.map((path) => (
                        <li key={path} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="min-w-0 truncate">{fieldLabel(path)}</span>
                          {adoptButton(path)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        );
      case "map":
        return (
          <>
            <Section title="デザインで補ったこと">
              {lp.designNotes.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {lp.designNotes.map((item) => (
                    <li key={`${item.path}-${item.note}`} className="text-sm">
                      <span className="font-semibold">{fieldLabel(item.path)}</span>
                      <span className="block text-ink-muted">{item.note}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">キットの色・書体・形を、そのまま使っています。</p>
              )}
            </Section>
            <Section title="文章">
              <p className="text-sm text-ink-muted">
                {lp.writer.kind === "model"
                  ? `${lp.writer.model ?? "モデル"} が、構造化の段にある事実だけを材料に書きました。`
                  : (lp.writer.note ?? "枠の文章のままです。")}
              </p>
            </Section>
          </>
        );
      case "output":
        return (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-ink-muted">
              1ページのHTMLです。保存はしておらず、開くたびにブリーフから描いています。公開はまだできません。
            </p>
            <button type="button" onClick={openInTab} className="w-fit text-xs font-semibold text-accent hover:underline">
              新しいタブで開く ↗
            </button>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <main className="w-full flex flex-col gap-5 px-6 py-8 md:px-10">
      {updating ? (
        <PipelineDrawer
          title="LPを更新"
          description="このLPが、何から・どう作られているかです。直したいときはページを書き換えるのではなく、ブランドキットを直して作り直します。"
          lead={
            <section className="flex flex-col gap-3 rounded-2xl border border-hairline px-5 py-4 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("font-semibold", lp.kitChanged ? "text-amber-800" : "text-ink")}>
                    {lp.kitChanged ? "ブランドキットが、このLPを作ったあとで変わっています" : `作成 ${stamp(lp.createdAt)}`}
                  </p>
                  <p className="mt-0.5 text-ink-muted">
                    {lp.kitChanged
                      ? "作り直すと、いまのキットで新しいLPができます。このLPは残るので、前後を見比べられます。"
                      : "ブランドキットは作成時のままです。作り直すと文章だけが書き直されます。"}
                  </p>
                </div>
                {remake}
              </div>
              <p className="text-ink-muted">
                キットを読むところから保存までを順に通します（30秒ほど）。ページを離れても続き、経過は右下に出ます。
                <Link href={`/brands/${brandId}`} className="ml-2 font-semibold text-accent hover:underline">
                  ブランドキットを開く →
                </Link>
              </p>
            </section>
          }
          upstream={lp.pipeline.upstream}
          stages={lp.pipeline.stages}
          activeStage={activeStage}
          initialStage={updating.stage}
          renderStage={(stage) => (
            <>
              <p className="text-pretty text-[12px] text-ink-muted">{STAGE_LEAD[stage as keyof typeof STAGE_LEAD]}</p>
              {stageBody(stage)}
            </>
          )}
          onClose={() => setUpdating(null)}
        />
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">WORKS / LPS</p>
          <h1 className="mt-2 text-balance font-display text-2xl font-semibold">
            {lp.content.hero.headline.replace(/\n/g, "")}
          </h1>
          <p className="mt-2 text-[12px] text-ink-muted">
            {lp.brand.name} ・ 作成 {stamp(lp.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className="text-[11px] text-ink-muted underline-offset-4 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {busy === "delete" ? "削除中…" : "削除"}
          </button>
          <Link href={listHref} className="text-xs text-ink-muted underline-offset-4 hover:text-ink">
            ← LPs
          </Link>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">{error}</p>
      ) : null}

      {/* Where this page stands, and the one way into changing it. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-2.5 text-[12px]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
          <button
            type="button"
            onClick={() => setUpdating({ stage: "structure" })}
            className="flex items-center gap-2 text-left hover:underline"
            title="節ごとの出どころを開く"
          >
            <span className="font-semibold text-ink">出どころ</span>
            <span className={gaps > 0 ? "text-amber-800" : "text-ink-muted"}>
              {lp.pipeline.stages.find((stage) => stage.id === "structure")?.summary}
            </span>
          </button>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-ink">キット</span>
            <span className={lp.kitChanged ? "text-amber-800" : "text-ink-muted"}>
              {lp.kitChanged ? "作成後に更新あり" : "作成時のまま"}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setUpdating({ stage: null })}
          className="shrink-0 rounded-full border border-ink px-4 py-1.5 text-xs font-semibold text-ink transition hover:bg-ink hover:text-paper"
        >
          LPを更新
        </button>
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-hairline p-0.5">
            <button type="button" className={toggle(width === "desktop")} onClick={() => setWidth("desktop")}>
              デスクトップ
            </button>
            <button type="button" className={toggle(width === "mobile")} onClick={() => setWidth("mobile")}>
              モバイル
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <label className="flex cursor-pointer items-center gap-1.5 text-ink-muted">
              <input
                type="checkbox"
                checked={marked}
                onChange={(event) => setMarked(event.target.checked)}
                className="accent-ink"
              />
              キットに無い節を示す
            </label>
            <button type="button" onClick={openInTab} className="font-semibold text-accent hover:underline">
              新しいタブで開く ↗
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-ink/[0.03]">
          {/* No scripts and no same-origin: the page is a document being
              looked at, and it must look here the way it looks anywhere. */}
          <iframe
            title="LPのプレビュー"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={marked ? lp.htmlMarked : lp.html}
            className={cn(
              "mx-auto block h-[calc(100vh-16rem)] min-h-[560px] bg-white",
              width === "mobile" ? "w-[390px] max-w-full border-x border-hairline" : "w-full",
            )}
          />
        </div>
      </section>
    </main>
  );
}
