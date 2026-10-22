import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { PageHeader } from "@/components/features/page-header";
import { WatchlistView } from "@/components/features/search";
import { IllustrativeNotice } from "@/components/features/common";

export const metadata: Metadata = { title: "Watchlist" };

export default async function WatchlistPage({ params }: PageProps<"/[design]/watchlist">) {
  const { design } = await params;
  if (!isDesign(design)) notFound();
  return (
    <div className={design === "a" ? "" : "mx-auto max-w-6xl"}>
      <PageHeader d={design} eyebrow={design === "a" ? "WL <GO>" : design === "b" ? "Holdings under review" : "workspace / watchlist"} title="Watchlist" desc="Issuers you are monitoring, with computed health scores and valuation multiples." />
      <WatchlistView d={design} variant={design} />
      <IllustrativeNotice className="mt-4" />
    </div>
  );
}
