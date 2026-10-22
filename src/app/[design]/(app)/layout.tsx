import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { ShellA } from "@/components/shells/shell-a";
import { ShellB } from "@/components/shells/shell-b";
import { ShellC } from "@/components/shells/shell-c";

export default async function AppShellLayout({ children, params }: LayoutProps<"/[design]">) {
  const { design } = await params;
  if (!isDesign(design)) notFound();
  const Shell = { a: ShellA, b: ShellB, c: ShellC }[design];
  return <Shell>{children}</Shell>;
}
