"use client";

import { motion } from "motion/react";
import type { Schemas } from "@/lib/api/client";
import { fmtByUnit, fmtMultiple, fmtPct } from "@/lib/api/format";
import { Badge } from "@/components/ui/badge";

type Card = Schemas["ScorecardOut"];

const unitOf = (card: Card, key: string) => card.inputs.find((m) => m.key === key)?.unit ?? "ratio";

/** Health score as returned by the engine: every pillar shows its metric, value, points and bands. */
export function HealthCard({ card }: { card: Card }) {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          {card.total === null ? (
            <div className="text-[13px] font-medium text-fg-2" data-testid="health-total">No score</div>
          ) : (
            <div className="num text-3xl font-semibold leading-none text-fg" data-testid="health-total">
              {card.total}
              <span className="text-base text-muted">/100</span>
            </div>
          )}
          <div className="mt-1 text-xs text-fg-2">
            Financial health · {card.grade ?? "not graded"} · {card.period}
          </div>
        </div>
        <Badge>Rule-based</Badge>
      </div>
      <ul className="mt-4 space-y-2.5">
        {card.pillars.map((p) => (
          <li key={p.id} data-testid={`pillar-${p.id}`}>
            <div className="flex justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate text-fg-2">
                {p.label} <span className="text-muted">· {p.metric}</span>
              </span>
              <span className="num shrink-0 text-fg">
                {p.applicable ? (
                  <>
                    {fmtByUnit(p.value, unitOf(card, p.metric_key))} <span className="text-muted">→ {p.points}/{p.max}</span>
                  </>
                ) : (
                  <span className="text-muted">not applicable</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
              {p.applicable && (
                <motion.div className="h-full rounded-full bg-s1" initial={{ width: 0 }} animate={{ width: `${((p.points ?? 0) / p.max) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
              )}
            </div>
            {p.note && <div className="mt-0.5 text-[11px] text-muted">{p.note}</div>}
          </li>
        ))}
      </ul>
      {card.notes.map((n) => (
        <p key={n} className="mt-3 text-[11.5px] text-warn">{n}</p>
      ))}
      <details className="mt-4 text-[11.5px] text-fg-2">
        <summary className="cursor-pointer font-medium text-fg">Methodology</summary>
        <p className="mt-2 text-muted">{card.disclaimer} Same thresholds for every company; engine {card.engine_version}.</p>
        <table className="mt-2 w-full">
          <tbody>
            {card.pillars.map((p) => {
              const multiple = unitOf(card, p.metric_key) === "multiple";
              return (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="py-1 pr-2 font-medium text-fg">{p.label}</td>
                  <td className="num py-1 text-muted">
                    {p.bands.map((b) => `${p.lower_is_better ? "≤" : "≥"}${multiple ? fmtMultiple(b.threshold, 1) : fmtPct(b.threshold, 0)}: ${b.points}`).join(" · ")} · else 0 · undefined: {p.when_undefined}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}
