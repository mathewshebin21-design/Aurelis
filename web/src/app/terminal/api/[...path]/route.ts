import { apiUrl } from "@/lib/api/server";
import { isAllowed, MAX_PROXY_BODY_BYTES } from "@/lib/api/proxy";

/** Thin pass-through for the allow-listed, compute-only API endpoints. No logic, no maths. */
async function forward(req: Request, segments: string[]): Promise<Response> {
  const path = "/" + segments.map(encodeURIComponent).join("/");
  if (!isAllowed(req.method, path)) return Response.json({ detail: "Not available through the terminal proxy" }, { status: 404 });
  const search = new URL(req.url).search;
  let body: string | undefined;
  if (req.method === "POST") {
    body = await req.text();
    if (body.length > MAX_PROXY_BODY_BYTES) return Response.json({ detail: "Request too large" }, { status: 413 });
  }
  try {
    const res = await fetch(apiUrl() + path + search, {
      method: req.method,
      body,
      headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store",
      signal: req.signal,
    });
    return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json({ detail: "The research service could not be reached" }, { status: 502 });
  }
}

export async function GET(req: Request, ctx: RouteContext<"/terminal/api/[...path]">) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: Request, ctx: RouteContext<"/terminal/api/[...path]">) {
  return forward(req, (await ctx.params).path);
}
