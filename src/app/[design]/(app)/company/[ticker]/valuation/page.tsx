import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { getCompany } from "@/lib/data/build";
import { ValuationStudio } from "@/components/features/valuation";

export const metadata: Metadata = { title: "Valuation workspace" };

export default async function ValuationPage({ params }: PageProps<"/[design]/company/[ticker]/valuation">) {
  const { design, ticker } = await params;
  const c = getCompany(ticker);
  if (!isDesign(design) || !c) notFound();
  return <ValuationStudio key={c.ticker} c={c} variant={design} />;
}
