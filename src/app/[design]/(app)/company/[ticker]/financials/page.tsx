import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { getCompany } from "@/lib/data/build";
import { StatementsView } from "@/components/features/statements";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Financial statements" };

export default async function FinancialsPage({ params }: PageProps<"/[design]/company/[ticker]/financials">) {
  const { design, ticker } = await params;
  const c = getCompany(ticker);
  if (!isDesign(design) || !c) notFound();
  return (
    <div className={cn("rounded-[var(--radius)] border border-line bg-panel", design === "a" ? "p-3" : design === "b" ? "p-6 sm:p-10" : "p-5")}>
      {design === "b" && <h2 className="mb-6 font-display text-3xl text-fg">Five-year financial statements</h2>}
      <StatementsView key={c.ticker} c={c} />
    </div>
  );
}
