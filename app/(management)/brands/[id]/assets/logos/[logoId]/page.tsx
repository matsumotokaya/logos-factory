import type { Metadata } from "next";
import PresentationPage from "@/app/p/[id]/page";
import RasterLogoView from "./RasterLogoView";

// The logo row opens the logo itself: the presentation, large, with its use
// cases, editable by whoever may edit it. The text page about the logo (format,
// owner, trademarks…) is one level down at ./info, reached from the sidebar's
// row menu — the same shape every leaf in the tree has.

export const metadata: Metadata = {
  title: "ロゴプレゼンテーション",
  robots: { index: false, follow: false },
};

export default async function BrandLogoPage({
  params,
}: {
  params: Promise<{ id: string; logoId: string }>;
}) {
  const { id, logoId } = await params;
  return (
    <PresentationPage
      params={Promise.resolve({ id: logoId })}
      embedded
      editable
      resetHref={`/brands/${id}/logos`}
      resetLabel="ロゴ一覧"
      rasterFallback={<RasterLogoView brandId={id} logoId={logoId} />}
    />
  );
}
