/**
 * Browser → API proxy rules. The browser never talks to FastAPI directly: interactive
 * calculators post through `/terminal/api/...`, which forwards only these
 * stateless, compute-only endpoints. Admin and ingestion endpoints are unreachable
 * from the browser by construction.
 */
export const PROXY_ALLOW: readonly { method: "POST" | "GET"; path: RegExp }[] = [
  { method: "POST", path: /^\/v1\/valuation\/(dcf|wacc|scenarios|comps)$/ },
  { method: "GET", path: /^\/v1\/companies$/ }, // search-as-you-type
  { method: "GET", path: /^\/v1\/companies\/[A-Za-z0-9.\-]{1,16}\/filings\/search$/ },
];

export const MAX_PROXY_BODY_BYTES = 64 * 1024;

export function isAllowed(method: string, path: string): boolean {
  if (path.includes("..") || path.includes("//")) return false;
  return PROXY_ALLOW.some((r) => r.method === method.toUpperCase() && r.path.test(path));
}
