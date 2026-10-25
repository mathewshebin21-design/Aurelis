"use client";

import * as React from "react";

const KEY = "aurelis.preview.watchlist";
const DEFAULT = ["NWSC", "MRDN", "ALTP", "VRDA", "HLXB"];
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let cache: string[] | null = null;
function snapshot() {
  if (cache === null) cache = read();
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode) — keep in memory only */
  }
  listeners.forEach((l) => l());
}

/** Preview-only watchlist persisted per browser. Phase 5 moves this to the workspace API. */
export function useWatchlist() {
  const list = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => DEFAULT,
  );
  return {
    list,
    has: (t: string) => list.includes(t),
    toggle: (t: string) => write(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]),
    remove: (t: string) => write(list.filter((x) => x !== t)),
    reset: () => write(DEFAULT),
  };
}
