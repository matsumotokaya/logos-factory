"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import MaterialContents, { type MaterialBody } from "./MaterialContents";

// One material, wherever it is listed.
//
// docs/asset-normalization.md §9.4. Three lists show materials: the documents
// the reading took in, the inventory of what a video is made of, and the files
// a brand holds. They differ in what you can DO to a row, not in what a row is,
// and while each drew its own the three drifted — only one could be opened,
// only one could download, and the same JPEG showed its size in three formats.
//
// So the row is here and the verbs are slots. The caller supplies the chip
// before the name, the extra fact after it, the actions on the right, and the
// second line beneath. What every caller gets for free is the container: ▸
// opens the file itself plus anything that came out of it, each downloadable.

/** A material as a row needs it. Measurements may be absent; nulls mean
 *  「measured nothing」, which readers must not print as a zero. */
export interface MaterialRowData {
  id: string;
  /** The name to show. A caller with a normalised name passes that. */
  name: string;
  /** The uploaded name, when it differs from `name`. */
  originalName?: string | null;
  media_type: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  /** Signed URL for its own bytes. Null when the row has no addressable file. */
  url?: string | null;
}

export default function MaterialRow({
  data,
  lead,
  trailing,
  actions,
  meta,
  derived = [],
  footer,
}: {
  data: MaterialRowData;
  /** A chip before the name: the reading's verdict, the medium, the category. */
  lead?: React.ReactNode;
  /** One fact after the name, such as how many characters were read. */
  trailing?: React.ReactNode;
  /** The row's verbs, on the right. */
  actions?: React.ReactNode;
  /** A second line: where the film uses it, what it overrides. */
  meta?: React.ReactNode;
  /** What came out of this file, in the order it was found. */
  derived?: readonly MaterialBody[];
  /** An action shown inside the open panel, such as expanding a PDF. */
  footer?: React.ReactNode;
}) {
  // Each row owns whether it is open. Closed to start, images included: a list
  // is read to see WHICH files are here, and opening one is the separate act of
  // getting something out of it.
  const [open, setOpen] = useState(false);
  const body: MaterialBody | null = data.url
    ? {
        id: data.id,
        label: data.name,
        media_type: data.media_type,
        bytes: data.bytes,
        width: data.width,
        height: data.height,
        url: data.url,
      }
    : null;

  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border",
        open ? "border-ink/25" : "border-hairline",
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? `${data.name}の中身を閉じる` : `${data.name}の中身を開く`}
          className="-ml-1 shrink-0 rounded px-1 text-[11px] text-ink-muted hover:text-ink"
        >
          {open ? "▾" : "▸"}
        </button>
        {lead}
        <span className="min-w-0 flex-1 truncate text-ink">{data.name}</span>
        {derived.length > 0 ? (
          <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">
            {derived.length}点
          </span>
        ) : null}
        {trailing ? (
          <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">{trailing}</span>
        ) : null}
        {actions}
      </div>
      {/* Worth a line only when it differs: 「miyao.jpg（元: miyao.jpg）」 on
          every row buries the cases where the name really changed. */}
      {data.originalName && data.originalName !== data.name ? (
        <p className="truncate px-3 pb-1.5 text-[11px] text-ink-faint">元: {data.originalName}</p>
      ) : null}
      {meta ? <div className="px-3 pb-1.5">{meta}</div> : null}
      {open ? <MaterialContents self={body} derived={derived} footer={footer} /> : null}
    </li>
  );
}
