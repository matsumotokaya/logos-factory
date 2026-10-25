import type { Metadata } from "next";
import { SAMPLE_CAMPAIGN_ID } from "@/lib/campaign/sample";
import CampaignManagementPage from "../../CampaignManagementPage";
import JobRedirect from "../JobRedirect";

export const metadata: Metadata = {
  title: "ブランドへ移動",
  robots: { index: false, follow: false },
};

// Retired with the job page: the LP of a generation lives under its brand.
export default async function CampaignLpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id === SAMPLE_CAMPAIGN_ID) {
    return <CampaignManagementPage params={params} view="lp" />;
  }
  return <JobRedirect id={id} view="lp" />;
}
