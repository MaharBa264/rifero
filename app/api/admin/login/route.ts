import { apiError, getD1, verifyAdminPin } from "@/lib/raffle-db";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { createSession, clientIp } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";
import { logAudit } from "@/lib/audit";
import { newRequestId } from "@/lib/observability";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const body = await request.json() as { key?: string; turnstileToken?: string };
    const ip = clientIp(request);
    const identity = "admin";

    const limit = await checkRateLimit(identity, ip);
    if (!limit.allowed) return apiError(new Error(`Demasiados intentos. Probá de nuevo en ${limit.retryAfterSeconds} segundos.`), 429);

    const turnstile = await verifyTurnstile(body.turnstileToken, request);
    if (!turnstile.ok) return apiError(new Error(turnstile.error ?? "Verificación de seguridad inválida."), 400);

    const ok = await verifyAdminPin(body.key ?? "");
    await recordAttempt(identity, ip, ok);
    const db = getD1();
    if (!ok) {
      await logAudit(db, { action: "admin_login_failed", actorLabel: "administrador", actorType: "public", entityType: "admin", requestId });
      return apiError(new Error("Clave incorrecta."), 401);
    }

    const { cookie } = await createSession("admin", null, request);
    await logAudit(db, { action: "admin_login", actorLabel: "administrador", actorType: "admin", entityType: "admin", requestId });
    const response = Response.json({ ok: true });
    response.headers.set("set-cookie", cookie);
    return response;
  } catch (error) { return apiError(error); }
}
