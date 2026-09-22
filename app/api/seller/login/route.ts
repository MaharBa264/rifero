import { apiError, getD1, sellerFromCredentials } from "@/lib/raffle-db";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { createSession, clientIp } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { newRequestId } from "@/lib/observability";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const body = await request.json() as { childName?: string; pin?: string };
    const childName = (body.childName ?? "").trim();
    const ip = clientIp(request);
    const identity = `seller:${childName.toLowerCase()}`;

    const limit = await checkRateLimit(identity, ip);
    if (!limit.allowed) return apiError(new Error(`Demasiados intentos. Probá de nuevo en ${limit.retryAfterSeconds} segundos.`), 429);

    const seller = await sellerFromCredentials(childName, body.pin ?? "");
    await recordAttempt(identity, ip, Boolean(seller));
    const db = getD1();
    if (!seller) {
      await logAudit(db, { action: "seller_login_failed", actorLabel: childName || "desconocido", actorType: "public", entityType: "seller", requestId });
      return apiError(new Error("Nombre o PIN incorrecto."), 401);
    }

    const { cookie } = await createSession("seller", seller.id, request);
    await logAudit(db, { action: "seller_login", actorLabel: seller.childName, actorType: "seller", actorId: seller.id, entityType: "seller", entityId: seller.id, requestId });
    const sales = await db.prepare("SELECT number,status,buyer_name,buyer_last_name,buyer_phone,buyer_email,price_cents,updated_at FROM raffle_numbers WHERE seller_id=? AND active=1 ORDER BY updated_at DESC")
      .bind(seller.id).all();
    const used = sales.results.length;
    const response = Response.json({ seller: { ...seller, usedCount: used }, sales: sales.results });
    response.headers.set("set-cookie", cookie);
    return response;
  } catch (error) { return apiError(error); }
}
