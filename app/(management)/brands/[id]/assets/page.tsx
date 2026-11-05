import type { Metadata } from "next";
import AssetsIndex from "./AssetsIndex";

export const metadata: Metadata = {
  title: "Assets — ブランドキット",
  robots: { index: false, follow: false },
};

export default async function BrandAssetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetsIndex brandId={id} />;
}
