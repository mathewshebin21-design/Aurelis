import type { Metadata } from "next";
import { isDesign } from "@/lib/designs";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/features/page-header";
import { SearchView } from "@/components/features/search";
import { IllustrativeNotice } from "@/components/features/common";

export const metadata: Metadata = { title: "Company search" };

export default async function SearchPage({ params }: PageProps<"/[design]/search">) {
  const { design } = await params;
  if (!isDesign(design)) notFound();
  return (
    <div className={design === "a" ? "" : "mx-auto max-w-6xl"}>
      <PageHeader d={design} eyebrow={design === "a" ? "SRCH <GO>" : design === "b" ? "Research library" : "workspace / screener"} title="Company search" desc="Search the coverage universe by ticker, name, sector or industry. Press ⌘K anywhere." />
      <SearchView d={design} variant={design} />
      <IllustrativeNotice className="mt-4" />
    </div>
  );
}
