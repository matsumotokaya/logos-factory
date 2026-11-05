import type { Metadata } from "next";
import ComingWork from "../ComingWork";

export const metadata: Metadata = {
  title: "Banners — Works",
  robots: { index: false, follow: false },
};

export default async function BrandBannersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ComingWork
      brandId={id}
      kind="Banners"
      lead="広告・SNS 用の静止画。1つのブリーフからサイズ違いを一度に出します。"
      note="準備中です。"
    />
  );
}
