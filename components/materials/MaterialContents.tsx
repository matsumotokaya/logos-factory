"use client";

// What is inside one material, listed so it can be taken out.
//
// docs/asset-normalization.md §9.4. EVERY material is a container: what it
// holds is the file itself, plus anything that came out of it. A JPEG holds one
// entry; a PDF holds itself and every image extracted from it. Before this, the
// only downloadable thing in the whole application was a PDF's extracted image,
// so the original PDF could not be retrieved and neither could an uploaded
// photograph sitting on the next row. One rule closes both holes.
//
// Nothing is thinned for a PDF. Fragments, 2px slivers and blank plates are
// listed with the photographs, because they are what the model is handed too,
// and seeing them is how a person understands why a reading came out as it did.

/** One downloadable body: a material's own file, or something taken out of it. */
export interface MaterialBody {
  id: string;
  label: string;
  media_type: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  /** Signed same-origin URL. Serves the thumbnail and the download alike. */
  url: string;
  /** Set on something taken out of a container: the page it was found on. */
  page?: number;
  /** Every page the same bytes are drawn on, when more than one. */
  pages?: number[];
  /** Drawn inline in the PDF's content stream rather than as a named object. */
  inline?: boolean;
}

const readableSize = (bytes: number | null): string =>
  bytes === null
    ? ""
    : bytes < 1024
      ? `${bytes}B`
      : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(0)}KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

const isImage = (mediaType: string | null): boolean =>
  typeof mediaType === "string" && /^image\//.test(mediaType);

/** A word for the thumbnail slot of something that cannot be shown as a
 *  picture. The medium rather than a generic file glyph: what it is matters. */
const badge = (body: MaterialBody): string => {
  const type = body.media_type ?? "";
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("audio/")) return "音声";
  if (type.startsWith("video/")) return "動画";
  if (type.startsWith("text/")) return "文字";
  const tail = /\.([a-z0-9]{1,5})$/i.exec(body.label);
  return tail ? tail[1].toUpperCase() : "ファイル";
};

/**
 * The contents panel of one material row.
 *
 * Rendered on a grey ground so an open row is unmistakable against the closed
 * ones around it. The first entry is always the file
 * itself, which is what makes the container real rather than an abstraction:
 * there is no material whose panel is empty.
 */
export default function MaterialContents({
  self,
  derived = [],
  footer,
}: {
  /** The material's own file. Absent when its bytes could not be addressed. */
  self: MaterialBody | null;
  /** What came out of it, in the order it was found. */
  derived?: readonly MaterialBody[];
  /** An action for the row, such as taking a PDF apart after the fact. */
  footer?: React.ReactNode;
}) {
  const entries: Array<{ body: MaterialBody; own: boolean }> = [
    ...(self ? [{ body: self, own: true }] : []),
    ...derived.map((body) => ({ body, own: false })),
  ];

  return (
    <div className="rounded-b-lg border-t border-hairline bg-ink/[0.04]">
      {entries.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-ink-muted">
          この素材はファイルを持っていないので、取り出せるものがありません。
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline/60">
          {entries.map(({ body, own }) => (
            <li key={body.id} className="flex items-center gap-2.5 px-3 py-1.5 text-[12px]">
              {/* Mid-grey behind the thumbnail so both a white mark and a black
                  one can be seen; a white ground erases half a flyer's marks. */}
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-[#808080] text-[9px] font-semibold text-white">
                {isImage(body.media_type) ? (
                  // Signed same-origin URL, not an optimisable asset: a plain
                  // <img>, as every other material thumbnail in this app.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={body.url}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="max-h-10 max-w-10 object-contain"
                  />
                ) : (
                  badge(body)
                )}
              </span>
              <span className="w-12 shrink-0 tabular-nums text-[11px] text-ink-faint">
                {own ? "本体" : body.page ? `p.${body.page}` : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{body.label}</span>
              <span className="w-20 shrink-0 text-right font-mono tabular-nums text-[11px] text-ink">
                {body.width && body.height ? `${body.width}×${body.height}` : ""}
              </span>
              <span className="w-14 shrink-0 text-right font-mono tabular-nums text-[11px] text-ink-faint">
                {readableSize(body.bytes)}
              </span>
              <span className="w-16 shrink-0 text-[10px] text-ink-faint">
                {body.pages && body.pages.length > 1 ? `p.${body.pages.join("・")}` : ""}
                {body.inline ? " インライン" : ""}
              </span>
              <a
                href={body.url}
                download={body.label}
                className="shrink-0 text-xs text-ink-faint underline underline-offset-2 hover:text-ink"
              >
                ダウンロード
              </a>
            </li>
          ))}
        </ul>
      )}
      {footer ? <div className="border-t border-hairline/60 px-3 py-2">{footer}</div> : null}
    </div>
  );
}
