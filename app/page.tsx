import AppHeader from "@/components/AppHeader";
import TopPage from "./TopPage";

// The top page is the front door: a site's URL in, a brand out
// (docs/template-contract.md §6.1). It renders standalone, without the
// management sidebar.
export default function Home() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <AppHeader />
      <TopPage />
    </div>
  );
}
