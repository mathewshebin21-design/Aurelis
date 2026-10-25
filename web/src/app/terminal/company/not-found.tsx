import Link from "next/link";
import { WORKSPACE } from "@/lib/terminal/routes";
import { Unavailable } from "@/components/terminal/panel";

export default function CompanyNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Unavailable tone="warn" title="Unknown company">
        No SEC registrant matches this ticker or CIK. <Link href={WORKSPACE.search} className="text-accent hover:underline">Search the SEC company index</Link>.
      </Unavailable>
    </div>
  );
}
