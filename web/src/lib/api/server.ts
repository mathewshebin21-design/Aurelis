import "server-only";
import { createClient } from "./client";

/** Server-side API client. `AURELIS_API_URL` is never exposed to the browser. */
export function apiUrl(): string {
  return process.env.AURELIS_API_URL ?? "http://127.0.0.1:8000";
}

export const api = createClient(apiUrl(), (input, init) => fetch(input, { cache: "no-store", ...init }));
