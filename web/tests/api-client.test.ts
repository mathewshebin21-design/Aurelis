/** Typed API client, proxy allow-list and display formatters (no network). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, errorDetail, fillPath, withQuery, type Fetch } from "../src/lib/api/client.ts";
import { isAllowed } from "../src/lib/api/proxy.ts";
import { fmtByUnit, fmtCompact, fmtCurrency, fmtMultiple, fmtPct, fmtPerShare, NOT_REPORTED } from "../src/lib/api/format.ts";

function fakeFetch(status: number, body: unknown, calls: { url: string; init?: RequestInit }[] = []): Fetch {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(body === undefined ? "not json" : JSON.stringify(body), { status });
  };
}

test("path parameters are filled and encoded; missing ones fail loudly", () => {
  assert.equal(fillPath("/v1/companies/{ref}/statements/{statement}", { ref: "BRK.B", statement: "income" }), "/v1/companies/BRK.B/statements/income");
  assert.equal(fillPath("/v1/companies/{ref}", { ref: "a/b" }), "/v1/companies/a%2Fb");
  assert.throws(() => fillPath("/v1/companies/{ref}"), /Missing path parameter 'ref'/);
  assert.equal(withQuery("/v1/companies", { q: "apple inc", limit: 5, skip: undefined }), "/v1/companies?q=apple+inc&limit=5");
});

test("GET returns typed data and sends to the right URL", async () => {
  const calls: { url: string }[] = [];
  const api = createClient("http://api.test/", fakeFetch(200, [{ cik: 1, name: "X", tickers: ["X"], has_data: true, last_ingested_at: null }], calls));
  const r = await api.get("/v1/companies", { query: { q: "x" } });
  assert.ok(r.ok);
  assert.equal(r.data[0].has_data, true);
  assert.equal(calls[0].url, "http://api.test/v1/companies?q=x");
});

test("POST sends JSON and maps validation errors to readable text", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const detail = [{ loc: ["body", "assumptions", "wacc"], msg: "must exceed terminal growth" }];
  const api = createClient("http://api.test", fakeFetch(422, { detail }, calls));
  const r = await api.post("/v1/valuation/wacc", {
    risk_free: "0.04", beta: "1", equity_risk_premium: "0.05", equity_value: "100", debt_value: "0", pre_tax_cost_of_debt: "0.05", tax_rate: "0.21",
  });
  assert.deepEqual(r, { ok: false, status: 422, detail: "assumptions.wacc: must exceed terminal growth" });
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(JSON.parse(String(calls[0].init?.body)).beta, "1");
});

test("errors: string detail, non-JSON bodies, and unreachable service", async () => {
  assert.equal(errorDetail({ detail: "Unknown issuer 'ZZZ'. Ingest it first." }, 404), "Unknown issuer 'ZZZ'. Ingest it first.");
  assert.equal(errorDetail(null, 503), "The research service is unavailable");
  const notJson = await createClient("http://x", fakeFetch(500, undefined)).get("/v1/health");
  assert.deepEqual(notJson, { ok: false, status: 500, detail: "The research service is unavailable" });
  const down = await createClient("http://x", async () => { throw new TypeError("fetch failed"); }).get("/v1/health");
  assert.deepEqual(down, { ok: false, status: 0, detail: "The research service could not be reached" });
});

test("aborted requests propagate so superseded calculator results are dropped", async () => {
  const abort = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  await assert.rejects(createClient("http://x", abort).get("/v1/health"), { name: "AbortError" });
});

test("proxy allows only compute-only and read-only search endpoints", () => {
  for (const p of ["/v1/valuation/dcf", "/v1/valuation/wacc", "/v1/valuation/scenarios", "/v1/valuation/comps"]) assert.ok(isAllowed("POST", p), p);
  assert.ok(isAllowed("GET", "/v1/companies"));
  assert.ok(isAllowed("GET", "/v1/companies/AAPL/filings/search"));
  for (const [m, p] of [
    ["POST", "/v1/admin/ingest/AAPL"],
    ["POST", "/v1/admin/research/AAPL"],
    ["GET", "/v1/admin/ingest-runs"],
    ["GET", "/v1/valuation/dcf"],
    ["POST", "/v1/valuation/dcf/../../admin/ingest/AAPL"],
    ["POST", "/v1/valuation//dcf"],
    ["DELETE", "/v1/valuation/dcf"],
  ]) assert.equal(isAllowed(m, p), false, `${m} ${p}`);
});

test("formatters only round and scale, and show missing values honestly", () => {
  assert.equal(fmtCompact("391035000000"), "391.0B");
  assert.equal(fmtCurrency("-1250000000", "USD"), "−$1.3B");
  assert.equal(fmtCurrency("5000000", "EUR"), "EUR 5.0M");
  assert.equal(fmtPct("0.469059"), "46.9%");
  assert.equal(fmtPct("0.02", 1, true), "+2.0%");
  assert.equal(fmtPct("-0.153"), "−15.3%");
  assert.equal(fmtMultiple("12.345"), "12.3×");
  assert.equal(fmtPerShare("187.456"), "$187.46");
  for (const v of [null, undefined, "", "NaN"]) assert.equal(fmtPct(v), NOT_REPORTED);
  assert.equal(fmtByUnit("0.5", "ratio"), "50.0%");
  assert.equal(fmtByUnit("8", "multiple"), "8.0×");
  assert.equal(fmtByUnit("2000000", "currency"), "$2.0M");
});
