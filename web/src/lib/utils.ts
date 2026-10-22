import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NM = "n/m";

/** USD millions → compact string ($17.98B / $612M). */
export function fmtMoneyM(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return NM;
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(digits)}T`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(digits)}B`;
  return `${sign}$${a.toFixed(0)}M`;
}

/** Plain number with thousands separators; negatives in accounting parentheses. */
export function fmtNum(v: number | null | undefined, digits = 0, accounting = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return NM;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (v < 0) return accounting ? `(${s})` : `−${s}`;
  return s;
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return NM;
  const s = (Math.abs(v) * 100).toFixed(digits) + "%";
  if (v < 0) return `−${s}`;
  return signed ? `+${s}` : s;
}

export function fmtX(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return NM;
  return `${v.toFixed(digits)}×`;
}

export function fmtPrice(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return NM;
  return `$${v.toFixed(2)}`;
}
