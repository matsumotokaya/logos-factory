"use client";

// What the brand looks like, as four cards that each SHOW the thing before
// they describe it.
//
// The previous panel listed every reading as an identical tile — the primary
// colour, the border width and the container width all at the same weight —
// so nobody could tell at a glance whether the capture had worked. Each card
// here has one hero (the palette as a band, the type as a specimen, the shapes
// as a rendered button and card, the structure as the nav) and puts the
// measurements beside it as small print. The exhaustive three-state list is
// still on the page, under 「すべての項目」.

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { fontFamilies, isGuess, isHex, type BrandProfile, type Reading } from "@/lib/brand/profile";

const SOURCE_LABEL: Record<string, string> = {
  url_extraction: "サイトから読み取り",
  file_extraction: "資料から読み取り",
  llm_structuring: "AIが整理",
  llm_generation: "AIの提案",
  user_input: "手入力",
  derived: "他の値から導出",
  render_output: "出力から",
};

/** 推定 → 採用, offered where the workspace can act on it. */
export type AdoptHandler = (fieldPath: string) => void;

/**
 * A reading's standing, as the one word the rest of the product uses — and,
 * in the workspace, the one click that changes it. A claim never reaches the
 * published kit (docs/product.md §2.1), so the chip is also the to-do.
 */
export function Standing({
  reading,
  path,
  onAdopt,
}: {
  reading: Reading | null;
  path: string;
  onAdopt?: AdoptHandler;
}) {
  if (!isGuess(reading) || !reading) return null;
  const source = SOURCE_LABEL[reading.sourceKind ?? ""] ?? reading.sourceKind ?? "推定";
  if (onAdopt) {
    return (
      <button
        type="button"
        onClick={() => onAdopt(path)}
        title={`${source}。押すと採用し、公開版に載ります`}
        className="ml-1.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-800 transition hover:border-ink hover:bg-ink hover:text-paper"
      >
        推定 → 採用
      </button>
    );
  }
  return (
    <span
      className="ml-1.5 rounded-full border border-hairline px-1.5 py-px text-[9px] text-ink-muted"
      title={source}
    >
      推定
    </span>
  );
}

type DetailRow = { label: string; path: string; format?: (value: unknown) => string | null };

function formatPlain(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String((item as Record<string, unknown>).heading ?? (item as Record<string, unknown>).kind ?? "")
          : String(item),
    );
    return items.filter(Boolean).join(" / ") || null;
  }
  return null;
}

/** The small print beside a hero: label / value, 「—」 when not read. */
function Details({
  profile,
  rows,
  onAdopt,
}: {
  profile: BrandProfile;
  rows: DetailRow[];
  onAdopt?: AdoptHandler;
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[11px]">
      {rows.map((row) => {
        const reading = profile.get(row.path);
        const text = reading ? (row.format ?? formatPlain)(reading.value) : null;
        return (
          <div key={row.path} className="contents">
            <dt className="text-ink-faint">{row.label}</dt>
            <dd className={cn("min-w-0 break-words", text ? "text-ink" : "text-ink-faint")}>
              {text ?? "—"}
              {text ? <Standing reading={reading} path={row.path} onAdopt={onAdopt} /> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

type CardProps = { profile: BrandProfile; onAdopt?: AdoptHandler };

function FacetCard({
  title,
  useFor,
  measured,
  children,
  details,
}: {
  title: string;
  useFor: string;
  /** How many of this card's fields were read, out of how many asked. */
  measured: { read: number; asked: number };
  children: React.ReactNode;
  details: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-hairline bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <span className="text-[11px] text-ink-faint">{useFor}</span>
        </div>
        <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">
          {measured.read}/{measured.asked}
        </span>
      </div>
      {measured.read === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline px-4 py-4 text-[12px] text-ink-muted">
          まだ読み取れていません。
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0">{children}</div>
          <div className="min-w-0 border-t border-hairline pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
            {details}
          </div>
        </div>
      )}
    </section>
  );
}

function countRead(profile: BrandProfile, paths: string[]): { read: number; asked: number } {
  return {
    read: paths.filter((path) => profile.get(path) !== null).length,
    asked: paths.length,
  };
}

// ---------------------------------------------------------------------------
// 色

const PALETTE_ROLES = [
  { path: "palette.primary", label: "プライマリ", grow: 3 },
  { path: "palette.accent", label: "アクセント", grow: 2 },
  { path: "palette.text", label: "文字", grow: 1 },
  { path: "palette.background", label: "背景", grow: 2 },
  { path: "palette.surface", label: "面", grow: 1 },
  { path: "palette.border", label: "罫線", grow: 1 },
];

const PALETTE_PATHS = [
  ...PALETTE_ROLES.map((role) => role.path),
  "palette.gradient",
  "palette.mode",
  "palette.source",
];

/** Text that reads on this colour: dark ink on light, paper on dark. */
function inkOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "rgba(16,16,18,0.8)" : "rgba(255,255,255,0.9)";
}

export function PaletteCard({ profile, onAdopt }: CardProps) {
  const roles = PALETTE_ROLES.map((role) => ({ ...role, reading: profile.get(role.path) })).filter(
    (role): role is typeof role & { reading: Reading } => isHex(role.reading?.value),
  );
  const gradient = profile.list("palette.gradient").filter(isHex);
  return (
    <FacetCard
      title="色"
      useFor="LPのボタンと地、動画のマーク面、字幕の色"
      measured={countRead(profile, PALETTE_PATHS)}
      details={
        <Details
          profile={profile}
          onAdopt={onAdopt}
          rows={[
            { label: "明暗", path: "palette.mode" },
            { label: "出所", path: "palette.source" },
            { label: "グラデ", path: "palette.gradient" },
            { label: "罫線", path: "palette.border" },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex h-28 overflow-hidden rounded-xl border border-hairline">
          {roles.map((role) => {
            const hex = role.reading.value as string;
            return (
              <div
                key={role.path}
                className="flex min-w-0 flex-col justify-end p-2"
                style={{ backgroundColor: hex, flexGrow: role.grow, flexBasis: 0, color: inkOn(hex) }}
                title={`${role.label} ${hex}`}
              >
                <span className="truncate text-[10px] font-semibold">{role.label}</span>
                <span className="truncate font-mono text-[10px] opacity-80">{hex.toLowerCase()}</span>
              </div>
            );
          })}
        </div>
        {gradient.length > 1 ? (
          <div
            className="h-5 rounded-lg border border-hairline"
            style={{ background: `linear-gradient(90deg, ${gradient.join(", ")})` }}
            title={`グラデーション ${gradient.join(" → ")}`}
          />
        ) : null}
      </div>
    </FacetCard>
  );
}

// ---------------------------------------------------------------------------
// 書体

const TYPE_PATHS = [
  "typography.heading_font",
  "typography.body_font",
  "typography.heading_weight",
  "typography.body_weight",
  "typography.heading_size",
  "typography.body_size",
  "typography.line_height",
  "typography.letter_spacing",
  "typography.font_source",
  "typography.font_style",
];

/**
 * Ask Google Fonts for each family by name, one link per family so an unknown
 * one fails alone. A family the browser already has costs one 404; a family
 * it does not have is the difference between a specimen and a lie.
 */
function useWebFonts(families: string[]) {
  useEffect(() => {
    for (const family of families) {
      const id = `brand-font-${family.replace(/\s+/g, "-").toLowerCase()}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;700&display=swap`;
      document.head.appendChild(link);
    }
  }, [families]);
}

export function TypeCard({
  profile,
  onAdopt,
  headline,
  body,
}: CardProps & {
  /** What to set the specimen in — the brand's own words, never lorem ipsum. */
  headline: string;
  body: string;
}) {
  const headingFont = profile.text("typography.heading_font");
  const bodyFont = profile.text("typography.body_font");
  const families = [...new Set([...fontFamilies(headingFont), ...fontFamilies(bodyFont)])];
  useWebFonts(families);
  const textColor = profile.text("palette.text");
  return (
    <FacetCard
      title="書体"
      useFor="LPの見出しと本文、動画のタイトルと字幕"
      measured={countRead(profile, TYPE_PATHS)}
      details={
        <Details
          profile={profile}
          onAdopt={onAdopt}
          rows={[
            { label: "見出し", path: "typography.heading_font" },
            { label: "本文", path: "typography.body_font" },
            { label: "太さ", path: "typography.heading_weight", format: () => [profile.text("typography.heading_weight"), profile.text("typography.body_weight")].filter(Boolean).join(" / ") || null },
            { label: "大きさ", path: "typography.heading_size", format: () => [profile.text("typography.heading_size"), profile.text("typography.body_size")].filter(Boolean).join(" / ") || null },
            { label: "行送り", path: "typography.line_height" },
            { label: "字間", path: "typography.letter_spacing" },
            { label: "性格", path: "typography.font_style" },
            { label: "入手先", path: "typography.font_source", format: (value) => (Array.isArray(value) ? `${value.filter(Boolean).length}件の @font-face` : formatPlain(value)) },
          ]}
        />
      }
    >
      <div
        className="flex flex-col gap-3 rounded-xl border border-hairline px-5 py-5"
        style={{ color: isHex(textColor) ? textColor : undefined }}
      >
        <p
          className="text-balance leading-tight"
          style={{
            fontFamily: headingFont ?? undefined,
            fontWeight: Number(profile.text("typography.heading_weight") ?? 700) || 700,
            fontSize: "clamp(22px, 2.4vw, 32px)",
            letterSpacing: profile.text("typography.letter_spacing") ?? undefined,
          }}
        >
          {headline}
        </p>
        <p
          className="text-pretty"
          style={{
            fontFamily: bodyFont ?? undefined,
            fontWeight: Number(profile.text("typography.body_weight") ?? 400) || 400,
            fontSize: profile.text("typography.body_size") ?? "15px",
            lineHeight: profile.text("typography.line_height") ?? undefined,
          }}
        >
          {body}
        </p>
        {families.length > 0 ? (
          <p className="mt-1 text-[10px] text-ink-faint" style={{ fontFamily: "inherit" }}>
            {families.join(" · ")}
          </p>
        ) : null}
      </div>
    </FacetCard>
  );
}

// ---------------------------------------------------------------------------
// 形と余白

const TOKEN_PATHS = [
  "tokens.button_radius",
  "tokens.button_padding",
  "tokens.button_weight",
  "tokens.button_shadow",
  "tokens.card_radius",
  "tokens.card_shadow",
  "tokens.border_width",
  "tokens.section_spacing",
  "tokens.container_width",
];

export function ShapeCard({ profile, onAdopt, headline }: CardProps & { headline: string }) {
  const primary = profile.text("palette.primary");
  const surface = profile.text("palette.surface") ?? profile.text("palette.background");
  const border = profile.text("palette.border");
  const text = profile.text("palette.text");
  const cta = profile.text("layout.cta_label") ?? "詳しく見る";
  const buttonShadow = profile.text("tokens.button_shadow");
  const cardShadow = profile.text("tokens.card_shadow");
  return (
    <FacetCard
      title="形と余白"
      useFor="ボタンとカードの形、版面の幅"
      measured={countRead(profile, TOKEN_PATHS)}
      details={
        <Details
          profile={profile}
          onAdopt={onAdopt}
          rows={[
            { label: "角の丸み", path: "tokens.button_radius" },
            { label: "余白", path: "tokens.button_padding" },
            { label: "文字", path: "tokens.button_weight" },
            { label: "影", path: "tokens.button_shadow" },
            { label: "カード", path: "tokens.card_radius" },
            { label: "カードの影", path: "tokens.card_shadow" },
            { label: "罫線", path: "tokens.border_width" },
            { label: "節の間", path: "tokens.section_spacing" },
            { label: "幅", path: "tokens.container_width" },
          ]}
        />
      }
    >
      {/* The site's own button inside the site's own card, in its own colours. */}
      <div
        className="flex h-full min-h-28 items-center justify-center rounded-xl border border-hairline bg-ink/[0.02] p-5"
      >
        <div
          className="flex w-full max-w-sm flex-col gap-3 p-5"
          style={{
            backgroundColor: isHex(surface) ? surface : "#ffffff",
            borderRadius: profile.text("tokens.card_radius") ?? "12px",
            boxShadow: cardShadow && cardShadow !== "none" ? cardShadow : undefined,
            border: `${profile.text("tokens.border_width") ?? "1px"} solid ${isHex(border) ? border : "rgba(16,16,18,0.14)"}`,
            color: isHex(text) ? text : undefined,
          }}
        >
          <p className="text-[13px] font-semibold">{headline}</p>
          <span
            className="inline-block w-fit text-[12px]"
            style={{
              backgroundColor: isHex(primary) ? primary : "#101012",
              color: isHex(primary) ? inkOn(primary) : "#ffffff",
              borderRadius: profile.text("tokens.button_radius") ?? "8px",
              padding: profile.text("tokens.button_padding") ?? "8px 20px",
              fontWeight: Number(profile.text("tokens.button_weight") ?? 600) || 600,
              boxShadow: buttonShadow && buttonShadow !== "none" ? buttonShadow : undefined,
            }}
          >
            {cta}
          </span>
        </div>
      </div>
    </FacetCard>
  );
}

// ---------------------------------------------------------------------------
// 構成

const LAYOUT_PATHS = [
  "layout.nav_items",
  "layout.sections",
  "layout.hero_kind",
  "layout.cta_label",
  "layout.density",
];

const HERO_KIND_LABEL: Record<string, string> = {
  gradient: "グラデーション",
  photo: "写真",
  solid: "べた塗り",
  video: "動画",
  illustration: "イラスト",
};

export function StructureCard({ profile, onAdopt }: CardProps) {
  const nav = profile.list("layout.nav_items");
  const sections = (() => {
    const value = profile.get("layout.sections")?.value;
    return Array.isArray(value)
      ? value
          .map((item) =>
            item && typeof item === "object"
              ? String((item as Record<string, unknown>).heading ?? "")
              : String(item ?? ""),
          )
          .filter(Boolean)
      : [];
  })();
  return (
    <FacetCard
      title="構成"
      useFor="LPの節の並び、ヘッダー、締めの言葉"
      measured={countRead(profile, LAYOUT_PATHS)}
      details={
        <Details
          profile={profile}
          onAdopt={onAdopt}
          rows={[
            { label: "ヒーロー", path: "layout.hero_kind", format: (value) => (typeof value === "string" ? (HERO_KIND_LABEL[value] ?? value) : null) },
            { label: "CTA", path: "layout.cta_label" },
            { label: "密度", path: "layout.density" },
            { label: "幅", path: "tokens.container_width" },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {nav.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">ナビゲーション</p>
            <ul className="flex flex-wrap gap-1.5">
              {nav.map((item, index) => (
                <li key={`${item}-${index}`} className="rounded-full border border-hairline px-2.5 py-0.5 text-[11px] text-ink">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {sections.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">セクション</p>
            <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink">
              {sections.map((heading, index) => (
                <li key={`${heading}-${index}`}>
                  <span className="mr-1 font-mono text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                  {heading}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </FacetCard>
  );
}
