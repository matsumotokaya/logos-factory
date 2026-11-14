import type { Metadata } from "next";
import LpDetailView from "./LpDetailView";

export const metadata: Metadata = {
  title: "LP — Works",
  robots: { index: false, follow: false },
};

export default async function BrandLpPage({
  params,
}: {
  params: Promise<{ id: string; lpId: string }>;
}) {
  const { id, lpId } = await params;
  return <LpDetailView brandId={id} lpId={lpId} />;
}
