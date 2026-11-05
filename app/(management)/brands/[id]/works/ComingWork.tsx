import Link from "next/link";

// A kind of work the folder promises and the product cannot make yet. Said
// plainly, with the way back, rather than left out of the tree.

export default function ComingWork({
  brandId,
  kind,
  lead,
  note,
}: {
  brandId: string;
  kind: string;
  lead: string;
  note: string;
}) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">WORKS / {kind.toUpperCase()}</p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold">{kind}</h1>
          <p className="mt-3 text-pretty text-sm text-ink-muted">{lead}</p>
        </div>
        <Link href={`/brands/${brandId}/works`} className="text-xs text-ink-muted underline-offset-4 hover:text-ink">
          ← Works
        </Link>
      </header>
      <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-sm text-ink-muted">{note}</p>
    </main>
  );
}
