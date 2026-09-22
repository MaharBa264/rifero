/** Extracts the `name=value` pair from a Set-Cookie header, dropping attributes, so it can be replayed as a Cookie header in the next request — mimics what a browser does automatically. */
export function cookieFromSetCookie(setCookie: string | null) {
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}

export function jsonRequest(url: string, init: { method?: string; body?: unknown; cookie?: string | null; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`https://rifa.test${url}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

export function getRequest(url: string, cookie?: string | null) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request(`https://rifa.test${url}`, { headers });
}
