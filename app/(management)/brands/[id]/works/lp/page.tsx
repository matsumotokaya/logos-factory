import type { Metadata } from "next";
import ComingWork from "../ComingWork";

export const metadata: Metadata = {
  title: "LPs — Works",
  robots: { index: false, follow: false },
};

export default async function BrandLpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ComingWork
      brandId={id}
      kind="LPs"
      lead="ランディングページ。キットの色・書体・形・ロゴで組み、公開 URL を持ちます。"
      note="準備中です。先に、公開したキットの brand.md を外部のエージェントに渡して LP を作る検証をします。足りなかったものがキットの次の項目になります。"
    />
  );
}
