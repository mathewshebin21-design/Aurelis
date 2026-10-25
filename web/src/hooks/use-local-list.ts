"use client";

import * as React from "react";

/**
 * A string list kept in this browser's localStorage. Used for the terminal watchlist
 * until accounts and persistent storage exist (Phase 6): nothing leaves the device.
 */
const stores = new Map<string, { cache: string[] | null; listeners: Set<() => void> }>();
const EMPTY: string[] = [];

function store(key: string) {
  let s = stores.get(key);
  if (!s) stores.set(key, (s = { cache: null, listeners: new Set() }));
  return s;
}

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, next: string[]) {
  const s = store(key);
  s.cache = next;
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode): keep in memory for this tab */
  }
  s.listeners.forEach((l) => l());
}

export function useLocalList(key: string) {
  const s = store(key);
  const list = React.useSyncExternalStore(
    (cb) => {
      s.listeners.add(cb);
      return () => s.listeners.delete(cb);
    },
    () => (s.cache ??= read(key)),
    () => EMPTY,
  );
  return {
    list,
    has: (x: string) => list.includes(x),
    toggle: (x: string) => write(key, list.includes(x) ? list.filter((y) => y !== x) : [...list, x]),
    remove: (x: string) => write(key, list.filter((y) => y !== x)),
  };
}

export const WATCHLIST_KEY = "aurelis.terminal.watchlist";
export const useTerminalWatchlist = () => useLocalList(WATCHLIST_KEY);
