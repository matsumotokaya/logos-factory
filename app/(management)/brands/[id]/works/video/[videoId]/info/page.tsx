import type { Metadata } from "next";
import BrandVideoInfo from "./BrandVideoInfo";

export const metadata: Metadata = {
  title: "動画の詳細 — ブランドアセット",
  robots: { index: false, follow: false },
};

export default async function BrandVideoInfoPage({
  params,
}: {
  params: Promise<{ id: string; videoId: string }>;
}) {
  const { id, videoId } = await params;
  return <BrandVideoInfo brandId={id} videoId={videoId} />;
}
