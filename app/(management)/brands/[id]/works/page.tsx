import type { Metadata } from "next";
import WorksIndex from "./WorksIndex";

export const metadata: Metadata = {
  title: "Works — ブランドキット",
  robots: { index: false, follow: false },
};

export default async function BrandWorksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorksIndex brandId={id} />;
}
