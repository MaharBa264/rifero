import { apiError, ensureSeed, getD1 } from "@/lib/raffle-db";
import { hashSecret, sha256 } from "@/lib/security";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { createSession, clientIp } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";
import { logAudit } from "@/lib/audit";
import { newRequestId } from "@/lib/observability";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const body = await request.json() as { code?: string; newPin?: string; turnstileToken?: string };
    const code = String(body.code ?? "").trim().toUpperCase();
    const newPin = String(body.newPin ?? "").trim();
    if (!code) return apiError(new Error("Ingresá el código de recuperación."), 400);
    if (newPin.length < 8) return apiError(new Error("La clave administradora debe tener al menos 8 caracteres."), 400);

    const ip = clientIp(request);
    const identity = "admin_recovery";
    const limit = await checkRateLimit(identity, ip);
    if (!limit.allowed) return apiError(new Error(`Demasiados intentos. Probá de nuevo en ${limit.retryAfterSeconds} segundos.`), 429);

    const turnstile = await verifyTurnstile(body.turnstileToken, request);
    if (!turnstile.ok) return apiError(new Error(turnstile.error ?? "Verificación de seguridad inválida."), 400);

    const settings = await ensureSeed();
    const db = getD1();
    if (!settings.admin_recovery_code_hash) {
      await recordAttempt(identity, ip, false);
      return apiError(new Error("Todavía no se generó un código de recuperación para esta rifa."), 404);
    }
    const matches = (await sha256(code)) === settings.admin_recovery_code_hash;
    await recordAttempt(identity, ip, matches);
    if (!matches) {
      await logAudit(db, { action: "admin_recovery_failed", actorLabel: "recuperación", actorType: "public", entityType: "admin", requestId });
      return apiError(new Error("El código de recuperación no es válido."), 401);
    }

    await db.prepare("UPDATE raffle_settings SET admin_pin_hash=?,admin_recovery_code_hash=NULL WHERE id=1").bind(await hashSecret(newPin)).run();
    await logAudit(db, { action: "admin_recovery_used", actorLabel: "recuperación", actorType: "admin", entityType: "admin", requestId });

    const { cookie } = await createSession("admin", null, request);
    const response = Response.json({ ok: true });
    response.headers.set("set-cookie", cookie);
    return response;
  } catch (error) { return apiError(error); }
}
