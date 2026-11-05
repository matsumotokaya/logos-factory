import type { Metadata } from "next";
import BrandTop from "./BrandTop";

export const metadata: Metadata = {
  title: "ブランドキット",
  robots: { index: false, follow: false },
};

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BrandTop brandId={id} />;
}