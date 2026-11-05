"use client";

// The text page about a video: what it is, how big, how long, where it is
// published. Read-only. The video itself — player, storyboard, pipeline — is
// one level up; this page is reached from the sidebar row menu (「詳細」) and
// exists so those facts do not have to sit on the film.

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { VIDEO_STATE_LABEL, type VideoState } from "@/lib/video/asset";
import type { VideoTemplateId } from "@/lib/video/templates";
import { eventCmFilm } from "@/remotion/event-cm/film";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import { EVENT_WIDTH, EVENT_HEIGHT } from "@/remotion/event/palette";
import InfoPage, { formatBytes, formatDateTime, type InfoRow } from "@/components/management/InfoPage";

type VideoFacts = {
  id: string;
  brandId: string;
  brandName: string | null;
  title: string;
  template: VideoTemplateId;
  templateName: string;
  published: boolean;
  publicUrl: string | null;
  brief: Record<string, unknown> | null;
  bakedBrief: Record<string, unknown> | null;
  bakedAt: string | null;
  state: VideoState;
  createdAt: string;
  render: {
    status: "running" | "done" | "error";
    error: string | null;
    renderedAt: string | null;
    rendererBehind: boolean;
  } | null;
  mp4Url: string | null;
  mp4Bytes: number | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; video: VideoFacts };

/** Aspect, frame and length — of the played brief, since that is the film
 *  someone can watch. Templates that are not drawn by Remotion at a fixed
 *  frame (product-cm) report nothing rather than a guess. */
function filmSpec(video: VideoFacts): { frame: string | null; length: string | null } {
  const framed = video.template === "event-cm";
  const frame = framed ? `16:9 / ${EVENT_WIDTH}×${EVENT_HEIGHT}` : null;
  if (video.template !== "event-cm") return { frame, length: null };
  const brief = (video.bakedBrief ?? video.brief) as EventCmBrief | null;
  if (!brief) return { frame, length: null };
  try {
    const film = eventCmFilm(brief);
    const seconds = (film.totalMs / 1000).toFixed(1);
    return {
      frame,
      length: `${film.timingSource === "voice" ? "" : "約"}${seconds}秒`,
    };
  } catch {
    return { frame, length: null };
  }
}

export default function BrandVideoInfo({
  brandId,
  videoId,
}: {
  brandId: string;
  videoId: string;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch(`/api/brands/${brandId}/videos/${videoId}`);
        const body = (await response.json().catch(() => null)) as
          | { video?: VideoFacts; error?: string }
          | null;
        if (!response.ok || !body?.video) {
          throw new Error(body?.error ?? "動画を読み込めませんでした");
        }
        if (!cancelled) setState({ kind: "ready", video: body.video });
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "動画を読み込めませんでした",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, videoId]);

  const bodyPath = `/brands/${brandId}/works/video/${videoId}`;

  if (state.kind !== "ready") {
    return (
      <InfoPage
        kindLabel="動画"
        title={state.kind === "error" ? "動画を開けませんでした" : "読み込み中…"}
        bodyHref={bodyPath}
        bodyLabel="動画を開く"
        brandId={brandId}
        error={state.kind === "error" ? state.message : null}
        sections={[]}
      />
    );
  }

  const { video } = state;
  const spec = filmSpec(video);
  const sections: { title: string; rows: InfoRow[] }[] = [
    {
      title: "仕様",
      rows: [
        { label: "テンプレート", value: video.templateName },
        { label: "状態", value: VIDEO_STATE_LABEL[video.state] },
        { label: "画面", value: spec.frame },
        { label: "尺", value: spec.length },
        { label: "作成", value: formatDateTime(video.createdAt) },
        { label: "ブリーフ固定", value: formatDateTime(video.bakedAt) },
      ],
    },
    {
      title: "書き出し",
      rows: [
        {
          label: "MP4",
          value: video.render
            ? video.render.status === "done"
              ? "あり"
              : video.render.status === "running"
                ? "書き出し中"
                : (video.render.error ?? "失敗")
            : "未書き出し",
        },
        { label: "容量", value: video.mp4Bytes !== null ? formatBytes(video.mp4Bytes) : null },
        { label: "書き出し日時", value: formatDateTime(video.render?.renderedAt ?? null) },
        {
          label: "描画の版",
          value: video.render?.rendererBehind ? "書き出し後に描画が変わっています" : null,
        },
      ],
    },
    {
      title: "公開",
      rows: [
        { label: "状態", value: video.published ? "公開中" : "未公開" },
        { label: "公開URL", value: video.publicUrl, href: video.publicUrl ?? undefined },
      ],
    },
    {
      title: "識別子",
      rows: [
        { label: "Take ID", value: video.id, mono: true },
        { label: "ブランド", value: video.brandName },
      ],
    },
  ];

  return (
    <InfoPage
      kindLabel="動画"
      title={video.title}
      bodyHref={bodyPath}
      bodyLabel="動画を開く"
      brandId={brandId}
      sections={sections}
    />
  );
}
