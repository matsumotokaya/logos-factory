"use client";

// Materials — every file in the brand's own library, grouped by what it is.
//
// Brand-scope rows only (docs/asset-normalization.md §12): a video's own
// copies live with the video. The signed URLs come from the overview, the
// same way the kit page draws them; there is no page per file yet, so a
// tile opens the file itself.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/authed-fetch";
import type { BrandFile, BrandOverview } from "@/app/api/brands/[id]/overview/route";

const KIND_LABEL: Record<string, string> = {
  keyvisual: "キービジュアル",
  photo: "写真・画面",
  illustration: "イラスト・図版",
  logo: "ロゴ",
  font: "書体",
  document: "資料",
  video: "動画",
};

const KIND_ORDER = ["keyvisual", "photo", "illustration", "font", "document", "video", "logo"];

const ROLE_LABEL: Record<string, string> = {
  screenshot_desktop: "デスクトップ",
  screenshot_full: "全景",
  screenshot_mobile: "モバイル",
  keyvisual: "キービジュアル",
  hero: "ヒーロー",
  texture: "地紋",
  content: "本文中",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  return `${Math.round(bytes / 1000)}KB`;
}

export default function MaterialsPortal({ brandId }: { brandId: string }) {
  const [overview, setOverview] = useState<BrandOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/brands/${brandId}/overview`);
      const json = res.ok ? ((await res.json()) as { overview?: BrandOverview }) : null;
      if (!json?.overview) throw new Error("素材を取得できませんでした");
      setOverview(json.overview);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "素材を取得できませんでした");
    }
  }, [brandId]);

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

  const files = overview?.files ?? [];
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind] ?? kind,
    files: files.filter((file) => file.kind === kind),
  })).filter((group) => group.files.length > 0);
  const other = files.filter((file) => !KIND_ORDER.includes(file.kind));
  if (other.length > 0) groups.push({ kind: "other", label: "その他", files: other });

  return (
    <main className="w-full flex flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">ASSETS / MATERIALS</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
            {overview ? `${overview.name} の Materials` : "Materials"}
          </h1>
          <p className="mt-3 text-pretty text-sm text-ink-muted">
            このブランドの素材庫。サイトから取り込んだ画面と画像、アップロードした写真や資料が入ります。
          </p>
        </div>
        <Link href={`/brands/${brandId}/assets`} className="text-xs text-ink-muted underline-offset-4 hover:text-ink">
          ← Assets
        </Link>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      {overview === null && !error ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : files.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-sm text-ink-muted">
          まだ素材がありません。ブランドキットの「サイトを読み直す」で画面と画像が入ります。
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.kind} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  {group.label}
                </h2>
                <span className="tabular-nums text-[11px] text-ink-faint">{group.files.length}</span>
                <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.files.map((file) => (
                  <li key={file.id}>
                    <MaterialTile file={file} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function MaterialTile({ file }: { file: BrandFile }) {
  const body = (
    <>
      <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-ink/[0.03]">
        {file.url && file.mediaType?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
          <img src={file.url} alt={file.label} className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="px-2 text-center text-[11px] text-ink-faint">{file.mediaType ?? "ファイル"}</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-ink" title={file.label}>
          {ROLE_LABEL[file.role ?? ""] ?? file.label}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
          {file.width && file.height ? `${file.width}×${file.height}` : ""}
          {file.bytes ? ` ${formatBytes(file.bytes)}` : ""}
          {file.sourceKind === "url_fetch" ? " · サイトから" : file.sourceKind === "upload" ? " · アップロード" : ""}
        </span>
      </span>
    </>
  );
  const shell = "flex h-full flex-col gap-2.5 rounded-2xl border border-hairline bg-white p-3 transition hover:border-ink";
  return file.url ? (
    <a href={file.url} target="_blank" rel="noreferrer" className={shell}>
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}
