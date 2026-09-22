import { env } from "cloudflare:workers";

/**
 * Verifies a Cloudflare Turnstile token server-side. Feature-flagged: if no
 * secret key is configured for this deployment, verification is skipped and
 * this returns `ok: true` so existing deployments without Turnstile keep
 * working. Set `TURNSTILE_SECRET_KEY` (wrangler secret) to enforce it — meant
 * for the admin login and admin recovery endpoints.
 */
export async function verifyTurnstile(token: string | undefined, request: Request): Promise<{ ok: boolean; error?: string }> {
  const secret = (env as unknown as { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token) return { ok: false, error: "Falta la verificación de seguridad (Turnstile)." };
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = await response.json() as { success: boolean };
    return result.success ? { ok: true } : { ok: false, error: "No pudimos verificar que sos una persona. Probá de nuevo." };
  } catch {
    return { ok: false, error: "No pudimos validar la verificación de seguridad." };
  }
}
