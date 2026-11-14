"use client";

// The top of the brand page, in the order a reader needs it (owner's layout,
// 2026-11-14): what this is — its standing and kind, its name — then, in the
// workspace, where its kit is published and how its information is updated
// (`status`); then what it says about itself: the catch copy, the facts and
// social accounts, the description. The mark sits beside all of it, large:
// it is the one thing a reader checks to know the capture read the right site.

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
  extraFacts = [],
  status,
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
  /** Workspace-only rows after the brand's facts. */
  extraFacts?: { label: string; value: ReactNode }[];
  /** Workspace-only, under the name: the kit's address and state, and the
   *  way into updating the brand's information. Absent on the public kit. */
  status?: ReactNode;
  onAdopt?: AdoptHandler;
}) {
  const tagline = profile.text("offering.tagline") ?? profile.text("voice.tagline");
  const operator = profile.text("identity.legal_name");
  const audience = profile.text("offering.audience");
  const background = profile.text("palette.background");

  type Fact = { label: string; value: ReactNode; reading?: string };
  const facts: Fact[] = ([
    operator ? { label: "運営", value: operator, reading: "identity.legal_name" } : null,
    industry ? { label: "業種", value: industry } : null,
    audience ? { label: "対象", value: audience, reading: "offering.audience" } : null,
    location ? { label: "所在地", value: location } : null,
    website
      ? {
          label: "Web",
          value: (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline decoration-ink-faint underline-offset-4 hover:decoration-ink"
            >
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              <svg viewBox="0 0 20 20" fill="none" aria-label="別タブで開く" className="size-3 text-ink-faint">
                <path d="M11 4h5v5M16 4l-7 7M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ),
        }
      : null,
  ] as (Fact | null)[])
    .filter((fact): fact is Fact => fact !== null)
    .concat(extraFacts);

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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="text-xs font-semibold text-ink-muted">{eyebrow ?? "BRAND"}</div>
            {kindControl}
          </div>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">{name}</h1>
        </div>

        {status}

        {tagline ? (
          <p className={status ? "border-t border-hairline pt-5 text-pretty font-display text-xl font-semibold text-ink" : "text-pretty font-display text-xl font-semibold text-ink"}>
            {tagline}
          </p>
        ) : null}

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

        <p className="text-pretty text-sm leading-relaxed text-ink-muted">
          {description || "このブランドの説明は、まだ読み取れていません。"}
        </p>
      </div>
    </header>
  );
}
