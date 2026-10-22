"use client";

/**
 * Dependency-free SVG chart primitives. Colours come from the active design's
 * validated series tokens (--s1…--s4); text always uses ink tokens, never the
 * series colour. Every plotted chart ships a hover layer.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

export interface Series {
  id: string;
  label: string;
  /** CSS colour, normally var(--s1)…var(--s4). */
  color: string;
  values: number[];
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const flip = x > width - 170;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-[var(--radius)] border border-line-strong bg-panel/95 px-2.5 py-1.5 text-[11.5px] text-fg shadow-lg backdrop-blur"
      style={{ left: flip ? x - 12 : x + 12, top: Math.max(0, y - 8), transform: flip ? "translateX(-100%)" : undefined }}
    >
      {children}
    </div>
  );
}

export function LegendRow({ series, className }: { series: Pick<Series, "id" | "label" | "color">[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-fg-2", className)}>
      {series.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function LineChart({
  series,
  xLabels,
  height = 220,
  formatY = (v) => v.toFixed(0),
  area = false,
  className,
  zeroBased = false,
}: {
  series: Series[];
  xLabels: string[];
  height?: number;
  formatY?: (v: number) => string;
  area?: boolean;
  className?: string;
  zeroBased?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const pad = { l: 8, r: 52, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (zeroBased) min = Math.min(0, min);
  const span = max - min || 1;
  min -= span * 0.06;
  max += span * 0.06;
  const ticks = niceTicks(min, max).filter((t) => t >= min && t <= max);
  const n = xLabels.length;
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * ih;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left - pad.l;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))));
  };

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "2 3"} />
              <text x={pad.l + iw + 6} y={y(t) + 3.5} fontSize={10.5} fill="var(--muted)" className="num">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xLabels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={x(i)} y={height - 6} fontSize={10.5} fill="var(--muted)" textAnchor={i === 0 ? "start" : "middle"}>
                {l}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
            return (
              <g key={s.id}>
                {area && (
                  <path d={`${d}L${x(n - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z`} fill={s.color} opacity={0.1} />
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" />
              {series.map((s) => (
                <circle key={s.id} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" />
        </svg>
      )}
      {hover !== null && (
        <Tooltip x={x(hover)} y={Math.min(...series.map((s) => y(s.values[hover])))} width={width}>
          <div className="mb-0.5 text-muted">{xLabels[hover]}</div>
          {series.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="num font-medium">{formatY(s.values[hover])}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function BarChart({
  series,
  categories,
  height = 220,
  formatY = (v) => v.toFixed(0),
  className,
}: {
  series: Series[];
  categories: string[];
  height?: number;
  formatY?: (v: number) => string;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<{ c: number; s: number } | null>(null);
  const pad = { l: 8, r: 52, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all) * 1.08 || 1;
  const ticks = niceTicks(min, max).filter((t) => t >= min && t <= max);
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * ih;
  const band = iw / categories.length;
  const gap = 2;
  const barW = Math.max(3, Math.min(28, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onPointerLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "2 3"} />
              <text x={pad.l + iw + 6} y={y(t) + 3.5} fontSize={10.5} fill="var(--muted)" className="num">
                {formatY(t)}
              </text>
            </g>
          ))}
          {categories.map((c, ci) => {
            const gx = pad.l + band * ci + (band - groupW) / 2;
            return (
              <g key={c}>
                <text x={pad.l + band * ci + band / 2} y={height - 6} fontSize={10.5} fill="var(--muted)" textAnchor="middle">
                  {c}
                </text>
                {series.map((s, si) => {
                  const v = s.values[ci];
                  const top = y(Math.max(0, v));
                  const h = Math.max(1, Math.abs(y(v) - y(0)));
                  const bx = gx + si * (barW + gap);
                  const r = Math.min(4, barW / 2, h);
                  // Rounded only at the data end; square at the baseline.
                  const d =
                    v >= 0
                      ? `M${bx},${top + h}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${top + h}Z`
                      : `M${bx},${top}V${top + h - r}Q${bx},${top + h} ${bx + r},${top + h}H${bx + barW - r}Q${bx + barW},${top + h} ${bx + barW},${top + h - r}V${top}Z`;
                  const active = hover && hover.c === ci && hover.s === si;
                  return (
                    <g key={s.id} onPointerEnter={() => setHover({ c: ci, s: si })}>
                      <rect x={bx - 2} y={pad.t} width={barW + 4} height={ih} fill="transparent" />
                      <path d={d} fill={s.color} opacity={hover && !active ? 0.55 : 1} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
      {hover && (
        <Tooltip x={pad.l + band * hover.c + band / 2} y={y(Math.max(0, series[hover.s].values[hover.c]))} width={width}>
          <div className="mb-0.5 text-muted">{categories[hover.c]}</div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ background: series[hover.s].color }} />
              {series[hover.s].label}
            </span>
            <span className="num font-medium">{formatY(series[hover.s].values[hover.c])}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export function Sparkline({ values, className, color = "var(--s1)", height = 28 }: { values: number[]; className?: string; color?: string; height?: number }) {
  const w = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(2)},${(height - 2 - ((v - min) / (max - min || 1)) * (height - 4)).toFixed(2)}`)
    .join("");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Horizontal range bars (valuation "football field") on one shared value axis. */
export function RangeBars({
  rows,
  marker,
  markerLabel,
  format = (v: number) => v.toFixed(0),
}: {
  rows: { label: string; low: number; high: number; mid?: number; color?: string }[];
  marker?: number;
  markerLabel?: string;
  format?: (v: number) => string;
}) {
  const lo = Math.min(...rows.map((r) => r.low), marker ?? Infinity) * 0.9;
  const hi = Math.max(...rows.map((r) => r.high), marker ?? -Infinity) * 1.06;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="grid grid-cols-[minmax(88px,28%)_1fr] gap-x-3 pb-5 text-[12px]">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex h-6 items-center truncate text-fg-2">{r.label}</div>
        ))}
      </div>
      <div className="px-10">
      <div className="relative space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="group relative h-6" title={`${r.label}: ${format(r.low)} – ${format(r.high)}`}>
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
              style={{ left: `${pct(r.low)}%`, width: `${Math.max(1, pct(r.high) - pct(r.low))}%`, background: r.color ?? "var(--s1)" }}
            />
            {r.mid !== undefined && (
              <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-fg" style={{ left: `${pct(r.mid)}%` }} />
            )}
            <span className="num absolute top-1/2 -translate-y-1/2 pr-1.5 text-[10.5px] text-muted" style={{ right: `${100 - pct(r.low)}%` }}>
              {format(r.low)}
            </span>
            <span className="num absolute top-1/2 -translate-y-1/2 pl-1.5 text-[10.5px] text-muted" style={{ left: `${pct(r.high)}%` }}>
              {format(r.high)}
            </span>
          </div>
        ))}
        {marker !== undefined && (
          <div className="pointer-events-none absolute -top-1 -bottom-1 w-px bg-fg" style={{ left: `${pct(marker)}%` }}>
            <span className="num absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-fg">
              {markerLabel} {format(marker)}
            </span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/** Greedy direct-label placement: try four offsets, keep the first that avoids earlier labels. */
function placeLabels(pts: { id: string; x: number; y: number; w: number }[], maxX: number) {
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return pts.map((p) => {
    const options = [
      { dx: 8, dy: -7, anchor: "start" as const },
      { dx: 8, dy: 15, anchor: "start" as const },
      { dx: -8, dy: -7, anchor: "end" as const },
      { dx: -8, dy: 15, anchor: "end" as const },
    ];
    const fits = (o: (typeof options)[number]) => {
      const x0 = o.anchor === "start" ? p.x + o.dx : p.x + o.dx - p.w;
      const box = { x0, x1: x0 + p.w, y0: p.y + o.dy - 10, y1: p.y + o.dy + 2 };
      const clear = box.x1 <= maxX + 12 && !boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      return clear ? box : null;
    };
    for (const o of options) {
      const box = fits(o);
      if (box) {
        boxes.push(box);
        return { lx: p.x + o.dx, ly: p.y + o.dy, anchor: o.anchor };
      }
    }
    return { lx: p.x + 8, ly: p.y - 7, anchor: "start" as const };
  });
}

/** Labelled scatter on two linear axes (x and y measure different things; one scale each). */
export function Scatter({
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  height = 260,
  yZero = true,
}: {
  points: { id: string; label: string; x: number; y: number; href?: string }[];
  xLabel: string;
  yLabel: string;
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  height?: number;
  yZero?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<string | null>(null);
  const pad = { l: 44, r: 16, t: 20, b: 34 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xmin = Math.min(...xs) - 5;
  const xmax = Math.max(...xs) + 5;
  const yspan = Math.max(...ys) - Math.min(...ys) || 1;
  const ymin = Math.min(...ys, yZero ? 0 : Infinity) - yspan * 0.12;
  const ymax = Math.max(...ys, yZero ? 0 : -Infinity) + yspan * 0.12;
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const X = (v: number) => pad.l + ((v - xmin) / (xmax - xmin)) * iw;
  const Y = (v: number) => pad.t + (1 - (v - ymin) / (ymax - ymin)) * ih;
  const xt = niceTicks(xmin, xmax).filter((t) => t >= xmin && t <= xmax);
  const yt = niceTicks(ymin, ymax).filter((t) => t >= ymin && t <= ymax);
  const hp = points.find((p) => p.id === hover);
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${yLabel} versus ${xLabel}`}>
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={pad.l} x2={pad.l + iw} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "2 3"} />
              <text x={pad.l - 6} y={Y(t) + 3.5} fontSize={10.5} textAnchor="end" fill="var(--muted)" className="num">{formatY(t)}</text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={`x${t}`} x={X(t)} y={pad.t + ih + 14} fontSize={10.5} textAnchor="middle" fill="var(--muted)" className="num">{formatX(t)}</text>
          ))}
          <text x={pad.l + iw} y={height - 4} fontSize={10.5} textAnchor="end" fill="var(--fg-2)">{xLabel} →</text>
          {placeLabels(points.map((p) => ({ id: p.id, x: X(p.x), y: Y(p.y), w: p.label.length * 7 + 4 })), pad.l + iw).map((l, i) => {
            const p = points[i];
            return (
              <g key={p.id} onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)}>
                <circle cx={X(p.x)} cy={Y(p.y)} r={14} fill="transparent" />
                <circle cx={X(p.x)} cy={Y(p.y)} r={hover === p.id ? 6 : 4.5} fill="var(--s1)" stroke="var(--panel)" strokeWidth={2} />
                <text x={l.lx} y={l.ly} fontSize={10.5} fontWeight={600} fill="var(--fg)" textAnchor={l.anchor} className="num">{p.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      <div className="absolute left-0 top-0 text-[10.5px] text-fg-2">↑ {yLabel}</div>
      {hp && (
        <Tooltip x={X(hp.x)} y={Y(hp.y)} width={width}>
          <div className="font-semibold">{hp.label}</div>
          <div className="flex justify-between gap-3"><span className="text-muted">{xLabel}</span><span className="num">{formatX(hp.x)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted">{yLabel}</span><span className="num">{formatY(hp.y)}</span></div>
        </Tooltip>
      )}
    </div>
  );
}
