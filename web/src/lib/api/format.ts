/**
 * Display formatting for API values. The API sends Decimals as strings at full
 * precision; these helpers only round and scale for display. They never derive new
 * financial quantities. Calculations belong to the engine (`api/src/aurelis_api/quant`).
 */
export type Dec = string | number | null | undefined;

export const NOT_REPORTED = "—";

export function toNumber(v: Dec): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const SCALES: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/** 391035000000 → "391.0B". Negative values use a leading minus. */
export function fmtCompact(v: Dec, digits = 1): string {
  const n = toNumber(v);
  if (n === null) return NOT_REPORTED;
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  for (const [s, suffix] of SCALES) if (abs >= s) return `${n < 0 ? "−" : ""}${(abs / s).toFixed(digits)}${suffix}`;
  return `${n < 0 ? "−" : ""}${abs.toFixed(abs >= 100 ? 0 : 2)}`;
}

export function fmtCurrency(v: Dec, currency = "USD", digits = 1): string {
  const s = fmtCompact(v, digits);
  if (s === NOT_REPORTED) return s;
  const sym = currency === "USD" ? "$" : `${currency} `;
  return s.startsWith("−") ? `−${sym}${s.slice(1)}` : `${sym}${s}`;
}

/** 0.4691 → "46.9%". */
export function fmtPct(v: Dec, digits = 1, signed = false): string {
  const n = toNumber(v);
  if (n === null) return NOT_REPORTED;
  const s = (Math.abs(n) * 100).toFixed(digits);
  const sign = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return `${sign}${s}%`;
}

export function fmtMultiple(v: Dec, digits = 1): string {
  const n = toNumber(v);
  return n === null ? NOT_REPORTED : `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}×`;
}

export function fmtPerShare(v: Dec, currency = "USD"): string {
  const n = toNumber(v);
  if (n === null) return NOT_REPORTED;
  const sym = currency === "USD" ? "$" : `${currency} `;
  return `${n < 0 ? "−" : ""}${sym}${Math.abs(n).toFixed(2)}`;
}

/** Format by the engine's declared unit (`ratio`, `currency`, `multiple`, `per_share`, ...). */
export function fmtByUnit(v: Dec, unit: string, currency = "USD"): string {
  switch (unit) {
    case "ratio":
    case "percent":
      return fmtPct(v);
    case "multiple":
      return fmtMultiple(v);
    case "per_share":
      return fmtPerShare(v, currency);
    case "currency":
      return fmtCurrency(v, currency);
    default:
      return toNumber(v) === null ? NOT_REPORTED : String(v);
  }
}
