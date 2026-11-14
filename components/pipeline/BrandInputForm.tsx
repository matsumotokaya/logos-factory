"use client";

// What a brand is made from, and the one place to change it.
//
// The input stage of the brand's pipeline, opened first in 「ブランド情報を
// 更新」. Modelled on Slide Factory's upload stage: one way in — a drop zone
// that also takes a pasted note — and one list of everything the brand is
// read from, each row saying whether the last read covered it. To change the
// brand, change this list and make it again (the drawer's foot); nothing on
// the brand page is typed over (owner's direction, 2026-11-14).
//
// The site is an input like the rest, but the main one: colour, type, shape
// and the logo are measured off it. Further pages are read for what they say.

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
  /** Set on what a person fed in: a file, an added page, a note. */
  input?: "file" | "url" | "note" | null;
  /** When the last read covered it; null when it has not been read yet. */
  read_at?: string | null;
  width?: number | null;
  height?: number | null;
  url?: string | null;
  derived_from_material_id?: string | null;
  created_at: string;
}

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

const when = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function badge(material: BrandMaterial): string {
  if (material.input === "url") return "URL";
  if (material.input === "note") return "メモ";
  const type = material.media_type ?? "";
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("image/")) return "画像";
  if (type.startsWith("text/")) return "テキスト";
  return "ファイル";
}

function ReadState({ readAt }: { readAt: string | null | undefined }) {
  return readAt ? (
    <span className="shrink-0 text-[11px] text-emerald-700">読み取り済み {when(readAt)}</span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">未読み取り</span>
  );
}

/** The inputs a person fed in, out of everything the brand holds. */
export function inputMaterials(materials: BrandMaterial[]): BrandMaterial[] {
  return materials.filter((material) => material.input && !material.derived_from_material_id);
}

export default function BrandInputForm({
  website,
  lastRead,
  materials,
  busy,
  onSaveWebsite,
  onAddUrl,
  onUploadFile,
  onAddNote,
  onRemove,
}: {
  website: string;
  /** When the site was last read, or null. */
  lastRead: string | null;
  materials: BrandMaterial[];
  busy: boolean;
  onSaveWebsite: (url: string) => Promise<void>;
  onAddUrl: (url: string) => Promise<void>;
  onUploadFile: (file: File, data: string) => Promise<void>;
  onAddNote: (text: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [site, setSite] = useState(website);
  const [extraUrl, setExtraUrl] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  // A PDF's images belong inside the PDF's row (§9.4).
  const derivedOf = new Map<string, MaterialBody[]>();
  for (const material of materials) {
    if (!material.derived_from_material_id || !material.url) continue;
    const list = derivedOf.get(material.derived_from_material_id) ?? [];
    list.push({
      id: material.id,
      label: material.label,
      media_type: material.media_type,
      bytes: material.bytes,
      width: material.width ?? null,
      height: material.height ?? null,
      url: material.url,
    });
    derivedOf.set(material.derived_from_material_id, list);
  }
  const inputs = inputMaterials(materials);

  const run = async (label: string, task: () => Promise<void>) => {
    setWorking(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加できませんでした");
    } finally {
      setWorking(null);
    }
  };

  const accept = (files: FileList | File[]) =>
    run("ファイルを追加しています", async () => {
      for (const file of Array.from(files)) {
        await onUploadFile(file, await toBase64(file));
      }
    });

  const disabled = busy || working !== null;
  const siteChanged = site.trim() !== website;

  return (
    <div className="flex flex-col gap-6">
      {/* The main input: the brand's own site. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">サイト</h3>
        <p className="text-[12px] text-ink-muted">
          色・書体・形・ロゴはこのサイトから測ります。文章（運営・提供内容・特長・お客様の声）も読みます。
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (siteChanged) void run("URLを保存しています", () => onSaveWebsite(site.trim()));
          }}
        >
          <input
            type="url"
            value={site}
            onChange={(event) => setSite(event.target.value)}
            placeholder="https://example.com"
            aria-label="サイトのURL"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
          {siteChanged ? (
            <button
              type="submit"
              disabled={disabled}
              className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-accent disabled:opacity-50"
            >
              URLを変える
            </button>
          ) : null}
        </form>
        <p className="text-[11px] text-ink-faint">
          {website
            ? lastRead
              ? `最後に読んだのは ${when(lastRead)}`
              : "まだ読んでいません"
            : "URLが無いときは、下の素材だけで作ります"}
          {siteChanged ? "。変えたURLは、下の「この入力で作り直す」で読みます" : ""}
        </p>
      </section>

      {/* Everything else, one way in. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">素材を足す</h3>
        <p className="text-[12px] text-ink-muted">
          会社概要や導入事例のページ、ブランドブック、資料、社内のメモ。足すほど、運営・提供内容・特長・お客様の声が確かになります。
        </p>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const url = extraUrl.trim();
            if (!url) return;
            void run("ページを読み込んでいます", async () => {
              await onAddUrl(url);
              setExtraUrl("");
            });
          }}
        >
          <input
            type="url"
            value={extraUrl}
            onChange={(event) => setExtraUrl(event.target.value)}
            placeholder="ほかのページのURL（会社概要・導入事例など）"
            aria-label="追加するページのURL"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={disabled || extraUrl.trim() === ""}
            className="rounded-lg border border-ink px-3 py-2 text-xs font-semibold text-ink hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            ＋ URLを追加
          </button>
        </form>

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
            "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors",
            dragging ? "border-ink bg-ink text-paper" : "border-ink/30 bg-white",
          )}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="text-sm font-semibold disabled:opacity-50"
          >
            ドラッグ&ドロップ、またはクリックしてファイルを選択
          </button>
          <p className={cn("text-[11px]", dragging ? "text-paper/70" : "text-ink-faint")}>
            PDF・画像（PNG / JPEG / WebP / GIF）・テキスト。1件8MBまで
          </p>
          <button
            type="button"
            onClick={() => setNoteOpen((open) => !open)}
            disabled={disabled}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50",
              dragging ? "border-paper/40" : "border-hairline text-ink hover:border-ink",
            )}
          >
            テキストを貼り付け
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

        {noteOpen ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              autoFocus
              aria-label="貼り付けるテキスト"
              placeholder="会社概要、サービスの説明、口頭で聞いた内容など"
              className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled || note.trim() === ""}
                onClick={() =>
                  void run("メモを追加しています", async () => {
                    await onAddNote(note.trim());
                    setNote("");
                    setNoteOpen(false);
                  })
                }
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-paper hover:bg-accent disabled:opacity-40"
              >
                追加する
              </button>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
              >
                やめる
              </button>
            </div>
          </div>
        ) : null}

        {working ? <p role="status" className="text-[12px] text-ink-muted">{working}…</p> : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {/* What the brand is made from: the site, then everything added. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">
          素材 <span className="tabular-nums text-ink-muted">({(website ? 1 : 0) + inputs.length})</span>
        </h3>
        <ul className="flex flex-col gap-1.5">
          {website ? (
            <li className="flex items-center gap-3 rounded-lg border border-hairline bg-white px-3 py-2 text-sm">
              <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-paper">サイト</span>
              <a href={website} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline">
                {website.replace(/^https?:\/\//, "")}
              </a>
              <ReadState readAt={lastRead} />
            </li>
          ) : null}
          {inputs.map((material) => (
            <MaterialRow
              key={material.id}
              data={{
                id: material.id,
                name: material.input === "url" && material.source_url ? `${material.label}（${material.source_url.replace(/^https?:\/\//, "")}）` : material.label,
                media_type: material.media_type,
                bytes: material.bytes,
                width: material.width ?? null,
                height: material.height ?? null,
                url: material.url ?? null,
              }}
              derived={derivedOf.get(material.id)}
              lead={
                <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
                  {badge(material)}
                </span>
              }
              trailing={
                <span className="flex items-center gap-3">
                  {material.input === "file" ? <span>{readableSize(material.bytes)}</span> : null}
                  <ReadState readAt={material.read_at} />
                </span>
              }
              actions={
                <DeleteAction name={material.label} disabled={disabled} onDelete={() => void onRemove(material.id)} />
              }
            />
          ))}
          {!website && inputs.length === 0 ? (
            <li className="text-sm text-ink-faint">まだ何もありません。サイトのURLか素材を足してください。</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
