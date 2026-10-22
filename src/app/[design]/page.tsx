import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DESIGNS, isDesign } from "@/lib/designs";
import { LandingA } from "@/components/landing/landing-a";
import { LandingB } from "@/components/landing/landing-b";
import { LandingC } from "@/components/landing/landing-c";

export async function generateMetadata({ params }: PageProps<"/[design]">): Promise<Metadata> {
  const { design } = await params;
  return isDesign(design) ? { title: `${DESIGNS[design].code} — ${DESIGNS[design].name}` } : {};
}

export default async function LandingPage({ params }: PageProps<"/[design]">) {
  const { design } = await params;
  if (!isDesign(design)) notFound();
  const Landing = { a: LandingA, b: LandingB, c: LandingC }[design];
  return <Landing />;
}
