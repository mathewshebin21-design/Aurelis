import * as React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Design C instrument panel: hairline card with a title and an instrument code. */
export function Panel({ title, code, className, contentClassName, actions, children }: {
  title: string;
  code?: string;
  className?: string;
  contentClassName?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-2">
          {actions}
          {code && <span className="num text-[11px] text-muted">{code}</span>}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/** An explicit "this is not available, and why" state. Never a blank or a zero. */
export function Unavailable({ title, children, tone = "muted", className }: { title: string; children?: React.ReactNode; tone?: "muted" | "warn" | "neg"; className?: string }) {
  const Icon = tone === "muted" ? Info : AlertTriangle;
  return (
    <div role={tone === "neg" ? "alert" : "note"} className={cn("flex items-start gap-2 text-[12.5px] leading-snug", { muted: "text-fg-2", warn: "text-warn", neg: "text-neg" }[tone], className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>
        <div className="font-medium">{title}</div>
        {children && <div className="mt-0.5 text-muted">{children}</div>}
      </div>
    </div>
  );
}

export function PageTitle({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="num mb-1 text-[11px] uppercase tracking-wider text-muted">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-[13px] text-fg-2">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}
