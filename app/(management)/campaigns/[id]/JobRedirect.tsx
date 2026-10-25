"use client";

// A generation no longer has a page: its brand does (template contract — CM
// Maker folds into the brand). Old links and bookmarks to /campaigns/[id] land
// here and are sent on to the brand the run filled. The job record is in the
// signed-in user's job store, which only the API can read, so this resolves in
// the browser.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { videoFetch } from "@/lib/video/client";

export default function JobRedirect({
  id,
  /** Appended to the brand path: "" for the brand, "lp" or "video" for those. */
  view = "",
}: {
  id: string;
  view?: "" | "lp" | "video";
}) {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await videoFetch(
          `/api/labs/campaign/jobs?id=${encodeURIComponent(id)}`,
        );
        const body = res.ok
          ? ((await res.json()) as {
              job?: {
                input?: { brandEntityId?: string | null };
                catalog?: { brandId?: string } | null;
              };
            })
          : null;
        const brandId = body?.job?.input?.brandEntityId ?? body?.job?.catalog?.brandId;
        if (cancelled) return;
        if (!brandId) {
          setMissing(true);
          return;
        }
        router.replace(view ? `/brands/${brandId}/${view}/${id}` : `/brands/${brandId}`);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, view, router]);

  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center text-sm text-ink-muted">
      {missing ? (
        <>
          <p>この生成に対応するブランドが見つかりませんでした。</p>
          <Link
            href="/brands"
            className="mt-4 inline-block font-semibold text-ink underline-offset-4 hover:underline"
          >
            ブランド管理へ
          </Link>
        </>
      ) : (
        <p>ブランドのページへ移動しています…</p>
      )}
    </main>
  );
}
