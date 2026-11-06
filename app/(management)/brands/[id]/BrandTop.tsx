"use client";

// The brand kit's workspace page — the DRAFT of /k/[brandId].
//
// Everything on this screen is one of two things (docs/product.md §2.1):
//
//   THE PAGE     what the published kit will show: the mark, the facts, the
//                four cards, the assets. Drawn by KitView, the same component
//                the public page uses, so the preview is the page itself
//                rather than a second drawing of it.
//   THE TOOLS    what only an editor needs: the pipeline that fills the brand
//                (opened over the page rather than navigated to, §17.3), the
//                last run's line, 推定 → 採用 on every claim, the exhaustive
//                three-state list, the files the capture brought home, and
//                the deliverables made from the kit.
//
// 「プレビュー」 hides the tools and nothing else. The publish bar is the one
// line that moves between the two: 下書き → 公開中, 更新あり → 更新を公開.
//
// Re-fetching the site refreshes what the brand LOOKS like — palette, type,
// logo — and deliberately leaves its facts alone, since a name and description
// someone has confirmed should not be reverted by a crawl.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOverview } from "@/app/api/brands/[id]/overview/route";
import type { LogoSummary } from "@/app/api/brands/[id]/logos/route";
import PipelineBar from "@/components/pipeline/PipelineBar";
import StageDrawer from "@/components/pipeline/StageDrawer";
import BrandPipelinePanel, {
  type BrandPipelinePayload,
} from "@/components/pipeline/BrandPipelinePanel";
import type { BrandMaterial } from "@/components/pipeline/MaterialIntake";
import {
  BrandRunDrawer,
  BrandRunFact,
  BrandRunLive,
  useBrandRun,
} from "@/components/brand/BrandRunStatus";
import BrandKnowledgePanel, {
  BrandSiteFiles,
} from "@/components/brand/BrandKnowledgePanel";
import KitPublishBar, { type KitStatusView } from "@/components/brand/KitPublishBar";
import KitView, { type KitViewData } from "@/components/brand/KitView";
import { BRAND_KINDS, BRAND_KIND_LABEL, isBrandKind } from "@/lib/brand-kind";
import { refreshBrandTree } from "@/lib/brand-events";
import { materialFileName } from "@/lib/materials/naming";
import type { PipelineStage } from "@/lib/pipeline/stages";
import { VIDEO_TEMPLATE_FAMILIES } from "@/lib/video/templates";
import { MainMark } from "@/components/management/MainMark";
import BrandRoleMenu from "@/components/brand/BrandRoleMenu";
import { isMeasuredClaim } from "@/lib/brand/profile";

type Tile = {
  href: string;
  label: string;
  description: string;
  count: number;
  hint: string;
};

type KitResponse = {
  kit?: { state: KitStatusView["state"]; urlPath: string; publishedAt: string | null } | null;
  error?: string;
};

export default function BrandTop({ brandId }: { brandId: string }) {
  const [overview, setOverview] = useState<BrandOverview | null>(null);
  const [logos, setLogos] = useState<LogoSummary[]>([]);
  const [counts, setCounts] = useState({ videos: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<
    (BrandPipelinePayload & { stages: PipelineStage[] }) | null
  >(null);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [materials, setMaterials] = useState<BrandMaterial[]>([]);
  const [busy, setBusy] = useState(false);
  // Bumped when this page starts a run, so the status polls it to the end.
  const [runWatch, setRunWatch] = useState(0);
  const [kit, setKit] = useState<KitStatusView | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  // The brand's key visual, if it has declared one.
  //
  // `kind` is where this lives rather than `category`, because `kind` has
  // carried role-ish values since 0028 — `logo` and `font` are roles too, and
  // `keyvisual` has been in the CHECK constraint all along with nothing
  // writing it. Reusing it costs no migration and invents no third axis.
  // `category` stays what the picture DEPICTS (a sake still life is a product
  // shot whether or not a brand made it their key visual).
  const keyVisuals = materials.filter((material) => material.kind === "keyvisual");

  const loadKit = useCallback(async () => {
    const res = await authedFetch(`/api/brands/${brandId}/kit`);
    const body = (await res.json().catch(() => null)) as KitResponse | null;
    if (res.ok && body?.kit) {
      setKit({ state: body.kit.state, urlPath: body.kit.urlPath, publishedAt: body.kit.publishedAt });
    }
  }, [brandId]);

  const load = useCallback(async () => {
    try {
      const [overviewRes, videoRes, logoRes] = await Promise.all([
        authedFetch(`/api/brands/${brandId}/overview`),
        authedFetch(`/api/brands/${brandId}/videos`),
        authedFetch(`/api/brands/${brandId}/logos`),
      ]);
      const overviewJson = overviewRes.ok
        ? ((await overviewRes.json()) as { overview?: BrandOverview } | null)
        : null;
      const videoJson = videoRes.ok
        ? ((await videoRes.json()) as { videos?: unknown[] } | null)
        : null;

      if (!overviewJson?.overview) {
        throw new Error("ブランド情報を取得できませんでした");
      }
      setOverview(overviewJson.overview);
      const logoJson = logoRes.ok
        ? ((await logoRes.json()) as { logos?: LogoSummary[] } | null)
        : null;
      // The library endpoint spans every brand in the workspace (the Logos
      // page lists them all); the kit shows THIS brand's own marks, the same
      // set the published kit freezes. A sub-brand with none keeps none.
      setLogos((logoJson?.logos ?? []).filter((logo) => logo.subjectEntityId === brandId));
      setCounts({ videos: videoJson?.videos?.length ?? 0 });
      setError(null);
      await loadKit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ブランドキットを読み込めませんでした");
    }
  }, [brandId, loadKit]);

  // The pipeline and the material list are derived from the same rows the page
  // reads, so they are refreshed by the same call that refreshes the page.
  const loadPipeline = useCallback(async () => {
    const [pipelineRes, materialsRes] = await Promise.all([
      authedFetch(`/api/brands/businesses/${brandId}/pipeline`),
      authedFetch(`/api/brands/businesses/${brandId}/materials`),
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

  // 「サイトを読み直す」 starts a run; BrandRunStatus follows it and calls
  // settleRun when it lands.
  const reimportSite = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/brands/${brandId}/recapture`, {
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
      setRunWatch((count) => count + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "サイトから取り込めませんでした");
      setBusy(false);
    }
  }, [brandId]);

  // The run's drawer says what it brought back; this only has to put it on
  // the page.
  const settleRun = useCallback(async () => {
    setBusy(false);
    await load();
    await loadPipeline();
  }, [load, loadPipeline]);
  const run = useBrandRun(brandId, runWatch, () => void settleRun());

  const uploadMaterial = useCallback(
    async (file: File, data: string) => {
      setBusy(true);
      try {
        await authedFetch(`/api/brands/businesses/${brandId}/materials`, {
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
        await authedFetch(`/api/brands/businesses/${brandId}/materials`, {
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
        await authedFetch(
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

  // 推定 → 採用. The value moves from claims to values; the page re-reads so
  // the chip goes and the kit's 「更新あり」 follows.
  const adopt = useCallback(
    async (fieldPath: string) => {
      setError(null);
      const res = await authedFetch(`/api/brands/${brandId}/knowledge/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldPath }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "採用できませんでした");
        return;
      }
      await load();
    },
    [brandId, load],
  );

  const publishKit = useCallback(async () => {
    setKitBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/brands/${brandId}/kit`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as KitResponse | null;
      if (!res.ok) throw new Error(body?.error ?? "公開できませんでした");
      if (body?.kit) {
        setKit({ state: body.kit.state, urlPath: body.kit.urlPath, publishedAt: body.kit.publishedAt });
      }
      refreshBrandTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "公開できませんでした");
    } finally {
      setKitBusy(false);
    }
  }, [brandId]);

  const unpublishKit = useCallback(async () => {
    setKitBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/brands/${brandId}/kit`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as KitResponse | null;
      if (!res.ok) throw new Error(body?.error ?? "非公開にできませんでした");
      if (body?.kit) {
        setKit({ state: body.kit.state, urlPath: body.kit.urlPath, publishedAt: body.kit.publishedAt });
      }
      refreshBrandTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "非公開にできませんでした");
    } finally {
      setKitBusy(false);
    }
  }, [brandId]);

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
      href: `/brands/${brandId}/works/video`,
      label: "Videos",
      description: "テンプレートを選んで追加できます。",
      count: counts.videos,
      // The categories on offer, not one template singled out by id.
      hint: VIDEO_TEMPLATE_FAMILIES.map((family) => family.name).join(" / "),
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
      const res = await authedFetch(`/api/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKind: nextKind }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "種別を変更できませんでした");
      refreshBrandTree();
      await loadKit();
    } catch (changeError) {
      setOverview((current) => (current ? { ...current, brandKind: previous } : current));
      setError(
        changeError instanceof Error ? changeError.message : "種別を変更できませんでした",
      );
    }
  };

  const openStageDef = pipeline?.stages.find((stage) => stage.id === openStage);

  // The key visual's bytes are in overview.files (signed URL); the material
  // list only names it.
  const keyVisualFile = keyVisuals[0]
    ? overview.files.find((file) => file.id === keyVisuals[0].id) ?? null
    : null;

  const kitData: KitViewData = {
    brand: {
      id: overview.id,
      name: overview.name,
      description: overview.description,
      industry: overview.industry,
      location: overview.location,
      website: overview.website,
    },
    values: overview.knowledge,
    // The preview is the published page: values and measured facts, no guesses.
    claims: previewing ? overview.claims.filter(isMeasuredClaim) : overview.claims,
    logos: logos.map((logo) => ({
      id: logo.id,
      title: logo.title,
      previewUrl: logo.previewUrl,
      href: `/brands/${brandId}/assets/logos/${logo.id}`,
    })),
    keyVisual: keyVisuals[0]
      ? {
          id: keyVisuals[0].id,
          name: materialFileName(keyVisuals[0]),
          url: keyVisualFile?.url ?? null,
        }
      : null,
  };

  const kindControl = (
    <label className="flex items-center gap-2 text-[10px] text-ink-faint">
      種別
      <select
        value={isBrandKind(overview.brandKind) ? overview.brandKind : ""}
        onChange={(e) => void changeKind(e.target.value)}
        className="rounded-full border border-hairline bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted outline-none hover:border-ink focus-visible:border-ink"
      >
        {isBrandKind(overview.brandKind) ? null : <option value="">未設定</option>}
        {BRAND_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {BRAND_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
      {pipeline && !previewing ? (
        <div className="-mx-6 -mt-2 md:-mx-10">
          <PipelineBar
            stages={pipeline.stages}
            openStage={openStage}
            onOpenStage={setOpenStage}
          />
        </div>
      ) : null}
      {pipeline && openStageDef && !previewing ? (
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

      <KitPublishBar
        status={kit}
        values={overview.knowledge}
        claims={overview.claims}
        busy={kitBusy}
        previewing={previewing}
        onTogglePreview={() => setPreviewing((on) => !on)}
        onPublish={publishKit}
        onUnpublish={unpublishKit}
      />

      <BrandRunLive run={run} />
      {runOpen && !previewing ? (
        <BrandRunDrawer
          run={run}
          website={overview.website || null}
          busy={busy}
          onReimport={() => void reimportSite()}
          onClose={() => setRunOpen(false)}
        />
      ) : null}

      <KitView
        data={kitData}
        kindControl={previewing ? undefined : kindControl}
        eyebrow={
          previewing ? (
            overview.isMain ? (
              <span className="flex items-center gap-1.5">
                <MainMark />
                メインブランド
              </span>
            ) : overview.parent ? (
              `${overview.parent.name} › サブブランド`
            ) : (
              "ブランド"
            )
          ) : (
            <BrandRoleMenu
              brand={{
                id: brandId,
                name: overview.name,
                organizationId: overview.brandOrganizationId,
                parent: overview.parent,
                isMain: overview.isMain,
              }}
              onChanged={load}
              onError={setError}
            />
          )
        }
        extraFacts={
          previewing
            ? undefined
            : [
                {
                  label: "更新",
                  value: <BrandRunFact run={run} busy={busy} onOpen={() => setRunOpen(true)} />,
                },
              ]
        }
        logosHref={previewing ? undefined : `/brands/${brandId}/assets/logos`}
        onAdopt={previewing ? undefined : adopt}
        emptyNote={
          <p className="rounded-2xl border border-dashed border-hairline px-4 py-5 text-sm text-ink-muted">
            このブランドはまだ何も読み取っていません。
            {overview.website
              ? "「サイトから取り込む」でこのブランドのサイトを読み取ると、配色・書体・構成・ロゴがここに入ります。"
              : "サイトURLを登録すると、そこから配色・書体・構成・ロゴを取り込めます。"}
          </p>
        }
      />

      {!previewing ? (
        <>
          {/* Three states, not two. Reading values alone made a brand that had
              just been measured look untouched — see BrandKnowledgePanel. */}
          {overview.knowledge.length > 0 || overview.claims.length > 0 ? (
            <details className="group rounded-2xl border border-hairline">
              <summary className="cursor-pointer select-none px-5 py-3 text-xs font-semibold text-ink-muted hover:text-ink">
                すべての項目（採用・推定・まだわからない）
                <span className="ml-1 text-ink-faint group-open:hidden">を見る</span>
                <span className="ml-1 hidden text-ink-faint group-open:inline">を閉じる</span>
              </summary>
              <div className="border-t border-hairline px-5 py-5">
                <BrandKnowledgePanel values={overview.knowledge} claims={overview.claims} />
              </div>
            </details>
          ) : null}

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                サイトから取り込んだ画像
              </h3>
              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
            </div>
            <BrandSiteFiles files={overview.files} />
          </section>

          {/* The works made from the kit — examples, not the product. */}
          <section aria-labelledby="brand-tools" className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id="brand-tools" className="text-balance text-lg font-semibold">
                Works — このキットから作ったもの
              </h2>
              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              <Link href={`/brands/${brandId}/works`} className="shrink-0 text-[11px] text-accent hover:underline">
                すべての Works →
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {tiles.map((tile) => (
                <TileLink key={tile.href} tile={tile} />
              ))}
            </div>
          </section>
        </>
      ) : null}
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
