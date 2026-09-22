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
    return withIdempotency("seller_numbers", request.headers.get("idempotency-key"), async () => {
      const body = await request.json() as { numbers?: number[]; buyerName?: string; buyerLastName?: string; buyerPhone?: string; buyerEmail?: string; notes?: string; status?: "reserved" | "sold" };
      const numbers = Array.from(new Set((body.numbers ?? []).map(Number).filter(Number.isInteger)));
      const buyerName = body.buyerName?.trim() ?? "";
      const buyerLastName = body.buyerLastName?.trim() ?? "";
      const buyerPhone = body.buyerPhone?.trim() ?? "";
      const buyerEmail = body.buyerEmail?.trim() ?? "";
      if (numbers.length !== 2) return apiError(new Error("La promo aplica a exactamente 2 números."), 400);
      if (!buyerName || !buyerLastName) return apiError(new Error("Indicá el nombre y el apellido de quien compra."), 400);
      if (!buyerPhone && !buyerEmail) return apiError(new Error("Indicá al menos un teléfono o un email de contacto."), 400);
      const status = body.status === "sold" ? "sold" : "reserved";
      const now = new Date().toISOString();
      const db = getD1();

      const current = await db.prepare(`SELECT number,status,seller_id,active FROM raffle_numbers WHERE number IN (${numbers.map(() => "?").join(",")})`).bind(...numbers).all<{ number: number; status: string; seller_id: number | null; active: number }>();
      if (current.results.length !== 2) return apiError(new Error("Alguno de esos números no forma parte de la rifa activa."), 404);
      const blocked = current.results.some((row) => !row.active || (row.status !== "available" && row.seller_id !== seller.id));
      if (blocked) return apiError(new Error("Alguno de esos números ya fue elegido por otra familia."), 409);

      if (seller.limitMode === "range") {
        const outOfRange = numbers.some((n) => seller.limitFrom === null || seller.limitTo === null || n < seller.limitFrom || n > seller.limitTo);
        if (outOfRange) return apiError(new Error(`Solo podés vender números del ${seller.limitFrom ?? "?"} al ${seller.limitTo ?? "?"}.`), 403);
      } else {
        const newOnes = current.results.filter((row) => row.seller_id !== seller.id).length;
        const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
        if ((used?.total ?? 0) + newOnes > seller.limitCount) return apiError(new Error(`Ya alcanzaste tu límite de ${seller.limitCount} números.`), 409);
      }

      if (status === "reserved" && seller.maxReservedPerSeller !== null) {
        const newReservations = current.results.filter((row) => row.status !== "reserved" || row.seller_id !== seller.id).length;
        const reserved = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status='reserved'").bind(seller.id).first<{ total: number }>();
        if ((reserved?.total ?? 0) + newReservations > seller.maxReservedPerSeller) return apiError(new Error(`Ya alcanzaste el máximo de ${seller.maxReservedPerSeller} números reservados sin vender. Marcá alguno como pagado o liberalo antes de reservar otro.`), 409);
      }

      const totalPriceCents = priceForSale(settings, 2);
      const perNumberCents = Math.round(totalPriceCents / 2);
      const notes = body.notes?.trim() ?? "";

      const updates = await db.batch(numbers.map((number) =>
        db.prepare("UPDATE raffle_numbers SET status=?,seller_id=?,buyer_name=?,buyer_last_name=?,buyer_phone=?,buyer_email=?,notes=?,price_cents=?,updated_at=? WHERE number=? AND active=1 AND (status='available' OR seller_id=?)")
          .bind(status, seller.id, buyerName, buyerLastName, buyerPhone, buyerEmail, notes, perNumberCents, now, number, seller.id),
      ));
      const allChanged = updates.every((result) => result.meta.changes);
      if (!allChanged) {
        await db.batch(numbers.map((number) =>
          db.prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_last_name=NULL,buyer_phone=NULL,buyer_email=NULL,notes=NULL,price_cents=NULL,updated_at=? WHERE number=? AND seller_id=?")
            .bind(now, number, seller.id),
        ));
        return apiError(new Error("Alguno de esos números acaba de ser elegido por otra familia. Probá de nuevo."), 409);
      }

      await logAudit(db, { action: `numbers_${status}`, actorLabel: seller.childName, actorType: "seller", actorId: seller.id, entityType: "raffle_number_pair", entityId: numbers.join("-"), after: { numbers, buyerName, buyerLastName, promo: true }, requestId });
      const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
      return Response.json({ ok: true, numbers, priceCents: totalPriceCents, status, seller: { ...seller, usedCount: used?.total ?? 0 }, buyerName, buyerLastName, buyerPhone, buyerEmail, updatedAt: now });
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return authErrorResponse();
    return apiError(error);
  }
}
