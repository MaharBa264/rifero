import { apiError, ensureSeed, getD1, priceForSale, sellerFromCredentials } from "@/lib/raffle-db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string; number?: number; buyerName?: string; buyerLastName?: string; buyerPhone?: string; buyerEmail?: string; notes?: string; status?: "reserved" | "sold" };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
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
    const settings = await ensureSeed();
    const priceCents = priceForSale(settings, 1);
    const result = await db.prepare("UPDATE raffle_numbers SET status=?,seller_id=?,buyer_name=?,buyer_last_name=?,buyer_phone=?,buyer_email=?,notes=?,price_cents=?,updated_at=? WHERE number=? AND active=1 AND (status='available' OR seller_id=?)")
      .bind(status, seller.id, buyerName, buyerLastName, buyerPhone, buyerEmail, body.notes?.trim() ?? "", priceCents, now, number, seller.id).run();
    if (!result.meta.changes) return apiError(new Error("Ese número acaba de ser elegido por otra familia."), 409);
    await db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
      .bind(`number_${status}`, seller.childName, JSON.stringify({ number, buyerName, buyerLastName }), now).run();
    const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
    return Response.json({ ok: true, numbers: [number], priceCents, status, seller: { ...seller, usedCount: used?.total ?? 0 }, buyerName, buyerLastName, buyerPhone, buyerEmail, updatedAt: now });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string; number?: number };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
    const result = await getD1().prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_last_name=NULL,buyer_phone=NULL,buyer_email=NULL,notes=NULL,price_cents=NULL,updated_at=? WHERE number=? AND seller_id=?")
      .bind(new Date().toISOString(), Number(body.number), seller.id).run();
    if (!result.meta.changes) return apiError(new Error("No se pudo liberar ese número."), 409);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
