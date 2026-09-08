"use client";

// The injection port for stage ①. Everything the brand is understood from
// arrives here: the site it was read from, brand books, guideline pages,
// pasted notes. Adding one makes the stages after it stale, which is the
// signal that the output is now behind its inputs.

import { useRef, useState } from "react";
import type { MaterialBody } from "@/components/materials/MaterialContents";
import DeleteAction from "@/components/materials/DeleteAction";
import MaterialRow from "@/components/materials/MaterialRow";
import { cn } from "@/lib/cn";

export interface BrandMaterial {
  id: string;
  kind: string;
  label: string;
  media_type: string | null;
  bytes: number | null;
  source_kind: string;
  source_url: string | null;
  /** Measured at intake. Null when nothing could be measured. */
  width?: number | null;
  height?: number | null;
  /** Signed URL for its own bytes, so the row can hand the file over (§9.4). */
  url?: string | null;
  /** Set on an image taken out of a PDF: the PDF's row (§9.4). */
  derived_from_material_id?: string | null;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  document: "資料",
  photo: "画像",
  logo: "ロゴ",
  font: "フォント",
  other: "その他",
};

const ACCEPT = ".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,.svg";

function readableSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function toBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function MaterialIntake({
  websiteLabel,
  materials,
  busy,
  onUploadFile,
  onAddNote,
  onRemove,
  onRefetchSite,
}: {
  websiteLabel: string | null;
  materials: BrandMaterial[];
  busy: boolean;
  onUploadFile: (file: File, data: string) => Promise<void>;
  onAddNote: (text: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRefetchSite: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");

  // A PDF's images belong inside the PDF's row (§9.4). Listing a hundred
  // slivers beside the deck they came out of would bury the deck, and the
  // shared row already knows how to open a container.
  const derivedOf = new Map<string, MaterialBody[]>();
  for (const material of materials) {
    if (!material.derived_from_material_id || !material.url) continue;
    const parent = material.derived_from_material_id;
    const list = derivedOf.get(parent) ?? [];
    list.push({
      id: material.id,
      label: material.label,
      media_type: material.media_type,
      bytes: material.bytes,
      width: material.width ?? null,
      height: material.height ?? null,
      url: material.url,
    });
    derivedOf.set(parent, list);
  }
  const listed = materials.filter((material) => !material.derived_from_material_id);

  const accept = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await onUploadFile(file, await toBase64(file));
    }
  };

  return (
    <>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">いま使われている素材</h3>
        <ul className="flex flex-col gap-1.5">
          {websiteLabel && (
            <li className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2 text-sm">
              <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">
                サイト
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {websiteLabel}
              </span>
              <button
                type="button"
                onClick={onRefetchSite}
                disabled={busy}
                className="shrink-0 text-xs text-accent underline underline-offset-2 disabled:opacity-50"
              >
                取り直す
              </button>
            </li>
          )}
          {/* The same row the input drawer and the inventory draw: a material
              is a material wherever it is listed, and three implementations
              were three chances to drift (§9.4). Only the verb differs — here
              it is a real delete, because a brand's own file has a delete
              endpoint and a video's pinned document does not. */}
          {listed.map((material) => (
            <MaterialRow
              key={material.id}
              data={{
                id: material.id,
                name: material.label,
                media_type: material.media_type,
                bytes: material.bytes,
                width: material.width ?? null,
                height: material.height ?? null,
                url: material.url ?? null,
              }}
              derived={derivedOf.get(material.id)}
              lead={
                <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">
                  {KIND_LABEL[material.kind] ?? material.kind}
                </span>
              }
              trailing={readableSize(material.bytes)}
              actions={
                <DeleteAction
                  name={material.label}
                  disabled={busy}
                  onDelete={() => void onRemove(material.id)}
                />
              }
            />
          ))}
          {!websiteLabel && materials.length === 0 && (
            <li className="text-sm text-ink-faint">素材がまだありません</li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">情報を足す</h3>
        <p className="text-sm text-ink-muted">
          ブランドブック・ガイドライン・資料を入れるほど、この先の工程が確かになります。
        </p>

        <div
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            if (dragging) event.preventDefault();
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files.length) void accept(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-accent bg-accent/5" : "border-hairline",
          )}
        >
          <p className="text-sm text-ink-muted">
            PDF・画像・テキストをここにドロップ
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            ファイルを選ぶ
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) void accept(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-muted">
            テキストで伝える（社内メモ・口頭で聞いた内容など）
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="rounded-lg border border-hairline bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy || note.trim() === ""}
          onClick={async () => {
            await onAddNote(note.trim());
            setNote("");
          }}
          className="self-start bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-50"
        >
          テキストを追加
        </button>
      </section>
    </>
  );
}
