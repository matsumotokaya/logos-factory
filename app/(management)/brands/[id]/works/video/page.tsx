import type { Metadata } from "next";
import VideoPortal from "./VideoPortal";

export const metadata: Metadata = {
  title: "動画 — ブランドアセット",
  robots: { index: false, follow: false },
};

export default async function BrandVideoPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VideoPortal brandId={id} />;
}
