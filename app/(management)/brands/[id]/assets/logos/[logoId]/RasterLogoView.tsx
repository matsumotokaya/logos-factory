"use client";

// A raster logo has no presentation yet (its dedicated mode is still to
// come), so the row opens the logo itself: one large sheet, nothing else.
// Falling through to the info page here would make "open the logo" mean two
// different things depending on the file format.

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import type { LogoMasterPreview } from "@/app/api/logos/[logoId]/master/route";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: LogoMasterPreview };

export default function RasterLogoView({
  brandId,
  logoId,
}: {
  brandId: string;
  logoId: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch(`/api/logos/${logoId}/master`);
        const body = (await response.json().catch(() => null)) as
          | (LogoMasterPreview & { error?: string })
          | null;
        if (!response.ok || !body) {
          throw new Error(body?.error ?? "ロゴを読み込めませんでした");
        }
        if (!cancelled) setState({ status: "ready", preview: body });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "ロゴを読み込めませんでした",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logoId]);

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col bg-paper text-ink">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-end gap-3 border-b border-hairline bg-paper px-6 py-2.5 md:px-10">
        <Link
          href={`/brands/${brandId}/assets/logos`}
          className="bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          ロゴ一覧
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        <div className="flex aspect-[4/3] w-full max-w-3xl items-center justify-center rounded-2xl border border-hairline bg-[#F1F3F4] p-12">
          {state.status === "ready" && state.preview.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.preview.previewUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : state.status === "error" ? (
            <p className="text-pretty text-center text-sm text-red-600">
              {state.message}
            </p>
          ) : state.status === "ready" ? (
            <p className="text-center text-sm text-ink-muted">
              プレビューがありません
            </p>
          ) : null}
        </div>
        <p className="max-w-prose text-pretty text-center text-sm text-ink-muted">
          画像ロゴのプレゼンテーションは準備中です。SVGを差し替えるとベクター正本になり、プレゼンテーションを生成できます。差し替えは
          <Link
            href={`/brands/${brandId}/assets/logos/${logoId}/info`}
            className="mx-1 underline underline-offset-4 hover:text-ink"
          >
            詳細
          </Link>
          から。
        </p>
      </div>
    </main>
  );
}
