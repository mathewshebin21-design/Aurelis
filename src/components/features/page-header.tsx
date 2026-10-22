import { cn } from "@/lib/utils";
import type { DesignId } from "@/lib/designs";

/** Page title treatment differs per design language. */
export function PageHeader({ d, eyebrow, title, desc, actions, className }: { d: DesignId; eyebrow?: string; title: string; desc?: string; actions?: React.ReactNode; className?: string }) {
  if (d === "a") {
    return (
      <div className={cn("mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2", className)}>
        <div>
          {eyebrow && <div className="num text-[10.5px] uppercase tracking-[0.18em] text-accent">{eyebrow}</div>}
          <h1 className="text-[15px] font-semibold text-fg">{title}</h1>
          {desc && <p className="text-[12px] text-muted">{desc}</p>}
        </div>
        {actions}
      </div>
    );
  }
  if (d === "b") {
    return (
      <div className={cn("mb-10 flex flex-wrap items-end justify-between gap-4", className)}>
        <div className="max-w-3xl">
          {eyebrow && <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-accent">{eyebrow}</div>}
          <h1 className="font-display text-4xl font-normal leading-[1.08] tracking-tight text-fg sm:text-5xl">{title}</h1>
          {desc && <p className="mt-4 text-[16px] leading-relaxed text-fg-2">{desc}</p>}
        </div>
        {actions}
      </div>
    );
  }
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && <div className="num mb-1 text-[11px] text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {desc && <p className="mt-1 text-[13.5px] text-fg-2">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}
