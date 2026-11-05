"use client";

// The top of the brand page: the mark, large, beside the name. The logo is
// the one thing a reader checks to know the capture read the right site, so
// it is the first thing on the page rather than a thumbnail under 「アセット」.

import Link from "next/link";
import type { ReactNode } from "react";
import type { BrandProfile } from "@/lib/brand/profile";
import { isHex } from "@/lib/brand/profile";
import { Standing, type AdoptHandler } from "@/components/brand/BrandDesignCards";
import SocialRow from "@/components/brand/SocialRow";

export type HeroLogo = { id: string; title: string; previewUrl: string | null; href: string };

export default function BrandHero({
  name,
  description,
  website,
  location,
  industry,
  profile,
  logo,
  logosHref,
  kindControl,
  eyebrow,
  onAdopt,
}: {
  name: string;
  description: string;
  website: string;
  location: string;
  industry: string;
  profile: BrandProfile;
  /** The brand's own mark, or null when none has been read or uploaded. */
  logo: HeroLogo | null;
  /** Where all the logos are managed; absent on the public kit. */
  logosHref?: string;
  /** The 種別 select, rendered by the page that owns the change. */
  kindControl?: ReactNode;
  /** The line above the name: what kind of brand this is, and what it
   *  inherits from. Defaults to the bare word. */
  eyebrow?: ReactNode;
  onAdopt?: AdoptHandler;
}) {
  const tagline = profile.text("offering.tagline") ?? profile.text("voice.tagline");
  const operator = profile.text("identity.legal_name");
  const audience = profile.text("offering.audience");
  const background = profile.text("palette.background");

  const facts: { label: string; value: ReactNode; reading?: string }[] = [
    operator ? { label: "運営", value: operator, reading: "identity.legal_name" } : null,
    industry ? { label: "業種", value: industry } : null,
    audience ? { label: "対象", value: audience, reading: "offering.audience" } : null,
    location ? { label: "所在地", value: location } : null,
    website
      ? {
          label: "Web",
          value: (
            <a href={website} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          ),
        }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  return (
    <header className="grid gap-6 border-b border-hairline pb-8 md:grid-cols-[minmax(0,1fr)_18rem]">
      {/* The mark first in the DOM, last on wide screens. */}
      <div className="flex flex-col gap-2 md:order-last">
        {logo?.previewUrl ? (
          <Link
            href={logo.href}
            className="group flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-hairline p-8 transition hover:border-ink"
            style={{ backgroundColor: isHex(background) ? background : "#ffffff" }}
            title="ロゴのプレゼンテーションを開く"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
            <img src={logo.previewUrl} alt={`${name} のロゴ`} className="max-h-full max-w-full object-contain" />
          </Link>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-hairline p-6 text-center text-[12px] text-ink-muted">
            <span>
              <span className="block font-semibold text-ink-faint">ロゴ 未取得</span>
              サイトから見つからなかったか、まだ読み取っていません
            </span>
          </div>
        )}
        <p className="flex items-baseline justify-between text-[11px] text-ink-faint">
          <span>ロゴ{logo ? `・${logo.title}` : ""}</span>
          {logosHref ? (
            <Link href={logosHref} className="text-accent hover:underline">
              すべてのロゴ →
            </Link>
          ) : null}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-xs font-semibold text-ink-muted">{eyebrow ?? "BRAND"}</p>
            {kindControl}
          </div>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">{name}</h1>
          {tagline ? (
            <p className="mt-1.5 text-pretty text-base text-ink">{tagline}</p>
          ) : null}
          <p className="mt-3 text-pretty text-sm text-ink-muted">
            {description || "このブランドのプロフィール・デザインルール・アセットの一覧です。"}
          </p>
        </div>

        {facts.length > 0 ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
            {facts.map((fact) => {
              const reading = fact.reading ? profile.get(fact.reading) : null;
              return (
                <div key={fact.label} className="contents">
                  <dt className="text-ink-faint">{fact.label}</dt>
                  <dd className="min-w-0 truncate text-ink">
                    {fact.value}
                    {fact.reading ? (
                      <Standing reading={reading} path={fact.reading} onAdopt={onAdopt} />
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        <SocialRow profile={profile} />
      </div>
    </header>
  );
}
