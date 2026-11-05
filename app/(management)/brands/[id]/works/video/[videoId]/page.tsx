import type { Metadata } from "next";
import BrandVideoDetail from "./BrandVideoDetail";

export const metadata: Metadata = {
  title: "動画 — ブランドアセット",
  robots: { index: false, follow: false },
};

export default async function BrandVideoPage({
  params,
}: {
  params: Promise<{ id: string; videoId: string }>;
}) {
  const { id, videoId } = await params;
  return <BrandVideoDetail brandId={id} videoId={videoId} />;
}
