import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { AS_OF } from "@/lib/data/build";
import { PageHeader } from "@/components/features/page-header";
import { Dashboard } from "@/components/features/dashboard";

export const metadata: Metadata = { title: "Executive dashboard" };

export default async function DashboardPage({ params }: PageProps<"/[design]/dashboard">) {
  const { design } = await params;
  if (!isDesign(design)) notFound();
  const copy = {
    a: { eyebrow: "DASH <GO>", title: "Executive financial dashboard", desc: `Coverage universe · illustrative snapshot ${AS_OF}` },
    b: { eyebrow: `Briefing · ${AS_OF}`, title: "The coverage briefing", desc: "A considered view of quality, valuation and the events ahead — composed for principals and investment committees." },
    c: { eyebrow: `workspace / dashboard · ${AS_OF}`, title: "Executive dashboard", desc: "Cross-sectional view of the coverage universe. All metrics computed by the deterministic engine." },
  }[design];
  return (
    <div>
      <PageHeader d={design} {...copy} />
      <Dashboard d={design} />
    </div>
  );
}
