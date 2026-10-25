import type { Metadata } from "next";
import { SAMPLE_CAMPAIGN_ID } from "@/lib/campaign/sample";
import CampaignManagementPage from "../CampaignManagementPage";
import JobRedirect from "./JobRedirect";

export const metadata: Metadata = {
  title: "ブランドへ移動",
  robots: { index: false, follow: false },
};

// The job page is retired: a generation's result is its brand's page. Only
// the built-in sample, which has no brand, still renders here.
export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id === SAMPLE_CAMPAIGN_ID) return <CampaignManagementPage params={params} />;
  return <JobRedirect id={id} />;
}
