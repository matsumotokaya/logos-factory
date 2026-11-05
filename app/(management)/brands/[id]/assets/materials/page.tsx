import type { Metadata } from "next";
import MaterialsPortal from "./MaterialsPortal";

export const metadata: Metadata = {
  title: "Materials — Assets",
  robots: { index: false, follow: false },
};

export default async function BrandMaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MaterialsPortal brandId={id} />;
}
