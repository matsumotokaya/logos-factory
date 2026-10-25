"use client";

// The brand's top page, in the order the brand itself is built:
//
//   1. The pipeline that fills this brand — the five stages, opened over the
//      page rather than navigated to (§17.3)
//   2. The brand profile (name, description, industry, location, website)
//   3. **Brand assets**, shown two ways: DESIGN (palette / typography /
//      tokens, adopted into brand_knowledge_values) and LOGOS (all of them)
//   4. The marketing tools built out of those assets — videos, LPs, banners
//
// (3) and (4) are different kinds of thing and the page has to say so. A logo
// is not a deliverable sitting beside a video: it is global, like the palette,
// and every video, LP and banner is made out of it. Listing 動画 / LP / ロゴ as
// three peer tiles said the opposite.
//
// (1) is here because /businesses/[id] and /campaigns/businesses/[id] both
// redirect to this page: this IS the brand screen, and the pipeline has to be
// reachable from it. Re-fetching the site refreshes what the brand LOOKS like
// — palette, type, logo — and deliberately leaves its facts alone, since a
// name and description someone has confirmed should not be reverted by a
// crawl.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { videoFetch } from "@/lib/video/client";
import type { BrandOverview } from "@/app/api/brands/[id]/overview/route";
import type { LogoSummary } from "@/app/api/brands/[id]/logos/route";
import PipelineBar from "@/components/pipeline/PipelineBar";
import StageDrawer from "@/components/pipeline/StageDrawer";
import BrandPipelinePanel, {
  type BrandPipelinePayload,
} from "@/components/pipeline/BrandPipelinePanel";
import type { BrandMaterial } from "@/components/pipeline/MaterialIntake";
import BrandAssetSlots from "@/components/brand/BrandAssetSlots";
import BrandGenerationStatus from "@/components/brand/BrandGenerationStatus";
import {
  ProcessLogPopup,
  type StepEvent,
  type StepLevel,
} from "@/app/campaigns/ProcessLogPopup";
import { toStepEvents } from "@/app/campaigns/campaign-ui";
import BrandKnowledgePanel, {
  BrandSiteFiles,
} from "@/components/brand/BrandKnowledgePanel";
import { BRAND_KINDS, BRAND_KIND_LABEL, isBrandKind } from "@/lib/brand-kind";
import { refreshBrandTree } from "@/lib/brand-events";
import { materialFileName } from "@/lib/materials/naming";
import type { PipelineStage } from "@/lib/pipeline/stages";
import { VIDEO_TEMPLATE_FAMILIES } from "@/lib/video/templates";

/** GET /api/brands/[id]/recapture — lib/brand/recapture-runs.ts RecaptureRun. */
type RecaptureRunState = {
  id: string;
  status: "running" | "done" | "error";
  steps: { ts: string; message: string; level: StepLevel }[];
  result: { adopted: number; claims: number; files: number; note: string | null } | null;
  error: string | null;
};

type Tile = {
  href: string;
  label: string;
  description: string;
  count: number;
  hint: string;
};

export default function BrandTop({ brandId }: { brandId: string }) {
  const [overview, setOverview] = useState<BrandOverview | null>(null);
  const [logos, setLogos] = useState<LogoSummary[]>([]);
  const [counts, setCounts] = useState({ videos: 0, lps: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<
    (BrandPipelinePayload & { stages: PipelineStage[] }) | null
  >(null);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [materials, setMaterials] = useState<BrandMaterial[]>([]);
  const [busy, setBusy] = useState(false);
  // The steps of a re-import while it runs; null when none is running.
  const [recaptureSteps, setRecaptureSteps] = useState<StepEvent[] | null>(null);

  // The brand's key visual, if it has declared one.
  //
  // `kind` is where this lives rather than `category`, because `kind` has
  // carried role-ish values since 0028 — `logo` and `font` are roles too, and
  // `keyvisual` has been in the CHECK constraint all along with nothing
  // writing it. Reusing it costs no migration and invents no third axis.
  // `category` stays what the picture DEPICTS (a sake still life is a product
  // shot whether or not a brand made it their key visual).
  const keyVisuals = materials.filter((material) => material.kind === "keyvisual");

  const load = useCallback(async () => {
    try {
      const [overviewRes, videoRes, lpRes, logoRes] = await Promise.all([
        videoFetch(`/api/brands/${brandId}/overview`),
        videoFetch(`/api/brands/${brandId}/videos`),
        videoFetch(`/api/brands/${brandId}/lps`),
        videoFetch(`/api/brands/${brandId}/logos`),
      ]);
      const overviewJson = overviewRes.ok
        ? ((await overviewRes.json()) as { overview?: BrandOverview } | null)
        : null;
      const videoJson = videoRes.ok
        ? ((await videoRes.json()) as { videos?: unknown[] } | null)
        : null;
      const lpJson = lpRes.ok
        ? ((await lpRes.json()) as { lps?: unknown[] } | null)
        : null;

      if (!overviewJson?.overview) {
        throw new Error("ブランド情報を取得できませんでした");
      }
      setOverview(overviewJson.overview);
      const logoJson = logoRes.ok
        ? ((await logoRes.json()) as { logos?: LogoSummary[] } | null)
        : null;
      setLogos(logoJson?.logos ?? []);
      setCounts({
        videos: videoJson?.videos?.length ?? 0,
        lps: lpJson?.lps?.length ?? 0,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ブランドトップを読み込めませんでした");
    }
  }, [brandId]);

  // The pipeline and the material list are derived from the same rows the page
  // reads, so they are refreshed by the same call that refreshes the page.
  const loadPipeline = useCallback(async () => {
    const [pipelineRes, materialsRes] = await Promise.all([
      videoFetch(`/api/brands/businesses/${brandId}/pipeline`),
      videoFetch(`/api/brands/businesses/${brandId}/materials`),
    ]);
    if (pipelineRes.ok) {
      const body = (await pipelineRes.json()) as {
        pipeline?: BrandPipelinePayload & { stages: PipelineStage[] };
      };
      if (body.pipeline) setPipeline(body.pipeline);
    }
    if (materialsRes.ok) {
      const body = (await materialsRes.json()) as { materials?: BrandMaterial[] };
      setMaterials(body.materials ?? []);
    }
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await load();
      if (!cancelled) await loadPipeline();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, loadPipeline]);

  /**
   * Re-read the brand's own site and adopt what it wears.
   *
   * One action, no confirmation step: the golden path is that nobody has to
   * choose anything. The result lands in the design-rules section below, where
   * it can be judged — and re-run — after the fact.
   */
  /**
   * Read the site again through the server-side capture.
   *
   * The old route sent the browser to `inspect-url`, took the small JSON it
   * returns, and PATCHed it back — a shape that can hold a palette and one
   * logo. The capture now brings home a type scale, component shapes, the
   * page's own sections, contact details and a dozen files, none of which can
   * travel through a JSON the client carries. So the work happens where the
   * bytes already are, and this only asks for it and reloads.
   */
  // Follow a re-import run until it settles, showing its steps in the
  // floating log. The run is detached on the server, so a reload resumes here.
  const followRecapture = useCallback(
    async (runId: string) => {
      setBusy(true);
      try {
        for (;;) {
          const res = await videoFetch(
            `/api/brands/${brandId}/recapture?runId=${encodeURIComponent(runId)}`,
          );
          const body = (await res.json().catch(() => null)) as {
            run?: RecaptureRunState | null;
            error?: string;
          } | null;
          const run = body?.run;
          if (!res.ok || !run) {
            throw new Error(body?.error ?? "読み直しの状態を取得できませんでした");
          }
          setRecaptureSteps(
            toStepEvents(run.steps),
          );
          if (run.status === "error") {
            throw new Error(run.error ?? "サイトから取り込めませんでした");
          }
          if (run.status === "done") {
            await load();
            await loadPipeline();
            const result = run.result;
            const parts = [
              `${result?.adopted ?? 0}項目を採用`,
              `${result?.claims ?? 0}件を記録`,
              `画像${result?.files ?? 0}点を保存`,
            ];
            setNotice(
              `サイトを読み直しました（${parts.join("・")}）。${result?.note ?? ""}`.trim(),
            );
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "サイトから取り込めませんでした");
      } finally {
        setRecaptureSteps(null);
        setBusy(false);
      }
    },
    [brandId, load, loadPipeline],
  );

  const reimportSite = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await videoFetch(`/api/brands/${brandId}/recapture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as {
        runId?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.runId) {
        throw new Error(body?.error ?? "サイトから取り込めませんでした");
      }
      await followRecapture(body.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "サイトから取り込めませんでした");
      setBusy(false);
    }
  }, [brandId, followRecapture]);

  // A re-import still running from before a reload is picked back up.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await videoFetch(`/api/brands/${brandId}/recapture`);
        const body = res.ok
          ? ((await res.json()) as { run?: RecaptureRunState | null })
          : null;
        if (!cancelled && body?.run?.status === "running") {
          await followRecapture(body.run.id);
        }
      } catch {
        // Nothing to resume.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, followRecapture]);

  const uploadMaterial = useCallback(
    async (file: File, data: string) => {
      setBusy(true);
      try {
        await videoFetch(`/api/brands/businesses/${brandId}/materials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: file.name, mediaType: file.type, data }),
        });
        await loadPipeline();
      } finally {
        setBusy(false);
      }
    },
    [brandId, loadPipeline],
  );

  const addNote = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        await videoFetch(`/api/brands/businesses/${brandId}/materials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "メモ", text }),
        });
        await loadPipeline();
      } finally {
        setBusy(false);
      }
    },
    [brandId, loadPipeline],
  );

  const removeMaterial = useCallback(
    async (materialId: string) => {
      setBusy(true);
      try {
        await videoFetch(
          `/api/brands/businesses/${brandId}/materials/${materialId}`,
          { method: "DELETE" },
        );
        await loadPipeline();
      } finally {
        setBusy(false);
      }
    },
    [brandId, loadPipeline],
  );

  if (!overview) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
        <p className="text-sm text-ink-muted">読み込み中…</p>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  const tiles: Tile[] = [
    {
      href: `/brands/${brandId}/video`,
      label: "動画",
      description: "テンプレートを選んで追加できます。",
      count: counts.videos,
      // The categories on offer, not one template singled out by id.
      hint: VIDEO_TEMPLATE_FAMILIES.map((family) => family.name).join(" / "),
    },
    {
      href: `/brands/${brandId}/lp`,
      label: "LP",
      description: "Brand Kitから組み立てたセールスページの一覧。",
      count: counts.lps,
      hint: "セールスページ",
    },
  ];

  // The AI's first guess, the user's to change. Saved on pick; the tree reads
  // the same row, so it is told to refresh.
  const changeKind = async (nextKind: string) => {
    const previous = overview.brandKind;
    if (nextKind === previous) return;
    setOverview({ ...overview, brandKind: nextKind });
    setError(null);
    try {
      const res = await videoFetch(`/api/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKind: nextKind }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "種別を変更できませんでした");
      refreshBrandTree();
    } catch (changeError) {
      setOverview((current) => (current ? { ...current, brandKind: previous } : current));
      setError(
        changeError instanceof Error ? changeError.message : "種別を変更できませんでした",
      );
    }
  };

  const openStageDef = pipeline?.stages.find((stage) => stage.id === openStage);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
      {pipeline ? (
        <div className="-mx-6 -mt-2 md:-mx-10">
          <PipelineBar
            stages={pipeline.stages}
            openStage={openStage}
            onOpenStage={setOpenStage}
          />
        </div>
      ) : null}
      {pipeline && openStageDef ? (
        <StageDrawer
          title={openStageDef.label}
          description={openStageDef.summary}
          onClose={() => setOpenStage(null)}
        >
          <BrandPipelinePanel
            stageId={openStageDef.id}
            payload={pipeline}
            onInject={() => {
              setOpenStage(null);
              void reimportSite();
            }}
            materials={{
              websiteLabel: overview.website || null,
              materials,
              busy,
              onUploadFile: uploadMaterial,
              onAddNote: addNote,
              onRemove: removeMaterial,
            }}
          />
        </StageDrawer>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-hairline bg-ink/[0.03] px-4 py-2.5 text-[12px] text-ink-muted">
          {notice}
        </p>
      ) : null}
      <BrandGenerationStatus brandId={brandId} onSettled={() => void load()} />
      {recaptureSteps && recaptureSteps.length > 0 ? (
        <ProcessLogPopup steps={recaptureSteps} title="処理ログ — サイトを読み直しています" />
      ) : null}
      <header className="border-b border-hairline pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs font-semibold text-ink-muted">BRAND</p>
          <label className="flex items-center gap-2 text-[10px] text-ink-faint">
            種別
            <select
              value={isBrandKind(overview.brandKind) ? overview.brandKind : ""}
              onChange={(e) => void changeKind(e.target.value)}
              className="rounded-full border border-hairline bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted outline-none hover:border-ink focus-visible:border-ink"
            >
              {isBrandKind(overview.brandKind) ? null : (
                <option value="">未設定</option>
              )}
              {BRAND_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BRAND_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
          {overview.name}
        </h1>
        <p className="mt-3 text-pretty text-sm text-ink-muted">
          {overview.description
            ? overview.description
            : "このブランドのプロフィール・デザインルール・アセットの一覧です。"}
        </p>
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          {overview.industry ? (
            <div>
              <dt className="text-ink-faint">業種</dt>
              <dd className="mt-1 text-ink">{overview.industry}</dd>
            </div>
          ) : null}
          {overview.location ? (
            <div>
              <dt className="text-ink-faint">所在地</dt>
              <dd className="mt-1 text-ink">{overview.location}</dd>
            </div>
          ) : null}
          {overview.website ? (
            <div>
              <dt className="text-ink-faint">Webサイト</dt>
              <dd className="mt-1 truncate">
                <a
                  href={overview.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink underline-offset-4 hover:underline"
                >
                  {overview.website}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {/* Brand assets: global, and the material every tool below is made of.
          Two views of one thing — what it looks like, and what its mark is. */}
      <section aria-labelledby="brand-assets" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="brand-assets" className="text-balance text-lg font-semibold">
            ブランドアセット
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">
              動画・LP・バナーのすべてが、ここから作られます
            </span>
            {overview.website ? (
              <button
                type="button"
                onClick={() => void reimportSite()}
                disabled={busy}
                className="shrink-0 rounded-full border border-ink px-4 py-1.5 text-xs font-semibold transition hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-50"
              >
                {busy ? "取り込み中…" : "サイトから取り込む"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              このブランドについてわかっていること
            </h3>
            <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
          </div>
          {/* Three states, not two. Reading values alone made a brand that had
              just been measured look untouched — see BrandKnowledgePanel. */}
          <BrandKnowledgePanel
            values={overview.knowledge}
            claims={overview.claims}
          />
          {overview.knowledge.length === 0 && overview.claims.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-5 text-sm text-ink-muted">
              このブランドはまだ何も読み取っていません。
              {overview.website
                ? "「サイトから取り込む」でこのブランドのサイトを読み取ると、配色・書体・構成・ロゴがここに入ります。"
                : "サイトURLを登録すると、そこから配色・書体・構成・ロゴを取り込めます。"}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              サイトから取り込んだ画像
            </h3>
            <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
          </div>
          <BrandSiteFiles files={overview.files} />
        </div>

        {/* Logos and the key visual as NAMED SLOTS, so an empty one is
            visible. A brand with no key visual used to render no key-visual
            section at all, which reads as 「この製品にはその概念が無い」 rather
            than 「まだ指定していない」. Same component the video page uses, so
            the two answer the same question in the same shape. */}
        <BrandAssetSlots
          slots={[
            {
              key: "logo",
              label: "ロゴ",
              hint: "動画の冒頭と締め、LPのヘッダーに出ます",
              items: logos.map((logo) => ({
                id: logo.id,
                name: logo.title,
                previewUrl: logo.previewUrl,
                note: logo.subjectEntityName,
                href: `/brands/${brandId}/logos/${logo.id}`,
              })),
              emptyNote:
                "まだロゴがありません。サイトから取り込むか、トップからSVGをアップロードします。無いあいだは明朝のクレジット表記で代替されます。",
              href: `/brands/${brandId}/logos`,
            },
            {
              key: "keyvisual",
              label: "キービジュアル",
              hint: "動画の主役シーンやLPのヒーローの地になります",
              items: keyVisuals.map((material) => ({
                id: material.id,
                name: materialFileName(material),
                previewUrl: null,
                note: "ブランドの素材",
              })),
              emptyNote:
                "このブランドはキービジュアルを持っていません。成果物ごとに写真を入れるか、ずっと使う1枚を素材から「ブランドの基盤へ」上げると、ここに出ます。",
            },
          ]}
        />
      </section>

      {/* The tools built out of the assets above. */}
      <section aria-labelledby="brand-tools" className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id="brand-tools" className="text-balance text-lg font-semibold">
            マーケティングツール
          </h2>
          <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {tiles.map((tile) => (
            <TileLink key={tile.href} tile={tile} />
          ))}
        </div>
      </section>
    </main>
  );
}

function TileLink({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-white p-5 transition",
        "hover:border-ink hover:bg-ink/[0.02]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-balance text-lg font-semibold">{tile.label}</span>
        {tile.count > 0 ? (
          <span className="tabular-nums text-2xl font-semibold text-ink">
            {tile.count}
          </span>
        ) : null}
      </span>
      <p className="text-pretty text-xs leading-relaxed text-ink-muted">
        {tile.description}
      </p>
      <span className="mt-auto flex items-center justify-between text-[11px] text-ink-muted">
        <span>{tile.hint}</span>
        <span className="text-accent">開く →</span>
      </span>
    </Link>
  );
}