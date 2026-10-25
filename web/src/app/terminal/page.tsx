import { redirect } from "next/navigation";
import { WORKSPACE } from "@/lib/terminal/routes";

/** The executive dashboard is milestone 5.7; until then the terminal opens on company search. */
export default function TerminalHome() {
  redirect(WORKSPACE.search);
}
