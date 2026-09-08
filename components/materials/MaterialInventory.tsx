"use client";

// The material inventory: what this deliverable is made of, and what the brand
// already had.
//
// docs/asset-normalization.md §9. One implementation, two places — under the
// storyboard and inside the mapping drawer. Two implementations of one list is
// how a screen and a drawer end up disagreeing about what a video contains,
// which is exactly the bug videoState() was written to end.
//
// TWO TIERS, because the injection has two layers (§7). The base is what every
// deliverable of this brand starts from; the upper tier is what this one added.
// Showing them as one list would hide the thing the model is for — that a
// company's assets accumulate, and that a collaboration can decline them.
//
// GROUPED LIKE A DIRECTORY, because the naming scheme (§8) puts materials in
// `assets/<category>/` and the export unpacks that way. The screen, the ZIP and
// the export should read as one map rather than three arrangements of the same
// files.
//
// The row is read-only about PLACEMENT and editable about IDENTITY. Where a
// file is used is corrected in the storyboard panel that shows it; what a file
// IS is corrected here. Two editable copies of one value is how they diverge.

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_HINTS,
  MATERIAL_CATEGORY_LABELS,
  materialCategoryLabel,
  type MaterialCategory,
} from "@/lib/materials/category";
import { materialPath, uniqueMaterialPaths } from "@/lib/materials/naming";
import { normalizationProposal } from "@/lib/materials/optical";
import type {
  InventoryMaterial,
  InventoryPayload,
} from "@/app/api/brands/[id]/videos/[videoId]/inventory/route";
import DeleteAction from "./DeleteAction";
import type { MaterialBody } from "./MaterialContents";
import MaterialRow from "./MaterialRow";

/** Where a file came from, in the second person rather than in schema words. */
const SOURCE_LABEL: Record<string, string> = {
  upload: "アップロード",
  url_fetch: "サイトから取得",
  ai_generated: "生成",
  derived: "ロゴ正本から",
  render_output: "書き出しから",
};

/** The medium, for the rows a category cannot describe (audio, fonts). */
const KIND_LABEL: Record<string, string> = {
  logo: "ロゴ",
  photo: "画像",
  keyvisual: "画像",
  illustration: "画像",
  audio: "音声",
  video: "動画",
  document: "資料",
  font: "フォント",
  other: "その他",
};

const readableSize = (bytes: number | null): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Group into the folders an export would write.
 *
 * Names and folders come from lib/materials/naming.ts, the same function the
 * ZIP uses, so 「書き出したものと画面が同じ整理」 is true by construction rather
 * than by two implementations agreeing. Uniqueness is resolved per tier for the
 * same reason: what the screen shows is what unpacks.
 */
function groupByFolder(materials: InventoryMaterial[]) {
  const paths = uniqueMaterialPaths(materials);
  const folders = new Map<string, Array<{ material: InventoryMaterial; path: string }>>();
  for (const material of materials) {
    const path = paths.get(material.id) ?? materialPath(material);
    const folder = path.slice("assets/".length, path.lastIndexOf("/"));
    const bucket = folders.get(folder);
    const row = { material, path };
    if (bucket) bucket.push(row);
    else folders.set(folder, [row]);
  }
  return [...folders.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function CategoryPicker({
  material,
  disabled,
  onChange,
}: {
  material: InventoryMaterial;
  disabled: boolean;
  onChange: (category: MaterialCategory | null) => void;
}) {
  return (
    <label className="shrink-0">
      <span className="sr-only">{material.label} の分類</span>
      <select
        value={material.category ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : (event.target.value as MaterialCategory))
        }
        title={
          material.category
            ? MATERIAL_CATEGORY_HINTS[material.category as MaterialCategory]
            : "この素材が何かを選ぶと、次の実行でも同じ扱いになります"
        }
        className={cn(
          "rounded border px-1.5 py-0.5 text-[11px] transition-colors",
          // Amber is this product's colour for "decided, not yet confirmed" —
          // the same meaning the unreflected-change badge carries. A guess is
          // not an error, so it is never red.
          material.category_source === "user"
            ? "border-hairline bg-white text-ink"
            : material.category
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-dashed border-hairline bg-white text-ink-faint",
          disabled && "opacity-50",
        )}
      >
        <option value="">未分類</option>
        {MATERIAL_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {MATERIAL_CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Copying a material to the brand library, in one click.
 *
 * One, because nothing is lost (docs/asset-normalization.md §12, 2026-09-08):
 * the video keeps its file and the brand receives its own copy, which can be
 * deleted from the brand's list like any other file there. The two-click shape
 * belonged to the old model, where promotion moved the row and could not be
 * undone.
 */
function PromoteAction({
  disabled,
  onPromote,
}: {
  disabled: boolean;
  onPromote: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPromote}
      title="この素材のコピーをブランドの基盤に置きます。この動画の素材はそのまま残ります"
      className="shrink-0 text-[11px] text-ink-faint underline underline-offset-2 transition-colors hover:text-accent disabled:opacity-50"
    >
      ブランドへコピー
    </button>
  );
}

/**
 * The normalisation offer: 「この形は使いにくい。直したものも作りますか?」
 *
 * docs/asset-normalization.md §11 — proposed, never done silently. The two
 * measurements that trigger it (a white plate, a frame mostly empty) are facts
 * of the file, but 「この余白はデザインの一部か」 is a judgement, and the person
 * who uploaded the file is the one who has it.
 *
 * Not a dialog and not two clicks, unlike promotion: nothing is replaced and
 * nothing is lost. The original stays in the list, still pinned, and the derived
 * copy appears beside it — which is what makes automatic trimming safe to offer.
 */
function NormalizeAction({
  reasons,
  disabled,
  onNormalize,
}: {
  reasons: string[];
  disabled: boolean;
  onNormalize: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5">
      <p className="min-w-0 flex-1 text-[11px] text-amber-900">
        {reasons.join("、")}。正規化バージョンも作成しますか？
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onNormalize}
        className="shrink-0 text-[11px] font-semibold text-amber-900 underline underline-offset-2 disabled:opacity-50"
      >
        作成する
      </button>
    </div>
  );
}

/**
 * One inventory row, drawn by the shared material row.
 *
 * The shared row owns what a material IS — its name, its measurements, and the
 * container that opens to the file itself plus whatever came out of it. What is
 * particular to the inventory goes in the slots: the classification, promotion
 * to the brand, where the film uses it, and the normalisation offer.
 */
function InventoryRow({
  material,
  fileName,
  uses,
  overriddenBy,
  normalizedAs,
  normalizedFrom,
  derived,
  disabled,
  onClassify,
  onPromote,
  onNormalize,
  onDelete,
}: {
  material: InventoryMaterial;
  /** The normalised name — what the export writes and the download hands over. */
  fileName: string;
  uses: InventoryPayload["usage"][string] | undefined;
  /** Set when a material in the upper tier fills the same place as this one. */
  overriddenBy?: string;
  /** The normalised copy made from this file, if one exists. */
  normalizedAs?: string;
  /** The file this one was cut from, if it is itself a normalised copy. */
  normalizedFrom?: string;
  /** What came out of this file: a PDF's images (§9.4). */
  derived?: readonly MaterialBody[];
  disabled: boolean;
  onClassify: (id: string, category: MaterialCategory | null) => void;
  /** Widen to the brand. Absent on rows that are already there. */
  onPromote?: (id: string) => void;
  /** Make the normalised copy. Absent = the action is not offered. */
  onNormalize?: (id: string) => void;
  /** Delete the file. Absent on the brand tier, which the video may not touch. */
  onDelete?: (id: string) => void;
}) {
  const measured =
    material.width && material.height ? `${material.width}×${material.height}` : null;
  // Offered only where the measurements say there is something to gain, and only
  // once: a file that already has a normalised copy has been answered.
  const proposal = normalizationProposal({
    kind: material.kind,
    category: material.category,
    media_type: material.media_type,
    width: material.width,
    height: material.height,
    opaque: material.opaque,
    inkRatio: material.ink_ratio,
    trimWidth: material.trim_width,
    trimHeight: material.trim_height,
  });
  const offer = Boolean(onNormalize) && proposal.propose && !normalizedAs && !normalizedFrom;

  return (
    <MaterialRow
      data={{
        id: material.id,
        name: fileName,
        originalName: material.label,
        media_type: material.media_type,
        bytes: material.bytes,
        width: material.width,
        height: material.height,
        url: material.url,
      }}
      derived={derived}
      actions={
        <>
          <CategoryPicker
            material={material}
            disabled={disabled}
            onChange={(category) => onClassify(material.id, category)}
          />
          {/* The same bin the input drawer has, doing the same thing: the two
              lists now lose a file at the same moment (§9.4). Absent on the
              brand tier — that library has its own screen and its own rung. */}
          {onDelete ? (
            <DeleteAction
              name={fileName}
              disabled={disabled}
              onDelete={() => onDelete(material.id)}
            />
          ) : null}
        </>
      }
      meta={
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-faint">
            <span>{KIND_LABEL[material.kind] ?? material.kind}</span>
            <span>{SOURCE_LABEL[material.source_kind] ?? material.source_kind}</span>
            {measured ? <span className="font-mono tabular-nums">{measured}</span> : null}
            {/* Only said when it is true and load-bearing: an opaque logo is the
                one that must never be knocked out (§3). Silence means "we have
                not measured it", which is a third state, not "transparent". */}
            {material.kind === "logo" && material.opaque === true ? <span>地あり</span> : null}
            {material.bytes ? (
              <span className="font-mono tabular-nums">{readableSize(material.bytes)}</span>
            ) : null}
          </div>
          <div className="flex items-baseline gap-3">
            {uses && uses.length > 0 ? (
              <p className="min-w-0 flex-1 text-[11px] text-ink-muted">
                {uses.map((use) => use.label).join("、")}
              </p>
            ) : (
              // Not a defect. A deck is read, never shown; a photograph may
              // simply not have been placed yet. Saying so beats an empty column.
              <p className="min-w-0 flex-1 text-[11px] text-ink-faint">
                この動画には出ていません
              </p>
            )}
            {onPromote ? (
              <PromoteAction disabled={disabled} onPromote={() => onPromote(material.id)} />
            ) : null}
          </div>
          {overriddenBy ? (
            <p className="text-[11px] text-amber-800">
              この動画では {overriddenBy} を使用中（この素材を上書き）
            </p>
          ) : null}
          {normalizedAs ? (
            <p className="text-[11px] text-ink-muted">正規化版あり: {normalizedAs}</p>
          ) : null}
          {normalizedFrom ? (
            <p className="text-[11px] text-ink-muted">{normalizedFrom} の正規化版</p>
          ) : null}
          {offer && onNormalize ? (
            <NormalizeAction
              reasons={proposal.reasons}
              disabled={disabled}
              onNormalize={() => onNormalize(material.id)}
            />
          ) : null}
        </div>
      }
    />
  );
}

function Tier({
  title,
  note,
  materials,
  usage,
  overrides,
  derivations,
  disabled,
  onClassify,
  onPromote,
  onNormalize,
  onDelete,
  empty,
}: {
  title: string;
  note: string;
  materials: InventoryMaterial[];
  usage: InventoryPayload["usage"];
  overrides?: Map<string, string>;
  /** Both directions of the normalisation pair, keyed by material id. */
  derivations?: Derivations;
  disabled: boolean;
  onClassify: (id: string, category: MaterialCategory | null) => void;
  onPromote?: (id: string) => void;
  onNormalize?: (id: string) => void;
  onDelete?: (id: string) => void;
  empty: string;
}) {
  // A PDF's images belong INSIDE the PDF's row, not beside it: a hundred
  // slivers between the photographs would bury the photographs (§9.4). They
  // are the same contents the input drawer opens, because both screens ask the
  // shared row to draw them.
  const pdfChildren = new Map<string, MaterialBody[]>();
  for (const material of materials) {
    if (material.origin !== "pdf" || !material.derived_from_material_id || !material.url) continue;
    const parent = material.derived_from_material_id;
    const list = pdfChildren.get(parent) ?? [];
    list.push({
      id: material.id,
      label: material.label,
      media_type: material.media_type,
      bytes: material.bytes,
      width: material.width,
      height: material.height,
      url: material.url,
    });
    pdfChildren.set(parent, list);
  }
  const shown = materials.filter((material) => material.origin !== "pdf");
  const folders = groupByFolder(shown);
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h4 className="text-[12px] font-medium text-ink">
          {title}
          <span className="ml-1.5 font-normal tabular-nums text-ink-faint">
            {shown.length}
          </span>
        </h4>
        <p className="text-[11px] text-ink-faint">{note}</p>
      </div>
      {folders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[11px] text-ink-faint">
          {empty}
        </p>
      ) : (
        folders.map(([folder, rows]) => (
          <div key={folder} className="flex flex-col gap-1">
            <p className="font-mono text-[11px] text-ink-faint">
              assets/{folder}/
              <span className="ml-1.5 font-sans">
                {folder === "unsorted" ? "未分類" : materialCategoryLabel(folder)}
              </span>
            </p>
            <ul className="flex flex-col gap-1 pl-3">
              {rows.map(({ material, path }) => (
                <InventoryRow
                  key={material.id}
                  material={material}
                  fileName={path.slice(path.lastIndexOf("/") + 1)}
                  uses={usage[material.id]}
                  overriddenBy={overrides?.get(material.id)}
                  normalizedAs={derivations?.normalizedAs.get(material.id)}
                  normalizedFrom={derivations?.normalizedFrom.get(material.id)}
                  derived={pdfChildren.get(material.id)}
                  disabled={disabled}
                  onClassify={onClassify}
                  onPromote={onPromote}
                  onNormalize={onNormalize}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export interface Derivations {
  /** original id → the displayed name of its normalised copy. */
  normalizedAs: Map<string, string>;
  /** copy id → the displayed name of the file it was cut from. */
  normalizedFrom: Map<string, string>;
}

/**
 * The normalisation pairs present in this inventory, in both directions.
 *
 * Read off the rows rather than fetched: `derived_from_material_id` is already on
 * the copy, so the pair is a fact of the list. Names come from the same
 * derivation the rest of the screen uses, so a row refers to its partner by the
 * name the person is looking at rather than by the label it was uploaded with.
 */
function derivationMap(payload: InventoryPayload): Derivations {
  const rows = [...payload.own, ...payload.base];
  const paths = uniqueMaterialPaths(rows);
  const nameOf = (material: InventoryMaterial): string => {
    const path = paths.get(material.id) ?? materialPath(material);
    return path.slice(path.lastIndexOf("/") + 1);
  };
  const byId = new Map(rows.map((material) => [material.id, material]));
  const normalizedAs = new Map<string, string>();
  const normalizedFrom = new Map<string, string>();
  for (const material of rows) {
    const originalId = material.derived_from_material_id;
    // Derived, but not a normalisation: an image out of a PDF (§9.4).
    if (!originalId || material.origin === "pdf") continue;
    const original = byId.get(originalId);
    normalizedAs.set(originalId, nameOf(material));
    // The original may sit outside this inventory (a brand file cut for another
    // deliverable). Saying 「正規化版」 without naming the source beats silence.
    normalizedFrom.set(material.id, original ? nameOf(original) : material.label);
  }
  return { normalizedAs, normalizedFrom };
}

/**
 * Which base materials this deliverable has displaced.
 *
 * A base file is overridden when something in the upper tier occupies a place
 * it would have filled — the same role, not merely the same category. Only the
 * mark is decidable today, because that is the only base slot that exists
 * (§7.2 has yet to name the others), so the check is narrow on purpose: a
 * guess here would print a warning about a conflict that is not happening.
 */
function overrideMap(payload: InventoryPayload): Map<string, string> {
  const overrides = new Map<string, string>();
  const usedByOwn = payload.own.filter((material) => payload.usage[material.id]?.length);
  for (const base of payload.base) {
    if (base.kind !== "logo") continue;
    // The base mark is displaced only when it is not itself on screen and
    // another mark is.
    if (payload.usage[base.id]?.length) continue;
    const replacement = usedByOwn.find((material) => material.kind === "logo");
    if (replacement) overrides.set(base.id, replacement.label);
  }
  return overrides;
}

export default function MaterialInventory({
  payload,
  busy,
  onClassify,
  onDelete,
  onPromote,
  onNormalize,
  baseOff,
  onToggleBase,
}: {
  payload: InventoryPayload | null;
  busy?: boolean;
  /** Correct what a file is. Absent = read only. */
  onClassify?: (id: string, category: MaterialCategory | null) => void;
  /** Widen a material to the brand. Absent = the action is not offered. */
  onPromote?: (id: string) => void;
  /** Make the normalised copy of an awkward file. Absent = not offered. */
  onNormalize?: (id: string) => void;
  /**
   * Delete a file this deliverable holds, with whatever came out of it (§9.4).
   *
   * Offered on the upper tier only. The brand's base is deleted from the brand
   * library, where the permission for it is checked: a video must not be able
   * to remove the mark every other deliverable draws.
   */
  onDelete?: (id: string) => void;
  /** Whether this deliverable has declined the brand's base. */
  baseOff?: boolean;
  /** Decline or restore it. Absent = the switch is not offered (the template
   *  has no base to decline). */
  onToggleBase?: (off: boolean) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  if (!payload) {
    return <p className="text-[12px] text-ink-faint">素材を読み込み中…</p>;
  }

  const classify = (id: string, category: MaterialCategory | null) => {
    if (!onClassify) return;
    setSaving(id);
    onClassify(id, category);
    // The parent refetches; clearing here keeps the row usable if it does not.
    setTimeout(() => setSaving((current) => (current === id ? null : current)), 1200);
  };

  const disabled = Boolean(busy) || !onClassify;
  const overrides = overrideMap(payload);
  const derivations = derivationMap(payload);

  return (
    <div className="flex flex-col gap-5">
      <Tier
        title="この動画の素材"
        note="この動画だけが持っているもの。作成時にブランドから引き継いだものもコピーで、以後ブランド側の変更は届きません。ずっと使うものは「ブランドへコピー」すると、次に作るものに引き継がれます。"
        materials={payload.own}
        usage={payload.usage}
        derivations={derivations}
        disabled={disabled || saving !== null}
        onClassify={classify}
        onPromote={onPromote}
        onNormalize={onNormalize}
        onDelete={onDelete}
        empty="まだ素材がありません。パイプラインの「入力」から資料や写真を入れてください。"
      />
      {/* Declining the base is a property of THIS deliverable, so it sits on
          the tier it declines rather than in the header with the film-wide
          controls (docs/asset-normalization.md §7.1). */}
      {onToggleBase ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-3 py-2.5",
            baseOff ? "border-amber-300 bg-amber-50" : "border-hairline",
          )}
        >
          <label className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <input
              type="checkbox"
              checked={!baseOff}
              disabled={disabled}
              onChange={(event) => onToggleBase(!event.target.checked)}
              className="size-3.5 accent-ink"
            />
            ブランドの基盤を使う
          </label>
          <p className="min-w-0 flex-1 text-[11px] text-ink-muted">
            {baseOff
              ? "この動画は自社のマークと配色・書体を使いません。テンプレートの地で描かれます。イベント名や日程などの事実は残ります。"
              : "このブランドのマークと、採用済みの配色・書体で描きます。コラボレーションなど、自社の雰囲気を出さないときは外せます。"}
          </p>
        </div>
      ) : null}
      <Tier
        title="ブランドの基盤"
        // Says what is true today, not what §7.1 will make true. The mark is
        // already installed into every new event video (seedEventCmFromBrand);
        // nothing else is injected yet. Promising 「最初から入ります」 for a
        // photograph would be a promise the code does not keep.
        note={
          baseOff
            ? "この動画では使いません。ブランドのものとしては残っているので、次に作るものからは使えます。"
            : "ブランドが持っているもの。新しい動画を作るとき、マークはここからコピーで入ります。ここを変えても、できている動画は変わりません。"
        }
        materials={payload.base}
        usage={payload.usage}
        overrides={overrides}
        derivations={derivations}
        disabled={disabled || saving !== null}
        onClassify={classify}
        onNormalize={onNormalize}
        empty="このブランドにはまだ基盤の素材がありません。上の素材を「ブランドへコピー」すると、次に作るものに引き継がれます。"
      />
    </div>
  );
}
