"use client";

// The pictures the brand's site gave it, sorted the way a person would.
//
// First what the brand IS made of — key visual, product, texture,
// illustration, icons, the people who run it — grouped by use, each with the
// vision model's one-line reason. Last, folded, what only happened to be on
// the page: news thumbnails, campaign banners, other companies' logos. Those
// are kept, not hidden, and said plainly to be probably unrelated; a tick
// moves one into the brand's own (owner's direction, 2026-11-14).
//
// The judgement is lib/brand/classify-site-images.ts; the vocabulary is
// lib/brand/asset-use.ts.

import { useState } from "react";
import type { BrandFile } from "@/app/api/brands/[id]/overview/route";
import { authedFetch } from "@/lib/authed-fetch";
import { ASSET_USE, CORE_USES, type AssetUse } from "@/lib/brand/asset-use";
import { cn } from "@/lib/cn";

const CONTAIN: AssetUse[] = ["icon", "illustration", "partner"];

function Tile({
  file,
  pickable,
  busy,
  onPick,
}: {
  file: BrandFile;
  pickable?: boolean;
  busy?: boolean;
  onPick?: (picked: boolean) => void;
}) {
  const use = file.asset?.use;
  const contain = use ? CONTAIN.includes(use) : file.mediaType === "image/svg+xml";
  return (
    <li className={cn("flex flex-col gap-1.5", pickable && file.asset?.picked && "rounded-xl ring-2 ring-ink ring-offset-2")}>
      <a
        href={file.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={file.label}
        className="relative block overflow-hidden rounded-xl border border-hairline bg-ink/[0.03] transition hover:border-ink"
      >
        {file.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived, same-origin private URL
          <img
            src={file.url}
            alt={file.label}
            loading="lazy"
            className={cn("block h-32 w-full", contain ? "object-contain p-4" : "object-cover")}
          />
        ) : (
          <span className="block h-32" />
        )}
      </a>
      <div className="flex items-start gap-2">
        {pickable ? (
          <input
            type="checkbox"
            checked={file.asset?.picked === true}
            disabled={busy}
            onChange={(event) => onPick?.(event.target.checked)}
            aria-label={`${file.label} を素材として使う`}
            className="mt-0.5 shrink-0 accent-ink"
          />
        ) : null}
        <p className="line-clamp-2 text-pretty text-[11px] leading-snug text-ink-muted" title={file.asset?.note ?? file.label}>
          {file.asset?.note || file.label}
        </p>
      </div>
    </li>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">{children}</ul>;
}

function GroupHead({ label, hint, count }: { label: string; hint?: string; count: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h4 className="text-[12px] font-semibold text-ink">{label}</h4>
      <span className="tabular-nums text-[11px] text-ink-faint">{count}</span>
      {hint ? <span className="text-[11px] text-ink-faint">{hint}</span> : null}
    </div>
  );
}

export default function BrandImageLibrary({
  brandId,
  files,
  onChanged,
}: {
  brandId: string;
  files: BrandFile[];
  /** Called after a pick is stored, so the page re-reads. */
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fromSite = files.filter((file) => file.sourceKind === "url_fetch" && file.mediaType?.startsWith("image/"));
  const screens = fromSite.filter((file) => file.category === "screen");
  const pictures = fromSite.filter((file) => file.category !== "screen");
  const unjudged = pictures.filter((file) => !file.asset);
  const judged = pictures.filter((file) => file.asset);
  const core = judged.filter((file) => file.asset && ASSET_USE[file.asset.use].tier === "core");
  const asideAll = judged.filter((file) => file.asset && ASSET_USE[file.asset.use].tier === "possible");
  const picked = asideAll.filter((file) => file.asset?.picked);

  const pick = async (file: BrandFile, value: boolean) => {
    setBusy(file.id);
    setError(null);
    try {
      const res = await authedFetch(`/api/brands/${brandId}/materials/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picked: value }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "変更できませんでした");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更できませんでした");
    } finally {
      setBusy(null);
    }
  };

  if (fromSite.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-hairline px-4 py-5 text-pretty text-sm text-ink-muted">
        サイトから集めた画像はまだありません。「ブランド情報を更新」でサイトを読むと、ここに入ります。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      {CORE_USES.map((use) => {
        const group = core.filter((file) => file.asset?.use === use);
        if (group.length === 0) return null;
        return (
          <section key={use} className="flex flex-col gap-2.5">
            <GroupHead label={ASSET_USE[use].label} count={group.length} />
            <Grid>
              {group.map((file) => (
                <Tile key={file.id} file={file} />
              ))}
            </Grid>
          </section>
        );
      })}

      {picked.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <GroupHead label="選んだ画像" hint="下の一覧でチェックしたもの" count={picked.length} />
          <Grid>
            {picked.map((file) => (
              <Tile key={file.id} file={file} pickable busy={busy !== null} onPick={(value) => void pick(file, value)} />
            ))}
          </Grid>
        </section>
      ) : null}

      {core.length === 0 && picked.length === 0 && unjudged.length === 0 ? (
        <p className="text-pretty text-sm text-ink-muted">
          サイトの画像の中に、ブランドの素材と言えるものは見つかりませんでした。会社概要や製品のページを「ブランド情報を更新」で足すと、そこの画像も集めます。
        </p>
      ) : null}

      {unjudged.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <GroupHead label="まだ判断していない画像" hint="次に「この入力で作り直す」を押すと判断します" count={unjudged.length} />
          <Grid>
            {unjudged.map((file) => (
              <Tile key={file.id} file={file} />
            ))}
          </Grid>
        </section>
      ) : null}

      {screens.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <GroupHead label="サイトの画面" hint="読み取ったときのスクリーンショット" count={screens.length} />
          <Grid>
            {screens.map((file) => (
              <Tile key={file.id} file={file} />
            ))}
          </Grid>
        </section>
      ) : null}

      {asideAll.length > 0 ? (
        <details className="group rounded-2xl border border-hairline bg-ink/[0.015]">
          <summary className="cursor-pointer select-none px-5 py-3 text-[12px] text-ink-muted hover:text-ink">
            <span className="font-semibold">ブランドの素材ではなさそうな画像</span>
            <span className="ml-1.5 tabular-nums">{asideAll.length}点</span>
            <span className="ml-2 text-ink-faint">記事・お知らせ・キャンペーンなど</span>
          </summary>
          <div className="flex flex-col gap-5 border-t border-hairline px-5 py-4">
            <p className="text-pretty text-[12px] text-ink-muted">
              サイトに載っていたものの、記事やお知らせ、キャンペーンなどに使われていた画像です。基本的にはブランドの素材ではありませんが、使えそうなものがあればチェックを入れてください。チェックしたものは「選んだ画像」としてブランドの素材に加わります。
            </p>
            {(["editorial", "campaign", "partner", "decoration", "other"] as AssetUse[]).map((use) => {
              const group = asideAll.filter((file) => file.asset?.use === use);
              if (group.length === 0) return null;
              return (
                <section key={use} className="flex flex-col gap-2.5">
                  <GroupHead label={ASSET_USE[use].label} count={group.length} />
                  <Grid>
                    {group.map((file) => (
                      <Tile
                        key={file.id}
                        file={file}
                        pickable
                        busy={busy !== null}
                        onPick={(value) => void pick(file, value)}
                      />
                    ))}
                  </Grid>
                </section>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
