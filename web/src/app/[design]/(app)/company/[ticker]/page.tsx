import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { getCompany } from "@/lib/data/build";
import { CompanyOverview } from "@/components/features/overview";

export async function generateMetadata({ params }: PageProps<"/[design]/company/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} research` };
}

export default async function CompanyPage({ params }: PageProps<"/[design]/company/[ticker]">) {
  const { design, ticker } = await params;
  const c = getCompany(ticker);
  if (!isDesign(design) || !c) notFound();
  return <CompanyOverview key={c.ticker} c={c} d={design} />;
}
