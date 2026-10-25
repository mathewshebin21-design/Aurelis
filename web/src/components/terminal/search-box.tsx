"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Keeps the query in the URL (`?q=`) so results are server-rendered, shareable and work without JavaScript. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const term = q.trim();
      start(() => router.replace(term ? `${pathname}?q=${encodeURIComponent(term)}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [q, pathname, router]);

  return (
    <form action={pathname} role="search" onSubmit={(e) => e.preventDefault()} className="relative">
      {pending ? <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" /> : <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />}
      <Input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the SEC company index by ticker, name or CIK"
        className="h-11 pl-9 text-[15px]"
        aria-label="Search companies"
        autoComplete="off"
      />
    </form>
  );
}
