import type { Metadata } from "next";
import UnfiledLogoInfo from "./UnfiledLogoInfo";

// Legacy /logos/[id] — the logo's text page now lives under
// /brands/[brandId]/logos/[logoId]/info (the path without /info opens the
// presentation). We resolve the logo's subject_entity_id and use it as the
// brand id in the redirect target. A logo with no subject has no address
// inside a brand tree, so its info page is served here instead.

export const metadata: Metadata = {
  title: "ロゴ詳細・編集",
  robots: { index: false, follow: false },
};

export default async function ManagedLogoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (base && serviceKey) {
    const url = `${base}/rest/v1/logos?select=subject_entity_id&id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ subject_entity_id?: string }>;
      const subject = rows[0]?.subject_entity_id;
      if (subject) {
        const { redirect } = await import("next/navigation");
        redirect(`/brands/${subject}/assets/logos/${id}/info`);
      }
    }
  }
  return <UnfiledLogoInfo logoId={id} />;
}