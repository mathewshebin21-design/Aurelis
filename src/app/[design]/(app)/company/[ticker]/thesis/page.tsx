import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { getCompany } from "@/lib/data/build";
import { ThesisPanel } from "@/components/features/thesis";

export const metadata: Metadata = { title: "Investment thesis" };

export default async function ThesisPage({ params }: PageProps<"/[design]/company/[ticker]/thesis">) {
  const { design, ticker } = await params;
  const c = getCompany(ticker);
  if (!isDesign(design) || !c) notFound();
  return <ThesisPanel key={c.ticker} c={c} variant={design} />;
}
