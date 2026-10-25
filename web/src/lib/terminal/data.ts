import "server-only";
import { cache } from "react";
import { api } from "@/lib/api/server";

/** Per-request memoised reads, so a layout and its page share one API call. */
export const getCompany = cache((ref: string) => api.get("/v1/companies/{ref}", { params: { ref } }));
export const getFreshness = cache((ref: string) => api.get("/v1/companies/{ref}/freshness", { params: { ref } }));
export const getMetrics = cache((ref: string, limit = 5) => api.get("/v1/companies/{ref}/metrics", { params: { ref }, query: { limit } }));
export const getScorecard = cache((ref: string) => api.get("/v1/companies/{ref}/scorecard", { params: { ref } }));
export const getStatement = cache((ref: string, statement: "income" | "balance" | "cashflow", period: "FY" | "Q" = "FY", limit = 5) =>
  api.get("/v1/companies/{ref}/statements/{statement}", { params: { ref, statement }, query: { period, limit } }),
);
export const getLatestResearch = cache((ref: string) => api.get("/v1/companies/{ref}/research", { params: { ref } }));

/** Tickers in URLs are case-insensitive; the API resolves tickers and CIKs. */
export const isValidRef = (ref: string) => /^[A-Za-z0-9.\-]{1,16}$/.test(ref);
