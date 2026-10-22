import { notFound } from "next/navigation";
import { DESIGNS, isDesign } from "@/lib/designs";

export function generateStaticParams() {
  return Object.keys(DESIGNS).map((design) => ({ design }));
}

export const dynamicParams = false;

export default async function DesignLayout({ children, params }: LayoutProps<"/[design]">) {
  const { design } = await params;
  if (!isDesign(design)) notFound();
  return (
    <div data-design={design} className="min-h-dvh bg-bg font-sans text-fg">
      {children}
    </div>
  );
}
