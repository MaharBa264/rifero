import { apiError, getD1, sellerFromCredentials } from "@/lib/raffle-db";
import { hashSecret } from "@/lib/security";
import { AuthRequiredError, requireSeller, authErrorResponse } from "@/lib/auth";
import { revokeAllSessionsFor, createSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { newRequestId } from "@/lib/observability";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const seller = await requireSeller(request);
    const body = await request.json() as { currentPin?: string; newPin?: string };
    const currentPin = String(body.currentPin ?? "").trim();
    const newPin = String(body.newPin ?? "").trim();
    if (newPin.length < 4) return apiError(new Error("El nuevo PIN debe tener al menos 4 caracteres."), 400);
    if (newPin === currentPin) return apiError(new Error("Elegí un PIN distinto al actual."), 400);
    const verified = await sellerFromCredentials(seller.childName, currentPin);
    if (!verified) return apiError(new Error("El PIN actual no es correcto."), 401);

    const db = getD1();
    await db.prepare("UPDATE sellers SET pin_hash=?,must_change_pin=0 WHERE id=?").bind(await hashSecret(newPin), seller.id).run();
    await revokeAllSessionsFor("seller", seller.id);
    const { cookie } = await createSession("seller", seller.id, request);
    await logAudit(db, { action: "seller_change_pin", actorLabel: seller.childName, actorType: "seller", actorId: seller.id, entityType: "seller", entityId: seller.id, requestId });

    const response = Response.json({ ok: true, seller: { ...seller, mustChangePin: false } });
    response.headers.set("set-cookie", cookie);
    return response;
  } catch (error) {
    if (error instanceof AuthRequiredError) return authErrorResponse();
    return apiError(error);
  }
}
