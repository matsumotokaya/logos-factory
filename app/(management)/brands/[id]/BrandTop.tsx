"use client";

// The brand kit's workspace page — the DRAFT of /k/[brandId].
//
// Everything on this screen is one of two things (docs/product.md §2.1):
//
//   THE PAGE     what the published kit will show: the mark, the facts, the
//                four cards, the assets. Drawn by KitView, the same component
//                the public page uses, so the preview is the page itself
//                rather than a second drawing of it.
//   THE TOOLS    what only an editor needs: under the name, the kit's address
//                and state and the way into updating the brand's information;
//                the AI's readings marked as such; the exhaustive list;
//                the files the capture brought home; the deliverables made
//                from the kit.
//
// The pipeline is not on the page. What the page shows is what was made;
// how it was made — input to output — opens in a drawer from 「ブランド情報を
// 更新」, because changing the brand means changing what goes in and running
// it again, not typing over a value (owner's direction, 2026-11-14).
//
// 「プレビュー」 hides the tools and nothing else. The kit line is the one
// that moves between the two: 下書き → 公開中, 更新あり → 更新を公開.
//
// Re-fetching the site refreshes what the brand LOOKS like — palette, type,
// logo — and deliberately leaves its facts alone, since a name and description
// someone has confirmed should not be reverted by a crawl.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandOverview } from "@/app/api/brands/[id]/overview/route";
import type { LogoSummary } from "@/app/api/brands/[id]/logos/route";
import PipelineDrawer from "@/components/pipeline/PipelineDrawer";
import { ProcessLogLines, toStepEvents } from "@/components/pipeline/ProcessLogPopup";
import { getRuns, subscribeRuns, watchBrandRun } from "@/lib/runs/store";
import BrandPipelinePanel, {
  type BrandPipelinePayload,
} from "@/components/pipeline/BrandPipelinePanel";
import BrandInputForm, { inputMaterials, type BrandMaterial } from "@/components/pipeline/BrandInputForm";
import { useBrandRun, type BrandRunState } from "@/components/brand/BrandRunStatus";
import BrandKnowledgePanel from "@/components/brand/BrandKnowledgePanel";
import BrandImageLibrary from "@/components/brand/BrandImageLibrary";
import KitPublishBar, { type KitStatusView } from "@/components/brand/KitPublishBar";
import CreateLpButton from "@/components/lp/CreateLpButton";
import KitView, { type KitViewData } from "@/components/brand/KitView";
import { BRAND_KINDS, BRAND_KIND_LABEL, isBrandKind } from "@/lib/brand-kind";
import { refreshBrandTree } from "@/lib/brand-events";
import { materialFileName } from "@/lib/materials/naming";
import type { PipelineStage } from "@/lib/pipeline/stages";
import { VIDEO_TEMPLATE_FAMILIES } from "@/lib/video/templates";
import { MainMark } from "@/components/management/MainMark";
import BrandRoleMenu from "@/components/brand/BrandRoleMenu";

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
  const [counts, setCounts] = useState({ videos: 0, lps: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<
    (BrandPipelinePayload & { stages: PipelineStage[] }) | null
  >(null);
  /** The pipeline drawer, and the stage it opens on. */
  const [updating, setUpdating] = useState<{ stage: string | null } | null>(null);
  const [materials, setMaterials] = useState<BrandMaterial[]>([]);
  const [busy, setBusy] = useState(false);
  // Bumped when this page starts a run, so the status polls it to the end.
  const [runWatch, setRunWatch] = useState(0);
  const [kit, setKit] = useState<KitStatusView | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

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
      const [overviewRes, videoRes, logoRes, lpRes] = await Promise.all([
        authedFetch(`/api/brands/${brandId}/overview`),
        authedFetch(`/api/brands/${brandId}/videos`),
        authedFetch(`/api/brands/${brandId}/logos`),
        authedFetch(`/api/brands/${brandId}/lps`),
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
      const lpJson = lpRes.ok ? ((await lpRes.json()) as { lps?: unknown[] } | null) : null;
      setCounts({ videos: videoJson?.videos?.length ?? 0, lps: lpJson?.lps?.length ?? 0 });
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

  // The read's log goes to the workspace's run column, where it stays if the
  // user leaves this page (lib/runs/store.ts).
  const brandName = overview?.name ?? "";
  const followRun = useCallback(() => {
    watchBrandRun({
      brandId,
      brandName,
      read: async () => {
        const res = await authedFetch(`/api/brands/${brandId}/runs`);
        if (!res.ok) return null;
        return ((await res.json()) as { run: BrandRunState | null }).run;
      },
    });
  }, [brandId, brandName]);

  // 「すべてやり直す」 starts a run; useBrandRun follows it and calls
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
      followRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : "サイトから取り込めませんでした");
      setBusy(false);
    }
  }, [brandId, followRun]);

  // The run's drawer says what it brought back; this only has to put it on
  // the page.
  const settleRun = useCallback(async () => {
    setBusy(false);
    await load();
    await loadPipeline();
  }, [load, loadPipeline]);
  const run = useBrandRun(brandId, runWatch, () => void settleRun());
  // A read already going when the page opens (a brand just made from a URL).
  const runIsGoing = run?.status === "running";
  useEffect(() => {
    if (runIsGoing) followRun();
  }, [runIsGoing, followRun]);
  // The stage that read is in, for the drawer's rail.
  const activeStage = useSyncExternalStore(
    subscribeRuns,
    () => getRuns().find((item) => item.key === `brand:${brandId}` && item.status === "running")?.stage ?? null,
    () => null,
  );

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

  const addUrl = useCallback(
    async (url: string) => {
      const res = await authedFetch(`/api/brands/businesses/${brandId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "ページを追加できませんでした");
      await loadPipeline();
    },
    [brandId, loadPipeline],
  );

  const saveWebsite = useCallback(
    async (website: string) => {
      const res = await authedFetch(`/api/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "URLを変えられませんでした");
      await load();
      await loadPipeline();
    },
    [brandId, load, loadPipeline],
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
      <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
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
    {
      href: `/brands/${brandId}/works/lp`,
      label: "LPs",
      description: "入力なしで、このキットから1ページのLPを作ります。キットに無かった内容に印が付きます。",
      count: counts.lps,
      hint: "ヒーロー / 概要 / 特長 / お客様の声 / CTA",
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
    // The preview is the published page, which carries what the page shows:
    // publishing confirms the AI's readings (lib/brand/kit/publish.ts).
    claims: overview.claims,
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

  const kitLine = (
    <KitPublishBar
      status={kit}
      busy={kitBusy}
      previewing={previewing}
      onTogglePreview={() => setPreviewing((on) => !on)}
      onPublish={publishKit}
      onUnpublish={unpublishKit}
    />
  );

  const inputs = inputMaterials(materials);
  // The site counts as read only when the last read was of THIS address: a
  // changed URL is an input nobody has read yet.
  const bare = (url: string | null | undefined) => (url ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  const siteReadAt =
    run?.status === "done" && overview.website && bare(run.result?.url) === bare(overview.website) ? run.createdAt : null;
  const unread = inputs.filter((material) => !material.read_at).length + (overview.website && !siteReadAt ? 1 : 0);
  const when = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
  const running = runIsGoing || busy;
  const runLine = running
    ? "サイトを読み取っています…"
    : run?.status === "error"
      ? "最後の読み取りに失敗しました"
      : run
        ? `最終更新 ${when(run.createdAt)}`
        : "まだ読み取っていません";

  // Above the stages in the drawer: when it last ran, what came back, the
  // one control that runs all of it again, and the log.
  const updateLead = (
    <section className="flex flex-col gap-3 rounded-2xl border border-hairline px-5 py-4 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={run?.status === "error" ? "font-semibold text-red-700" : "font-semibold text-ink"}>{runLine}</p>
          {run?.status === "done" && run.result ? (
            <p className="mt-0.5 text-ink-muted">
              {`${run.result.adopted}項目を採用・${run.result.claims}件を記録・画像${run.result.files}点`}
              {run.result.note ? ` ${run.result.note}` : ""}
            </p>
          ) : null}
          {run?.status === "error" ? (
            <p className="mt-0.5 text-red-700" role="alert">
              {run.error ?? "原因不明のエラー"}
            </p>
          ) : null}
        </div>

      </div>
      {run && run.steps.length > 0 ? (
        <details>
          <summary className="cursor-pointer select-none font-semibold text-ink-muted hover:text-ink">
            最後の実行のログ
          </summary>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-hairline p-3">
            <ProcessLogLines steps={toStepEvents(run.steps)} working={run.status === "running"} />
          </div>
        </details>
      ) : null}
    </section>
  );

  return (
    <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      {/* In the preview the page is the published page; the kit line stays
          above it only as the way back to editing. */}
      {previewing ? <div className="rounded-xl border border-hairline bg-white">{kitLine}</div> : null}

      {updating && pipeline ? (
        <PipelineDrawer
          title="ブランド情報を更新"
          description="このブランドの情報が、何から・どう作られているかです。直したいときは値を書き換えずに、入力（サイト・ページ・資料・メモ）を変えて作り直します。"
          lead={updateLead}
          stages={pipeline.stages}
          activeStage={activeStage}
          initialStage={updating.stage ?? "input"}
          renderStage={(stageId) =>
            stageId === "input" ? (
              <BrandInputForm
                website={overview.website}
                lastRead={siteReadAt}
                materials={materials}
                busy={busy}
                onSaveWebsite={saveWebsite}
                onAddUrl={addUrl}
                onUploadFile={uploadMaterial}
                onAddNote={addNote}
                onRemove={removeMaterial}
              />
            ) : (
              <BrandPipelinePanel stageId={stageId} payload={pipeline} />
            )
          }
          footer={
            <>
              <p className="text-[12px] text-ink-muted">
                素材 <span className="font-semibold tabular-nums text-ink">{(overview.website ? 1 : 0) + inputs.length}</span>点
                {unread > 0 ? (
                  <span className="ml-2 font-semibold text-amber-800">未読み取り {unread}点</span>
                ) : null}
                <span className="ml-2 text-ink-faint">1〜2分。閉じても続き、経過は右下に出ます</span>
              </p>
              <button
                type="button"
                onClick={() => void reimportSite()}
                disabled={running || (!overview.website && inputs.length === 0)}
                className="shrink-0 rounded-full bg-ink px-5 py-2 text-xs font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? "作り直しています…" : "この入力で作り直す"}
              </button>
            </>
          }
          onClose={() => setUpdating(null)}
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
        status={
          previewing ? undefined : (
            <div className="divide-y divide-hairline rounded-xl border border-hairline bg-white">
              {kitLine}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12px]">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="w-24 shrink-0 font-semibold text-ink">ブランド情報</span>
                  <span className={run?.status === "error" ? "text-red-700" : "text-ink-muted"}>{runLine}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUpdating({ stage: null })}
                  className="shrink-0 rounded-full border border-ink px-4 py-1.5 text-xs font-semibold text-ink transition hover:bg-ink hover:text-paper"
                >
                  ブランド情報を更新
                </button>
              </div>
            </div>
          )
        }
        logosHref={previewing ? undefined : `/brands/${brandId}/assets/logos`}
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
                すべての項目（確定・AIの読み取り・まだわからない）
                <span className="ml-1 text-ink-faint group-open:hidden">を見る</span>
                <span className="ml-1 hidden text-ink-faint group-open:inline">を閉じる</span>
              </summary>
              <div className="border-t border-hairline px-5 py-5">
                <BrandKnowledgePanel values={overview.knowledge} claims={overview.claims} />
              </div>
            </details>
          ) : null}

          <section aria-labelledby="brand-images" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="brand-images" className="text-balance text-lg font-semibold">
                ブランドの素材
              </h2>
              <span className="text-xs text-ink-muted">
                サイトの画像をAIが1枚ずつ見て、ブランドの素材かどうかを分けています
              </span>
            </div>
            <BrandImageLibrary brandId={brandId} files={overview.files} onChanged={load} />
          </section>

          {/* The works made from the kit — and the check on it: what a work
              had to make up is what the kit is missing. */}
          <section aria-labelledby="brand-tools" className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id="brand-tools" className="text-balance text-lg font-semibold">
                Works — このキットから作ったもの
              </h2>
              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              <CreateLpButton brandId={brandId} label="このキットでLPを作る" className="shrink-0 px-4 py-1.5 text-[11px]" />
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
