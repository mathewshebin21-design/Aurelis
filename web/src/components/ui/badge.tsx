import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[calc(var(--radius)-1px)] border px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wider whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-line-strong bg-panel-2 text-fg-2",
        accent: "border-accent/40 bg-accent-soft text-accent",
        fact: "border-s1/40 bg-s1/10 text-fg",
        assumption: "border-warn/40 bg-warn/10 text-fg",
        interpretation: "border-s4/40 bg-s4/10 text-fg",
        demo: "border-warn/50 bg-warn/10 text-warn",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
