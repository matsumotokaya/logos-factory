"use client";

import { useState } from "react";
import type {
  BrandFile,
  KnowledgeClaim,
  KnowledgeValue,
} from "@/app/api/brands/[id]/overview/route";
import { CAPTURE_FRAME, FRAME_GROUPS, frameField } from "@/lib/brand/capture-frame";

/**
 * What this brand is known to be, in three honest states.
 *
 * The page used to have two: a value, or a single line saying nothing had been
 * adopted. So a brand whose site had just been measured — two dozen readings,
 * a palette, a type scale — rendered as though nothing had happened. The three
 * states are:
 *
 *   採用          a value. Measured off the site, or decided by a person.
 *   推定          a claim and no value. We read something; nobody has confirmed
 *                 it is the rule. Shown with what kind of reading it was.
 *   まだわからない  the frame asks for this and neither exists. Named, not
 *                 hidden — a gap the product cannot see is a gap nobody fills
 *                 (§17.8: 不足リストがそのまま収集タスクになる).
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** Where a reading came from, in the words the rest of the product uses. */
const SOURCE_LABEL: Record<string, string> = {
  url_extraction: "サイトから読み取り",
  file_extraction: "資料から読み取り",
  llm_structuring: "AIが整理",
  llm_generation: "AIの提案",
  user_input: "手入力",
  derived: "他の値から導出",
  render_output: "出力から",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  confirmed: "確認済み",
  evidenced: "出典あり",
  inferred: "推定",
  unknown: "不明",
  suggested: "提案",
  adopted: "採用",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "あり" : "なし";
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === "object"
          ? ((item as Record<string, unknown>).heading as string) ??
            ((item as Record<string, unknown>).kind as string) ??
            ""
          : String(item),
      )
      .filter(Boolean)
      .join(" / ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["label", "name", "hex"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Colours are unreadable as six characters; arrays of them are a palette. */
function Swatches({ value }: { value: unknown }) {
  const hexes = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string" && HEX.test(item),
  );
  if (hexes.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 gap-1">
      {hexes.map((hex, index) => (
        <span
          key={`${hex}-${index}`}
          aria-hidden="true"
          className="inline-block size-4 rounded border border-hairline"
          style={{ backgroundColor: hex }}
        />
      ))}
    </span>
  );
}

type Row =
  | { state: "adopted"; path: string; label: string; value: unknown; useFor: string }
  | {
      state: "claimed";
      path: string;
      label: string;
      value: unknown;
      useFor: string;
      confidence: string;
      sourceKind: string;
    }
  | { state: "unknown"; path: string; label: string; useFor: string };

function buildRows(
  values: KnowledgeValue[],
  claims: KnowledgeClaim[],
): { rows: Row[]; adopted: number; claimed: number; unknown: number } {
  const valueByPath = new Map(values.map((value) => [value.fieldPath, value]));
  const claimByPath = new Map(claims.map((claim) => [claim.fieldPath, claim]));
  const rows: Row[] = [];

  for (const field of CAPTURE_FRAME) {
    const value = valueByPath.get(field.path);
    if (value) {
      rows.push({
        state: "adopted",
        path: field.path,
        label: field.label,
        value: value.value,
        useFor: field.useFor,
      });
      continue;
    }
    const claim = claimByPath.get(field.path);
    if (claim && claim.confidence !== "unknown") {
      rows.push({
        state: "claimed",
        path: field.path,
        label: field.label,
        value: claim.value,
        useFor: field.useFor,
        confidence: claim.confidence,
        sourceKind: claim.sourceKind,
      });
      continue;
    }
    rows.push({
      state: "unknown",
      path: field.path,
      label: field.label,
      useFor: field.useFor,
    });
  }

  // Anything recorded that the frame does not name yet. Kept visible rather
  // than dropped: a field nobody planned for is still something we know, and
  // silently hiding it is how the label map and the extractor drifted apart.
  for (const value of values) {
    if (frameField(value.fieldPath)) continue;
    rows.push({
      state: "adopted",
      path: value.fieldPath,
      label: value.fieldPath,
      value: value.value,
      useFor: "",
    });
  }

  return {
    rows,
    adopted: rows.filter((row) => row.state === "adopted").length,
    claimed: rows.filter((row) => row.state === "claimed").length,
    unknown: rows.filter((row) => row.state === "unknown").length,
  };
}

function groupOf(path: string): string {
  const match = FRAME_GROUPS.find((group) => path.startsWith(group.prefix));
  return match ? match.key : "other";
}

export default function BrandKnowledgePanel({
  values,
  claims,
}: {
  values: KnowledgeValue[];
  claims: KnowledgeClaim[];
}) {
  // Gaps are named, not itemised as empty cards: sixty blank tiles would bury
  // the dozen real answers. Opening the group turns the summary into the list.
  const [openGaps, setOpenGaps] = useState<Set<string>>(() => new Set());
  const { rows, adopted, claimed, unknown } = buildRows(values, claims);

  const groups = [...FRAME_GROUPS, { key: "other", label: "その他", prefix: "" }]
    .map((group) => ({
      ...group,
      rows: rows.filter((row) => groupOf(row.path) === group.key),
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-pretty text-xs text-ink-muted">
        <span className="font-semibold text-ink">{adopted}項目</span>を採用、
        <span className="font-semibold text-ink">{claimed}項目</span>を推定、
        <span className="font-semibold text-ink">{unknown}項目</span>はまだわかりません。
        推定は読み取っただけで、まだこのブランドの規則にはなっていません。
      </p>

      {groups.map((group) => {
        const known = group.rows.filter((row) => row.state !== "unknown");
        const gaps = group.rows.filter((row) => row.state === "unknown");
        const open = openGaps.has(group.key);
        return (
          <section key={group.key} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                {group.label}
              </h4>
              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              <span className="tabular-nums text-[11px] text-ink-faint">
                {known.length}/{group.rows.length}
              </span>
            </div>

            {known.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {known.map((row) => (
                  <li
                    key={row.path}
                    className="flex flex-col rounded-2xl border border-hairline bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                        {row.label}
                      </p>
                      {row.state === "claimed" ? (
                        <span
                          className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-muted"
                          title={`${SOURCE_LABEL[row.sourceKind] ?? row.sourceKind}・${
                            CONFIDENCE_LABEL[row.confidence] ?? row.confidence
                          }`}
                        >
                          推定
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 flex items-center gap-2 text-pretty text-sm font-semibold text-ink">
                      <Swatches value={row.value} />
                      <span className="min-w-0 break-words">
                        {formatValue(row.value)}
                      </span>
                    </p>
                    {row.state === "claimed" ? (
                      <p className="mt-1 text-[10px] text-ink-faint">
                        {SOURCE_LABEL[row.sourceKind] ?? row.sourceKind}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-[10px] text-ink-faint">
                      {row.path}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {gaps.length > 0 ? (
              <div className="rounded-2xl border border-dashed border-hairline px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGaps((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  aria-expanded={open}
                  className="text-left text-xs text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {gaps.length}項目はまだわかりません
                  <span className="ml-1 text-ink-faint">{open ? "（閉じる）" : "（見る）"}</span>
                </button>
                {open ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {gaps.map((row) => (
                      <li key={row.path} className="text-pretty text-[11px] text-ink-muted">
                        <span className="font-semibold text-ink">{row.label}</span>
                        {row.useFor ? (
                          <span className="text-ink-faint">　{row.useFor}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

const FILE_ROLE_LABEL: Record<string, string> = {
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

/**
 * The files the capture brought home.
 *
 * The screenshots come first and large, because their job is partly evidence:
 * a page that says 「このサイトを読みました」 and then shows you the frame it
 * rendered is making a claim it can back up. The rest is the raw material the
 * next video, LP or banner is built out of.
 */
export function BrandSiteFiles({ files }: { files: BrandFile[] }) {
  const fromSite = files.filter((file) => file.sourceKind === "url_fetch");
  const screenshots = fromSite.filter((file) => file.category === "screen");
  const imagery = fromSite.filter((file) => file.category !== "screen");

  if (fromSite.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-hairline px-4 py-5 text-pretty text-sm text-ink-muted">
        サイトから取り込んだ画像はまだありません。URLを登録して取り込むと、実際に描画した画面・キービジュアル・地紋がここに入ります。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {screenshots.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {screenshots.map((file) => (
            <li key={file.id} className="flex flex-col gap-1.5">
              <div className="overflow-hidden rounded-2xl border border-hairline bg-ink/[0.03]">
                {file.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived, same-origin private URL
                  <img
                    src={file.url}
                    alt={file.label}
                    className="block h-40 w-full object-cover object-top"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <p className="text-[11px] text-ink-muted">
                {FILE_ROLE_LABEL[file.role ?? ""] ?? file.label}
                {file.width && file.height ? (
                  <span className="text-ink-faint">
                    {" "}
                    {file.width}×{file.height}
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {imagery.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {imagery.map((file) => (
            <li key={file.id} className="flex flex-col gap-1.5">
              <div className="overflow-hidden rounded-xl border border-hairline bg-ink/[0.03]">
                {file.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived, same-origin private URL
                  <img
                    src={file.url}
                    alt={file.label}
                    className="block h-28 w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <p className="truncate text-[10px] text-ink-muted" title={file.label}>
                {FILE_ROLE_LABEL[file.role ?? ""] ?? "画像"}
                <span className="text-ink-faint"> {formatBytes(file.bytes)}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
