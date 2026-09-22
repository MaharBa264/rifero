import { apiError, ensureSeed, getD1, priceForSale } from "@/lib/raffle-db";
import { AuthRequiredError, requireSeller, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { newRequestId } from "@/lib/observability";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const seller = await requireSeller(request);
    const settings = await ensureSeed();
    if (settings.roster_closed_at) return apiError(new Error("El padrón de esta rifa ya está cerrado. No se pueden cargar más ventas."), 409);
    return withIdempotency("seller_number", request.headers.get("idempotency-key"), async () => {
      const body = await request.json() as { number?: number; buyerName?: string; buyerLastName?: string; buyerPhone?: string; buyerEmail?: string; notes?: string; status?: "reserved" | "sold" };
      const number = Number(body.number);
      const buyerName = body.buyerName?.trim() ?? "";
      const buyerLastName = body.buyerLastName?.trim() ?? "";
      const buyerPhone = body.buyerPhone?.trim() ?? "";
      const buyerEmail = body.buyerEmail?.trim() ?? "";
      if (!Number.isInteger(number)) return apiError(new Error("Indicá el número."), 400);
      if (!buyerName || !buyerLastName) return apiError(new Error("Indicá el nombre y el apellido de quien compra."), 400);
      if (!buyerPhone && !buyerEmail) return apiError(new Error("Indicá al menos un teléfono o un email de contacto."), 400);
      const status = body.status === "sold" ? "sold" : "reserved";
      const now = new Date().toISOString();
      const db = getD1();
      const current = await db.prepare("SELECT status,seller_id FROM raffle_numbers WHERE number=? AND active=1").bind(number).first<{ status: string; seller_id: number | null }>();
      if (!current) return apiError(new Error("Ese número no forma parte de la rifa activa."), 404);
      const isAlreadyOwned = current.seller_id === seller.id;
      if (seller.limitMode === "range") {
        if (seller.limitFrom === null || seller.limitTo === null || number < seller.limitFrom || number > seller.limitTo) {
          return apiError(new Error(`Solo podés vender números del ${seller.limitFrom ?? "?"} al ${seller.limitTo ?? "?"}.`), 403);
        }
      } else if (!isAlreadyOwned) {
        const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
        if ((used?.total ?? 0) >= seller.limitCount) return apiError(new Error(`Ya alcanzaste tu límite de ${seller.limitCount} números.`), 409);
      }
      if (status === "reserved" && seller.maxReservedPerSeller !== null && current.status !== "reserved") {
        const reserved = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status='reserved'").bind(seller.id).first<{ total: number }>();
        if ((reserved?.total ?? 0) >= seller.maxReservedPerSeller) return apiError(new Error(`Ya alcanzaste el máximo de ${seller.maxReservedPerSeller} números reservados sin vender. Marcá alguno como pagado o liberalo antes de reservar otro.`), 409);
      }
      const priceCents = priceForSale(settings, 1);
      const result = await db.prepare("UPDATE raffle_numbers SET status=?,seller_id=?,buyer_name=?,buyer_last_name=?,buyer_phone=?,buyer_email=?,notes=?,price_cents=?,updated_at=? WHERE number=? AND active=1 AND (status='available' OR seller_id=?)")
        .bind(status, seller.id, buyerName, buyerLastName, buyerPhone, buyerEmail, body.notes?.trim() ?? "", priceCents, now, number, seller.id).run();
      if (!result.meta.changes) return apiError(new Error("Ese número acaba de ser elegido por otra familia."), 409);
      await logAudit(db, { action: `number_${status}`, actorLabel: seller.childName, actorType: "seller", actorId: seller.id, entityType: "raffle_number", entityId: number, after: { status, buyerName, buyerLastName }, requestId });
      const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
      return Response.json({ ok: true, numbers: [number], priceCents, status, seller: { ...seller, usedCount: used?.total ?? 0 }, buyerName, buyerLastName, buyerPhone, buyerEmail, updatedAt: now });
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return authErrorResponse();
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  const requestId = newRequestId();
  try {
    const seller = await requireSeller(request);
    const settings = await ensureSeed();
    if (settings.roster_closed_at) return apiError(new Error("El padrón de esta rifa ya está cerrado."), 409);
    const body = await request.json() as { number?: number };
    const db = getD1();
    const result = await db.prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_last_name=NULL,buyer_phone=NULL,buyer_email=NULL,notes=NULL,price_cents=NULL,updated_at=? WHERE number=? AND seller_id=?")
      .bind(new Date().toISOString(), Number(body.number), seller.id).run();
    if (!result.meta.changes) return apiError(new Error("No se pudo liberar ese número."), 409);
    await logAudit(db, { action: "number_released", actorLabel: seller.childName, actorType: "seller", actorId: seller.id, entityType: "raffle_number", entityId: Number(body.number), requestId });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthRequiredError) return authErrorResponse();
    return apiError(error);
  }
}
