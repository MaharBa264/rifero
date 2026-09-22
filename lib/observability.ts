// Structured logging + request correlation ids. Cloudflare Workers ship
// console output to `wrangler tail` / the dashboard, so JSON lines here are
// what an operator greps in production. Never pass secrets (PINs, tokens,
// recovery codes) into `meta`.

export function newRequestId() {
  return crypto.randomUUID();
}

type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Wraps a route handler: assigns a request id, logs unhandled errors with it, and stamps it on the response. */
export function withRequestContext(handler: (request: Request, requestId: string) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") || newRequestId();
    try {
      const response = await handler(request, requestId);
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      logEvent("error", "unhandled_route_error", { requestId, path: new URL(request.url).pathname, error: error instanceof Error ? error.message : String(error) });
      const response = Response.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}
