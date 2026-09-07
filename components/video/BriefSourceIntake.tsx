"use client";

// The video's input stage: what this film is briefed from.
//
// A pasted paragraph and an uploaded flyer are the same thing once stored, so
// both live in one list. Running the stages is manual and one at a time — the
// point of showing a pipeline is that a person can run a step, look at what it
// did, and decide about the next one.

import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";

export interface BriefSource {
  id: string;
  kind: string;
  label: string;
  media_type: string | null;
  bytes: number | null;
  upload_fingerprint?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  document: "資料",
  photo: "画像",
  logo: "ロゴ",
  audio: "音声",
  other: "その他",
};
const MAX_UPLOAD_BYTES = 12_000_000;

const readableSize = (bytes: number | null): string =>
  bytes === null ? "" : bytes < 1024 ? `${bytes}B` : `${Math.round(bytes / 1024)}KB`;

type UploadItem = { file: File; label: string };

type FileEntry = {
  isFile: true;
  isDirectory: false;
  name: string;
  fullPath: string;
  file: (onSuccess: (file: File) => void, onError?: (error: DOMException) => void) => void;
};

type DirectoryEntry = {
  isFile: false;
  isDirectory: true;
  name: string;
  fullPath: string;
  createReader: () => {
    readEntries: (
      onSuccess: (entries: Array<FileEntry | DirectoryEntry>) => void,
      onError?: (error: DOMException) => void,
    ) => void;
  };
};

type DropEntry = FileEntry | DirectoryEntry;

const relativePath = (path: string, fallback: string): string =>
  path.replace(/^[/\\]+/, "") || fallback;

const readFileEntry = (entry: FileEntry): Promise<UploadItem> =>
  new Promise((resolve, reject) => {
    entry.file(
      (file) => resolve({ file, label: relativePath(entry.fullPath, file.name) }),
      reject,
    );
  });

const readDirectoryEntry = async (entry: DirectoryEntry): Promise<UploadItem[]> => {
  const reader = entry.createReader();
  const children: Array<FileEntry | DirectoryEntry> = [];

  // Chromium returns directory entries in batches. Keep reading until an empty
  // batch arrives; otherwise large folders silently lose files after batch 1.
  for (;;) {
    const batch = await new Promise<Array<FileEntry | DirectoryEntry>>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    children.push(...batch);
  }

  const files: UploadItem[] = [];
  for (const child of children) {
    if (child.isFile) {
      files.push(await readFileEntry(child));
    } else {
      files.push(...(await readDirectoryEntry(child)));
    }
  }
  return files;
};

const filesFromDrop = async (event: DragEvent<HTMLElement>): Promise<UploadItem[]> => {
  const items = Array.from(event.dataTransfer.items);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => {
      const getEntry = (item as DataTransferItem & {
        webkitGetAsEntry?: () => DropEntry | null;
      }).webkitGetAsEntry;
      return getEntry?.call(item) ?? null;
    })
    .filter((entry): entry is DropEntry => Boolean(entry));

  if (entries.length === 0) {
    return Array.from(event.dataTransfer.files).map((file) => ({
      file,
      label: file.name,
    }));
  }

  const files: UploadItem[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      files.push(await readFileEntry(entry));
    } else {
      files.push(...(await readDirectoryEntry(entry)));
    }
  }
  return files;
};

const filesFromPicker = (files: FileList): UploadItem[] =>
  Array.from(files).map((file) => ({
    file,
    label: relativePath(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "",
      file.name,
    ),
  }));

export default function BriefSourceIntake({
  sources,
  busy,
  onUpload,
  onAddText,
  onRemove,
}: {
  sources: BriefSource[];
  busy: boolean;
  onUpload: (file: File, label: string) => Promise<boolean>;
  onAddText: (text: string) => Promise<void>;
  onRemove: (materialId: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const accept = async (items: UploadItem[]) => {
    if (busy || items.length === 0) return;
    const unique = Array.from(
      new Map(
        items.map((item) => [
          `${item.label}:${item.file.size}:${item.file.lastModified}`,
          item,
        ] as const),
      ).values(),
    );
    const existing = new Set(
      sources.flatMap((source) => [
        source.upload_fingerprint ?? "",
        `${source.label}:${source.bytes ?? ""}`,
      ]),
    );
    const pending = unique.filter((item) => {
      const identity = `${item.label.slice(0, 200)}:${item.file.size}`;
      const fingerprint = `${identity}:${item.file.lastModified}`;
      return !existing.has(fingerprint) && !existing.has(identity);
    });
    const skipped = unique.length - pending.length;
    const uploadable = pending.filter((item) => item.file.size <= MAX_UPLOAD_BYTES);
    const oversized = pending.length - uploadable.length;
    let completed = 0;
    let failed = oversized;
    const preparing = [`${uploadable.length}件を追加します。`];
    if (skipped > 0) preparing.push(`${skipped}件は登録済みのためスキップします。`);
    if (oversized > 0) preparing.push(`${oversized}件は12MBを超えるため送信しません。`);
    preparing.push("準備しています…");
    setUploadStatus(preparing.join(""));

    // Upload one by one so a large folder does not create a burst of R2/DB
    // writes, and so one unsupported file cannot prevent the rest from landing.
    for (const item of uploadable) {
      try {
        const added = await onUpload(item.file, item.label);
        if (added) completed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    const parts = [`${completed}件を追加しました。`];
    if (skipped > 0) parts.push(`${skipped}件は登録済みのためスキップしました。`);
    if (failed > 0) parts.push(`${failed}件は形式またはサイズのため追加できませんでした。`);
    setUploadStatus(parts.join(""));
  };

  return (
    <section className="flex flex-col gap-5" aria-busy={busy}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void filesFromDrop(event).then(accept).catch(() => {
            setUploadStatus("フォルダ内の資料を読み込めませんでした。");
          });
        }}
        className={cn(
          "rounded-xl border border-dashed px-4 py-6 text-center transition",
          dragging ? "border-ink bg-ink/[0.03]" : "border-hairline",
        )}
      >
        <p className="text-[12px] text-ink-muted">
          フライヤー・企画書・写真、またはフォルダをここにドロップ
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="資料ファイルを選ぶ"
          onChange={(event) => {
            if (event.target.files) void accept(filesFromPicker(event.target.files));
            event.target.value = "";
          }}
        />
        <input
          type="file"
          multiple
          className="sr-only"
          aria-label="資料フォルダを選ぶ"
          onChange={(event) => {
            if (event.target.files) void accept(filesFromPicker(event.target.files));
            event.target.value = "";
          }}
          // React's types do not expose the non-standard directory picker
          // attribute, so it is applied below after mounting.
          ref={(node) => {
            folderRef.current = node;
            node?.setAttribute("webkitdirectory", "");
            node?.setAttribute("directory", "");
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="mt-3 rounded-full border border-hairline px-4 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-50"
        >
          ファイルを選ぶ
        </button>
        <button
          type="button"
          onClick={() => folderRef.current?.click()}
          disabled={busy}
          className="ml-2 mt-3 rounded-full border border-hairline px-4 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-50"
        >
          フォルダを選ぶ
        </button>
        <p className="mt-2 text-[11px] text-ink-faint">
          サブフォルダ内のファイルもまとめて読み込みます。対応外のファイルはスキップして続行します。
        </p>
        {uploadStatus ? (
          <p className="mt-2 text-[11px] text-ink-muted" role="status" aria-live="polite">
            {uploadStatus}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="brief-source-note" className="mb-2 block text-[12px] font-semibold text-ink">
          テキストで追加
        </label>
        <textarea
          id="brief-source-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Slackの雑文でも、企画のメモでも。そのまま貼ってください"
          className="w-full rounded-xl border border-hairline px-3 py-2.5 text-[13px] outline-none focus:border-ink"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={async () => {
              if (!note.trim()) return;
              await onAddText(note);
              setNote("");
            }}
            disabled={busy || !note.trim()}
            className="rounded-full border border-hairline px-4 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-50"
          >
            テキストとして追加
          </button>
        </div>
      </div>

      {/* 「この動画のもとになっている資料」 was a claim about the film — and
          reading is not applying, so a freshly dropped flyer is not yet what
          the video is made of. This list is simply what has been handed over. */}
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">
          追加した資料
        </h2>
        <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
      </div>

      <ul className="flex flex-col gap-1.5">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2 text-sm"
          >
            <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">
              {KIND_LABEL[source.kind] ?? source.kind}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">{source.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-ink-faint">
              {readableSize(source.bytes)}
            </span>
            <button
              type="button"
              onClick={() => void onRemove(source.id)}
              disabled={busy}
              className="shrink-0 text-xs text-ink-faint underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
            >
              外す
            </button>
          </li>
        ))}
        {sources.length === 0 ? (
          <li className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-ink-muted">
            まだ資料がありません。いまの動画の内容は、すべてこちらで仮に決めたものです。
          </li>
        ) : null}
      </ul>

    </section>
  );
}
