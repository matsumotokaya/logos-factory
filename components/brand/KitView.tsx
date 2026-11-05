"use client";

// The brand kit, drawn once for two readers.
//
// The workspace shows the DRAFT (values and claims, with 推定 → 採用 on every
// claim) and the public page shows a PUBLISHED take (values only). Same
// component, same order, same words, so what the editor sees is what the
// reader gets (docs/product.md §2.1: preview is the page without its tools).
// Everything that is a tool — the pipeline, the run log, the gaps, the site
// files — stays outside, in BrandTop.

import type { ReactNode } from "react";
import type { KnowledgeClaim, KnowledgeValue } from "@/app/api/brands/[id]/overview/route";
import BrandAssetSlots from "@/components/brand/BrandAssetSlots";
import {
  PaletteCard,
  ShapeCard,
  StructureCard,
  TypeCard,
  type AdoptHandler,
} from "@/components/brand/BrandDesignCards";
import BrandHero, { type HeroLogo } from "@/components/brand/BrandHero";
import { buildProfile } from "@/lib/brand/profile";

export type KitViewData = {
  brand: {
    id: string;
    name: string;
    description: string;
    industry: string;
    location: string;
    website: string;
  };
  values: KnowledgeValue[];
  claims: KnowledgeClaim[];
  logos: HeroLogo[];
  keyVisual: { id: string; name: string; url: string | null } | null;
};

export default function KitView({
  data,
  kindControl,
  eyebrow,
  logosHref,
  onAdopt,
  emptyNote,
}: {
  data: KitViewData;
  kindControl?: ReactNode;
  eyebrow?: ReactNode;
  logosHref?: string;
  onAdopt?: AdoptHandler;
  /** Shown instead of the cards when nothing has been read yet. */
  emptyNote?: ReactNode;
}) {
  const profile = buildProfile(data.values, data.claims);
  const headline =
    profile.text("offering.tagline") ?? profile.text("voice.tagline") ?? data.brand.name;
  const body =
    data.brand.description ||
    profile.text("offering.summary") ||
    "このブランドのサイトから読み取った書体で、本文はこのように組まれます。";
  const nothingRead = data.values.length === 0 && data.claims.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <BrandHero
        name={data.brand.name}
        description={data.brand.description}
        website={data.brand.website}
        location={data.brand.location}
        industry={data.brand.industry}
        profile={profile}
        logo={data.logos[0] ?? null}
        logosHref={logosHref}
        kindControl={kindControl}
        eyebrow={eyebrow}
        onAdopt={onAdopt}
      />

      <section aria-labelledby="brand-look" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="brand-look" className="text-balance text-lg font-semibold">
            見た目
          </h2>
          <span className="text-xs text-ink-muted">
            動画・LP・バナーは、この色・書体・形で描かれます
          </span>
        </div>
        {nothingRead ? (
          emptyNote ?? (
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-5 text-sm text-ink-muted">
              このブランドはまだ何も読み取っていません。
            </p>
          )
        ) : (
          <div className="grid gap-4">
            <PaletteCard profile={profile} onAdopt={onAdopt} />
            <TypeCard profile={profile} onAdopt={onAdopt} headline={headline} body={body} />
            <ShapeCard profile={profile} onAdopt={onAdopt} headline={headline} />
            <StructureCard profile={profile} onAdopt={onAdopt} />
          </div>
        )}
      </section>

      <section aria-labelledby="brand-assets" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="brand-assets" className="text-balance text-lg font-semibold">
            ブランドアセット
          </h2>
          <span className="text-xs text-ink-muted">
            動画・LP・バナーのすべてが、ここから作られます
          </span>
        </div>
        <BrandAssetSlots
          slots={[
            {
              key: "logo",
              label: "ロゴ",
              hint: "動画の冒頭と締め、LPのヘッダーに出ます",
              items: data.logos.map((logo) => ({
                id: logo.id,
                name: logo.title,
                previewUrl: logo.previewUrl,
                href: logo.href,
              })),
              emptyNote: logosHref
                ? "まだロゴがありません。サイトから取り込むか、トップからSVGをアップロードします。無いあいだは明朝のクレジット表記で代替されます。"
                : "このキットにロゴはありません。",
              href: logosHref,
            },
            {
              key: "keyvisual",
              label: "キービジュアル",
              hint: "動画の主役シーンやLPのヒーローの地になります",
              items: data.keyVisual
                ? [
                    {
                      id: data.keyVisual.id,
                      name: data.keyVisual.name,
                      previewUrl: data.keyVisual.url,
                      note: "ブランドの素材",
                    },
                  ]
                : [],
              emptyNote: logosHref
                ? "このブランドはキービジュアルを持っていません。成果物ごとに写真を入れるか、ずっと使う1枚を素材から「ブランドの基盤へ」上げると、ここに出ます。"
                : "このキットにキービジュアルはありません。",
            },
          ]}
        />
      </section>
    </div>
  );
}
