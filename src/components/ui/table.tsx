import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto scrollbar-thin">
      <table className={cn("w-full caption-bottom border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b [&_tr]:border-line", className)} {...p} />;
export const TBody = ({ className, ...p }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
export const TR = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("border-b border-line/70 transition-colors hover:bg-panel-2/60", className)} {...p} />;
export const TH = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap", className)} {...p} />
);
export const TD = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("px-3 py-1.5 align-middle whitespace-nowrap", className)} {...p} />;
