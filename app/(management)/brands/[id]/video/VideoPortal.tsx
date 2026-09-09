"use client";

// The brand's video portal: every video this brand has, plus the "add a video"
// action that picks a template.
//
// The first entry is the brand's default product CM. It is shown even when
// nothing has been generated and even though no row exists for it yet, because
// every brand is offered one — and it stays unpublished until someone chooses
// to publish, so an unused default costs the brand nothing.
//
// The add flow asks for the template first and never lets it change afterwards:
// the template decides the scene structure and which material slots exist, so
// switching it later would invalidate everything filled in. Same contract as
// slide-factory's per-property `deliverable`.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { videoFetch } from "@/lib/video/client";
import { refreshBrandTree } from "@/lib/brand-events";
import {
  DEFAULT_ADDABLE_VIDEO_STYLE,
  parseVideoStyle,
  styleLabel,
  VIDEO_TEMPLATE_FAMILIES,
  VIDEO_TEMPLATES,
} from "@/lib/video/templates";
import { VIDEO_STATE_LABEL, type VideoSummary } from "@/lib/video/asset";
import BusyBar from "@/components/pipeline/BusyBar";
import RunOverlay, { type RunCard } from "@/components/pipeline/RunOverlay";


/** One line of the creation log. Mirrors the server's `CreateEvent`
 *  (app/api/brands/[id]/videos/route.ts). */
type CreateEvent =
  | { type: "step"; label: string; index: number; total: number }
  | { type: "done"; id: string; createdAt: string }
  | { type: "error"; message: string };

export default function VideoPortal({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [brandName, setBrandName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** The creation log, in the same card every stage run uses. */
  const [runs, setRuns] = useState<RunCard[]>([]);
  // One value for the pair the dialog asks about — the template and, where the
  // template paints more than one way, the art direction (lib/video/templates.ts
  // `VideoStyle`). Parsed back into the two fields the API takes on submit.
  const [style, setStyle] = useState<string>(DEFAULT_ADDABLE_VIDEO_STYLE.key);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await videoFetch(`/api/brands/${brandId}/videos`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "動画を取得できませんでした");
      }
      const json = (await res.json()) as {
        brand: { name: string };
        videos: VideoSummary[];
      };
      setVideos(json.videos);
      setBrandName(json.brand.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "動画を取得できませんでした");
      setVideos([]);
    }
  }, [brandId]);

  useEffect(() => {
    // Kept off the synchronous effect path (same as CampaignDetail): setState
    // during the effect body triggers cascading renders.
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /**
   * Create the video, showing the account of it as it happens.
   *
   * The request streams (POST /api/brands/[id]/videos): one NDJSON line per
   * step, emitted where the work is. Creating an event video is most of a
   * minute — a seed read, a narration written by a model, a row saved — and it
   * used to go out as one opaque call behind a bar reading 「動画を作成して
   * います…」, which after thirty seconds is indistinguishable from a page that
   * has frozen. The card is the same one every stage run uses.
   *
   * No percentage, deliberately: 3/3 counts steps, which is a fact, while a
   * percentage over an LLM call is a guess that stalls (BusyBar says the same).
   */
  async function submit() {
    setSubmitting(true);
    const runId = `create-${Date.now()}`;
    const startedAt = Date.now();
    setRuns((prev) => [
      ...prev,
      {
        id: runId,
        label: "動画を作成しています",
        status: "running",
        lines: [],
        startedAt,
        endedAt: null,
      },
    ]);
    const push = (line: string) =>
      setRuns((prev) =>
        prev.map((run) =>
          run.id === runId ? { ...run, lines: [...run.lines, line] } : run,
        ),
      );
    const finish = (status: "succeeded" | "failed", error?: string) =>
      setRuns((prev) =>
        prev.map((run) =>
          run.id === runId
            ? { ...run, status, endedAt: Date.now(), error: error ?? null }
            : run,
        ),
      );

    try {
      const { templateId, artDirection } = parseVideoStyle(style);
      const body: Record<string, unknown> = {
        template: templateId,
        artDirection: artDirection ?? undefined,
        title: title.trim() || undefined,
      };
      const res = await videoFetch(`/api/brands/${brandId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // A refusal answered before the work began is still an ordinary JSON
      // error with a status: a bad template never reaches the stream.
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "動画を追加できませんでした");
      }

      let created: string | null = null;
      let failed: string | null = null;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        // Split on the newline the server writes after every event; the tail is
        // whatever arrived mid-line and is kept for the next chunk.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line) as CreateEvent;
          } catch {
            continue;
          }
          if (event.type === "step") {
            push(`${event.index}/${event.total} ${event.label}`);
          } else if (event.type === "done") {
            created = event.id;
          } else if (event.type === "error") {
            failed = event.message;
          }
        }
      }
      if (failed || !created) {
        throw new Error(failed ?? "動画を追加できませんでした");
      }

      push("できました");
      finish("succeeded");
      setAdding(false);
      setTitle("");
      // The left tree lists videos too, so it has to pick the new one up.
      refreshBrandTree();
      router.push(`/brands/${brandId}/video/${created}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "動画を追加できませんでした";
      finish("failed", message);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
      {/* The same bar the video detail screen uses for every long step. The
          dialog says what is happening; this says it is still happening after
          the dialog has been left behind — creation continues through the
          redirect to the new video. */}
      <BusyBar label={submitting ? "動画を作成しています…" : null} />
      {/* Survives the redirect: the card is rendered by this page, so it goes
          when the new video opens. The bar above is what carries over. */}
      <RunOverlay
        runs={runs}
        onDismiss={(id) => setRuns((prev) => prev.filter((run) => run.id !== id))}
      />
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">VIDEO</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
            {brandName ? `${brandName}の動画` : "動画"}
          </h1>
          <p className="mt-3 text-pretty text-sm text-ink-muted">
            このブランドが持つ動画の一覧です。テンプレートを選んで追加でき、
            作ったあとも素材を足して作り直せます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          ＋ 動画を追加
        </button>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      {videos === null ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : (
        <div className="space-y-8">
          {/* Grouped by the FAMILY OF WHAT EXISTS, not by what the add dialog
              offers: a retired template's takes (event-promo) still belong to
              their family and still have to be reachable from here. The API
              already sorts videos by family order, so the sections fall out in
              catalog order without a second list. A category with nothing in it
              is not shown — the way to start a new kind is the add button. */}
          {videos
            .reduce<Array<{ name: string; rows: VideoSummary[] }>>((sections, video) => {
              const name = VIDEO_TEMPLATES[video.template]?.family ?? video.template;
              const found = sections.find((section) => section.name === name);
              if (found) found.rows.push(video);
              else sections.push({ name, rows: [video] });
              return sections;
            }, [])
            .map((section) => (
              <section key={section.name}>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  {section.name}
                </h2>
                <ul className="mt-3 space-y-3">
                  {section.rows.map((video) => (
                    <li key={`${video.template}-${video.id}`}>
                      <VideoRow brandId={brandId} video={video} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      {adding ? (
        <AddVideoOverlay
          style={style}
          onStyle={setStyle}
          title={title}
          onTitle={setTitle}
          submitting={submitting}
          onCancel={() => setAdding(false)}
          onSubmit={submit}
        />
      ) : null}
    </main>
  );
}

function VideoRow({ brandId, video }: { brandId: string; video: VideoSummary }) {
  return (
    <Link
      href={`/brands/${brandId}/video/${video.id}`}
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline px-5 py-4 transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{video.title}</span>
          {/* The style: the painting for a template that has several, the
              template's own name otherwise. An old take with no painting
              recorded is labelled the way the renderer paints it. */}
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-muted">
            {styleLabel(video.template, video.artDirection)}
          </span>
          {video.isPlaceholder ? (
            <span className="rounded-full border border-dashed border-ink-faint px-2 py-0.5 text-[10px] text-ink-muted">
              既定
            </span>
          ) : null}
        </span>
        <span className="mt-1.5 block text-[11px] text-ink-muted">
          {VIDEO_STATE_LABEL[video.state]}
          {video.published ? " ・ 公開中" : " ・ 未公開"}
        </span>
      </span>
      <span className="text-xs text-accent">開く →</span>
    </Link>
  );
}

function AddVideoOverlay({
  style,
  onStyle,
  title,
  onTitle,
  submitting,
  onCancel,
  onSubmit,
}: {
  /** A `VideoStyle.key`: the template, and the painting where there is a choice. */
  style: string;
  onStyle: (key: string) => void;
  title: string;
  onTitle: (value: string) => void;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  // A React-controlled overlay rather than <dialog showModal()>: React's
  // synthetic onChange does not fire for inputs inside a modal dialog, so a
  // controlled form there silently stops updating (see components/Account.tsx).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const { templateId } = parseVideoStyle(style);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink/40" aria-hidden="true" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-video-title"
        className="relative w-full max-w-lg rounded-2xl border border-hairline bg-paper p-6 shadow-xl"
      >
        <h2 id="add-video-title" className="font-display text-lg font-semibold">
          動画を追加
        </h2>
        <p className="mt-2 text-[12px] text-ink-muted">テンプレートを選択してください。</p>

        <fieldset className="mt-5">
          <legend className="sr-only">テンプレート</legend>
          <div className="space-y-2">
            {VIDEO_TEMPLATE_FAMILIES.map((family) => {
              const active = family.styles.some((item) => item.key === style);
              return (
                <div
                  key={family.name}
                  className={cn(
                    "rounded-xl border p-3.5 transition",
                    active ? "border-ink bg-ink/[0.04]" : "border-hairline hover:border-ink-muted",
                  )}
                >
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="video-template-family"
                      value={family.name}
                      checked={active}
                      // Picking a family lands on its first style, so the pair
                      // is always a resolvable template and painting.
                      onChange={() => onStyle(family.styles[0].key)}
                    />
                    <span className="text-[13px] font-semibold">{family.name}</span>
                  </label>

                  {active ? (
                    <label className="mt-2.5 block pl-7">
                      <span className="text-[11px] text-ink-muted">スタイル</span>
                      <select
                        value={style}
                        onChange={(e) => onStyle(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-hairline bg-white px-2.5 py-2 text-[12px]"
                      >
                        {family.styles.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* The title belongs to the template that needs one. An event has a
            name before it has anything else, and asking for it at the bottom
            of the dialog — under a heading reading 任意 — buried the one
            field this template actually wants. */}
        {templateId === "event-cm" || templateId === "event-promo" ? (
          <label className="mt-5 block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              イベント名
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              placeholder="名称未設定"
              autoFocus
              className="mt-2 w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px]"
            />
            <span className="mt-1.5 block text-[11px] text-ink-muted">
              あとから変更できます。
            </span>
          </label>
        ) : null}

        {/* What the wait is for, while it is happening.
            「追加」 sounds instant and is not: the take is seeded from the brand,
            its mark is promoted to a material and measured, and an LLM writes
            the draft narration — twenty seconds or so in which the dialog
            previously did nothing but grey out its button, which reads as a
            frozen screen (requester, 2026-08-26).

            NAMED, NOT METERED. The steps are known but not observable from
            here — the API answers once, at the end — so a step-by-step log
            would be invented. Same rule as BusyBar: say what is being waited
            for, never a percentage that stalls. */}
        {submitting ? (
          <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-hairline bg-ink/[0.03] px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
            <span
              aria-hidden
              className="mt-0.5 inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-ink-faint border-t-ink"
            />
            <span>
              ブランドの情報から動画を組み立てています。ロゴと配色を読み、下書きのナレーションまで書くので、20秒ほどかかります。
            </span>
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full border border-hairline px-5 py-2.5 text-xs font-semibold transition hover:border-ink disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-paper transition hover:bg-accent disabled:opacity-50"
          >
            {submitting ? (
              <span
                aria-hidden
                className="inline-block size-3 animate-spin rounded-full border-2 border-paper/40 border-t-paper"
              />
            ) : null}
            {submitting ? "作成しています…" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}