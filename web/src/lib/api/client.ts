/**
 * Typed access to the AURELIS API. Types are generated from the FastAPI OpenAPI
 * contract (`shared/openapi.json` → `schema.d.ts`), so a backend change that breaks
 * the frontend fails typecheck instead of failing at runtime.
 *
 * Every call returns a result object rather than throwing, so each screen renders
 * "not found", "not ingested", "invalid assumptions" and "unavailable" states
 * deliberately.
 */
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];

type JsonOf<R> = R extends { content: { "application/json": infer J } } ? J : never;
type Ok<Op> = Op extends { responses: { 200: infer R } } ? JsonOf<R> : never;
type Body<Op> = Op extends { requestBody: { content: { "application/json": infer B } } } ? B : never;

export type GetPath = { [P in keyof paths]: paths[P] extends { get: object } ? P : never }[keyof paths];
export type PostPath = { [P in keyof paths]: paths[P] extends { post: object } ? P : never }[keyof paths];
export type GetResponse<P extends GetPath> = Ok<paths[P]["get"]>;
export type PostResponse<P extends PostPath> = Ok<paths[P]["post"]>;
export type PostBody<P extends PostPath> = Body<paths[P]["post"]>;

export type ApiError = { ok: false; status: number; detail: string };
export type ApiResult<T> = { ok: true; data: T } | ApiError;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Fill `{name}` path parameters; values are URI-encoded. */
export function fillPath(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in params)) throw new Error(`Missing path parameter '${k}' for ${template}`);
    return encodeURIComponent(String(params[k]));
  });
}

export function withQuery(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(query ?? {}).filter(([, v]) => v !== undefined) as [string, string | number | boolean][];
  if (!entries.length) return path;
  return `${path}?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

/** FastAPI errors are `{"detail": string}` or, for validation, `{"detail": [{msg, loc}]}`. */
export function errorDetail(body: unknown, status: number): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((e: { msg?: string; loc?: unknown[] }) => [e.loc?.filter((x) => x !== "body").join("."), e.msg].filter(Boolean).join(": "))
      .join("; ");
  }
  return status >= 500 ? "The research service is unavailable" : `Request failed (${status})`;
}

export async function request<T>(fetchImpl: Fetch, url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e; // superseded request: the caller ignores it
    return { ok: false, status: 0, detail: "The research service could not be reached" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) return { ok: false, status: res.status, detail: errorDetail(body, res.status) };
  return { ok: true, data: body as T };
}

export function createClient(baseUrl: string, fetchImpl: Fetch = fetch) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    get<P extends GetPath>(
      path: P,
      opts: { params?: Record<string, string | number>; query?: Record<string, string | number | boolean | undefined>; init?: RequestInit } = {},
    ): Promise<ApiResult<GetResponse<P>>> {
      return request(fetchImpl, base + withQuery(fillPath(path, opts.params), opts.query), opts.init);
    },
    post<P extends PostPath>(path: P, body: PostBody<P>, init?: RequestInit): Promise<ApiResult<PostResponse<P>>> {
      return request(fetchImpl, base + fillPath(path), {
        ...init,
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
