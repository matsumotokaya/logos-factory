import type { Metadata } from "next";
import LpPortal from "./LpPortal";

export const metadata: Metadata = {
  title: "LPs — Works",
  robots: { index: false, follow: false },
};

export default async function BrandLpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LpPortal brandId={id} />;
}
