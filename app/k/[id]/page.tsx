// The published brand kit — /k/[brandId], no sign-in.
//
// A server component: the reader is anonymous, so the take is resolved with
// the admin client here and only the frozen brief reaches the browser. The
// files beside it (brand.md, tokens.*, logo.svg, keyvisual.*) live under the
// same address, served by ./[file]/route.ts from the same brief.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import KitView, { type KitViewData } from "@/components/brand/KitView";
import { kitFileExtension } from "@/lib/brand/kit/markdown";
import { resolveLiveKit } from "@/lib/brand/kit/resolve";
import { SERVICE_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const kit = await resolveLiveKit(id);
  return {
    title: kit ? `${kit.brief.brand.name} — Brand Kit` : "Brand Kit",
    robots: { index: false },
    alternates: kit ? { types: { "text/markdown": `/k/${id}/brand.md` } } : undefined,
  };
}

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await resolveLiveKit(id);
  if (!kit) notFound();
  const { brief } = kit;
  const base = `/k/${id}`;

  const data: KitViewData = {
    brand: {
      id: brief.brand.id,
      name: brief.brand.name,
      description: brief.brand.description,
      industry: brief.brand.industry,
      location: brief.brand.location,
      website: brief.brand.website,
    },
    values: Object.entries(brief.values).map(([fieldPath, value]) => ({
      fieldPath,
      value,
      confidence: "adopted",
      decidedAt: brief.snapshotAt,
      from: brief.inherited?.[fieldPath] ?? null,
    })),
    claims: [],
    logos: brief.logos.map((logo, index) => ({
      id: logo.id,
      title: logo.title,
      previewUrl: `${base}/logo${index === 0 ? "" : `-${index + 1}`}.${logo.svg ? "svg" : kitFileExtension(logo.mediaType)}`,
      href: `/p/${logo.id}`,
    })),
    keyVisual: brief.keyVisual
      ? {
          id: brief.keyVisual.materialId,
          name: `keyvisual.${kitFileExtension(brief.keyVisual.mediaType)}`,
          url: `${base}/keyvisual.${kitFileExtension(brief.keyVisual.mediaType)}`,
        }
      : null,
  };

  const published = new Date(kit.publishedAt).toLocaleString("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const files = [
    { name: "brand.md", hint: "AIエージェントに渡す1枚" },
    { name: "tokens.json", hint: "役割ごとの値" },
    { name: "tokens.css", hint: ":root のカスタムプロパティ" },
    ...brief.logos.map((logo, index) => ({
      name: `logo${index === 0 ? "" : `-${index + 1}`}.${logo.svg ? "svg" : kitFileExtension(logo.mediaType)}`,
      hint: logo.title,
    })),
    ...(brief.keyVisual
      ? [{ name: `keyvisual.${kitFileExtension(brief.keyVisual.mediaType)}`, hint: "キービジュアル" }]
      : []),
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4 text-[12px]">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="font-display text-base font-semibold text-ink">
            {SERVICE_NAME}
          </Link>
          <span className="text-ink-muted">ブランドキット</span>
          <span className="text-ink-faint">公開 {published}</span>
        </div>
        <nav aria-label="キットのファイル" className="flex flex-wrap gap-x-3 gap-y-1">
          {files.map((file) => (
            <a
              key={file.name}
              href={`${base}/${file.name}`}
              title={file.hint}
              className="font-mono text-[11px] text-accent hover:underline"
            >
              {file.name}
            </a>
          ))}
        </nav>
      </header>

      <KitView data={data} />

      <section className="rounded-2xl border border-hairline bg-ink/[0.02] px-5 py-4 text-[12px] text-ink-muted">
        <p className="font-semibold text-ink">AI エージェントに渡すとき</p>
        <p className="mt-1">
          この URL ごと渡してください。機械向けには{" "}
          <a href={`${base}/brand.md`} className="font-mono text-accent hover:underline">
            {base}/brand.md
          </a>{" "}
          が同じ内容を Markdown で返します。ここに載っている値はサイトから測定されたものと持ち主が採用したものだけで、モデルの推測は含まれていません。
        </p>
      </section>
    </main>
  );
}
