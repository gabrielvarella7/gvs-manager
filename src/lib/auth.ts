import { requireIdentity } from "../../cursor/identity";

export type Viewer = {
  sub: string;
  stage: "production" | "preview";
  name: string;
  email: string;
  simulated: boolean;
};

export async function requireViewer(
  request: Request,
): Promise<Viewer | Response> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  if (identity.kind === "key") {
    return Response.json(
      { error: "API keys não podem usar este app" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  return {
    sub: identity.sub,
    stage: identity.stage,
    name: identity.name,
    email: identity.email,
    simulated: identity.simulated === true,
  };
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}
