"use client";

import * as React from "react";
import { BookOpenText, CalendarClock, CircleAlert, FileText, Sigma, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, fmtPct, fmtX } from "@/lib/utils";
import type { Company } from "@/lib/data/build";
import type { Claim, ClaimKind } from "@/lib/data/companies";
import { Badge } from "@/components/ui/badge";

const KIND: Record<ClaimKind, { label: string; variant: "fact" | "assumption" | "interpretation"; desc: string }> = {
  fact: { label: "Sourced fact", variant: "fact", desc: "Stated in a filing or transcript; every fact carries a citation." },
  assumption: { label: "Assumption", variant: "assumption", desc: "Analyst input that drives a model; editable and versioned." },
  interpretation: { label: "AI interpretation", variant: "interpretation", desc: "Model-generated reasoning over cited evidence; never a source of numbers." },
};

export function KindLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-fg-2", className)}>
      {(Object.keys(KIND) as ClaimKind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5" title={KIND[k].desc}>
          <Badge variant={KIND[k].variant}>{KIND[k].label}</Badge>
          <span className="hidden text-muted lg:inline">{KIND[k].desc}</span>
        </span>
      ))}
    </div>
  );
}

/** Flags claims that would fail the Phase 4 citation check. */
function issues(claim: Claim): string | null {
  if (claim.kind === "fact" && claim.evidence.length === 0) return "Fact without citation — derived from statements; link to computed metric required";
  if (claim.kind === "interpretation" && claim.evidence.length === 0) return "Unsupported interpretation — no evidence attached";
  return null;
}

function ClaimItem({ claim, onEvidence, active }: { claim: Claim; onEvidence: (id: string) => void; active: string | null }) {
  const issue = issues(claim);
  return (
    <li className="group border-b border-line/70 py-3 last:border-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant={KIND[claim.kind].variant}>{KIND[claim.kind].label}</Badge>
        <span className="text-[10.5px] uppercase tracking-wider text-muted">confidence · {claim.confidence}</span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-fg">{claim.text}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {claim.evidence.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEvidence(e)}
            aria-pressed={active === e}
            className={cn(
              "inline-flex items-center gap-1 rounded-[var(--radius)] border border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-fg-2 transition-colors hover:border-accent hover:text-accent",
              active === e && "border-accent bg-accent-soft text-accent",
            )}
          >
            <FileText className="size-3" /> {e}
          </button>
        ))}
        {issue && (
          <span className="inline-flex items-center gap-1 text-[11px] text-warn">
            <CircleAlert className="size-3" /> {issue}
          </span>
        )}
      </div>
    </li>
  );
}

export function ComputedFacts({ c, className }: { c: Company; className?: string }) {
  const lm = c.metrics.at(-1)!;
  const facts = [
    `Revenue CAGR FY2022–FY2025: ${fmtPct(c.revenueCagr3y)}`,
    `FY2025 operating margin: ${fmtPct(lm.operatingMargin)} (FY2021: ${fmtPct(c.metrics[0].operatingMargin)})`,
    `FY2025 free-cash-flow margin: ${fmtPct(lm.fcfMargin)}`,
    `ROIC FY2025: ${fmtPct(lm.roic)} vs. estimated WACC ${fmtPct(c.dcf.wacc)}`,
    `Net debt / EBITDA: ${fmtX(lm.netDebtToEbitda)} · interest coverage ${fmtX(lm.interestCoverage)}`,
  ];
  return (
    <ul className={cn("space-y-1.5 text-[12.5px] text-fg", className)}>
      {facts.map((f) => (
        <li key={f} className="flex items-start gap-2">
          <Sigma className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="num">{f}</span>
        </li>
      ))}
      <li className="pt-1 text-[11px] text-muted">Computed by the deterministic engine from the statements above — the AI layer may quote these but never calculates them.</li>
    </ul>
  );
}

export function RiskMatrix({ c, className }: { c: Company; className?: string }) {
  const cells = Array.from({ length: 5 }, (_, r) => 5 - r);
  return (
    <div className={className}>
      <div className="grid grid-cols-[20px_repeat(5,1fr)] gap-[2px]">
        {cells.map((sev) => (
          <React.Fragment key={sev}>
            <div className="num flex items-center justify-center text-[10px] text-muted">{sev}</div>
            {[1, 2, 3, 4, 5].map((lik) => {
              const here = c.risks.filter((r) => r.severity === sev && r.likelihood === lik);
              const heat = (sev * lik) / 25;
              return (
                <div
                  key={lik}
                  className="flex min-h-9 flex-wrap items-center justify-center gap-0.5 rounded-[2px] p-0.5"
                  style={{ background: `color-mix(in oklab, var(--neg) ${Math.round(heat * 38)}%, var(--panel-2))` }}
                >
                  {here.map((r) => (
                    <span key={r.label} title={`${r.label} — ${r.note}`} className="rounded-[2px] bg-panel px-1 text-[9.5px] font-semibold leading-tight text-fg shadow-sm">
                      {r.label.split(" ")[0]}
                    </span>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div />
        {[1, 2, 3, 4, 5].map((l) => (
          <div key={l} className="num text-center text-[10px] text-muted">{l}</div>
        ))}
      </div>
      <div className="mt-1 flex justify-between pl-6 text-[10.5px] text-muted">
        <span>↑ severity</span>
        <span>likelihood →</span>
      </div>
      <ul className="mt-3 space-y-1 text-[12px]">
        {c.risks.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span className="text-fg">{r.label}</span>
            <span className="text-right text-muted">{r.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Catalysts({ c, className }: { c: Company; className?: string }) {
  return (
    <ol className={cn("relative space-y-3 border-l border-line-strong pl-4", className)}>
      {c.catalysts.map((k) => (
        <li key={k.event} className="relative">
          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-panel bg-accent" />
          <div className="num text-[11px] text-muted">{k.date}</div>
          <div className="text-[13px] text-fg">{k.event}</div>
          <Badge variant={KIND[k.kind].variant} className="mt-1">{KIND[k.kind].label}</Badge>
        </li>
      ))}
    </ol>
  );
}

export function ThesisPanel({ c, variant }: { c: Company; variant: "a" | "b" | "c" }) {
  const [active, setActive] = React.useState<string | null>(c.evidence[0]?.id ?? null);
  const ev = c.evidence.find((e) => e.id === active);
  const title = (t: string, Icon: React.ComponentType<{ className?: string }>) => (
    <h3 className={cn("mb-1 flex items-center gap-2 text-[13px] font-semibold text-fg", variant === "b" && "font-display text-xl font-medium")}>
      <Icon className="size-4 text-muted" /> {t}
    </h3>
  );
  const box = cn("min-w-0 rounded-[var(--radius)] border border-line bg-panel p-4", variant === "b" && "p-6");

  return (
    <div className={cn("space-y-3", variant === "b" && "space-y-6")}>
      <div className={cn(box, "flex flex-wrap items-center justify-between gap-3")}>
        <KindLegend />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <Sparkles className="size-3.5" /> Preview: hand-written sample claims. Phase 4 generates them with filing RAG + citation checks.
        </span>
      </div>
      <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_340px]", variant === "b" && "gap-6 lg:grid-cols-2")}>
        <section className={box}>
          {title("Bull case", TrendingUp)}
          <ul>
            {c.bull.map((cl) => (
              <ClaimItem key={cl.text} claim={cl} onEvidence={setActive} active={active} />
            ))}
          </ul>
        </section>
        <section className={box}>
          {title("Bear case", TrendingDown)}
          <ul>
            {c.bear.map((cl) => (
              <ClaimItem key={cl.text} claim={cl} onEvidence={setActive} active={active} />
            ))}
          </ul>
        </section>
        <aside className={cn(box, "lg:sticky lg:top-4 lg:self-start", variant === "b" && "lg:col-span-2 lg:static")}>
          {title("Evidence", BookOpenText)}
          <div className="mb-3 flex flex-wrap gap-1">
            {c.evidence.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setActive(e.id)}
                aria-pressed={active === e.id}
                className={cn("rounded-[var(--radius)] border border-line px-1.5 py-0.5 text-[11px] text-fg-2", active === e.id && "border-accent bg-accent-soft text-accent")}
              >
                {e.id}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {ev && (
              <motion.figure key={ev.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <blockquote className={cn("border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-fg", variant === "b" && "font-display text-lg")}>“{ev.excerpt}”</blockquote>
                <figcaption className="mt-2 text-[11.5px] text-muted">
                  {ev.document} · {ev.section}
                  <div className="mt-1">
                    <Badge variant="demo">Fictional excerpt</Badge>
                  </div>
                </figcaption>
              </motion.figure>
            )}
          </AnimatePresence>
        </aside>
      </div>
      <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-3", variant === "b" && "gap-6")}>
        <section className={box}>
          {title("Computed facts", Sigma)}
          <ComputedFacts c={c} className="mt-2" />
        </section>
        <section className={box}>
          {title("Catalysts", CalendarClock)}
          <Catalysts c={c} className="mt-3" />
        </section>
        <section className={box}>
          {title("Risk assessment", CircleAlert)}
          <RiskMatrix c={c} className="mt-3" />
        </section>
      </div>
    </div>
  );
}
