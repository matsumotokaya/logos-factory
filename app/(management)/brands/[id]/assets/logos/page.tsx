import type { Metadata } from "next";
import LogoPortal from "./LogoPortal";

export const metadata: Metadata = {
  title: "ロゴ — ブランドアセット",
  robots: { index: false, follow: false },
};

export default async function BrandLogoPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LogoPortal brandId={id} />;
}