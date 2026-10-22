import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { getCompany } from "@/lib/data/build";
import { ScenarioSimulator } from "@/components/features/valuation";

export const metadata: Metadata = { title: "Scenario analysis" };

export default async function ScenariosPage({ params }: PageProps<"/[design]/company/[ticker]/scenarios">) {
  const { design, ticker } = await params;
  const c = getCompany(ticker);
  if (!isDesign(design) || !c) notFound();
  return <ScenarioSimulator key={c.ticker} c={c} variant={design} />;
}
