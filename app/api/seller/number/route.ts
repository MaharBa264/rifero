import { apiError, getD1, sellerFromCredentials } from "@/lib/raffle-db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string; number?: number; buyerName?: string; buyerPhone?: string; notes?: string; status?: "reserved" | "sold" };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
    const number = Number(body.number);
    const buyerName = body.buyerName?.trim() ?? "";
    if (!Number.isInteger(number) || !buyerName) return apiError(new Error("Indicá el número y el nombre de quien compra."), 400);
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
    const result = await db.prepare("UPDATE raffle_numbers SET status=?,seller_id=?,buyer_name=?,buyer_phone=?,notes=?,updated_at=? WHERE number=? AND active=1 AND (status='available' OR seller_id=?)")
      .bind(status, seller.id, buyerName, body.buyerPhone?.trim() ?? "", body.notes?.trim() ?? "", now, number, seller.id).run();
    if (!result.meta.changes) return apiError(new Error("Ese número acaba de ser elegido por otra familia."), 409);
    await db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
      .bind(`number_${status}`, seller.childName, JSON.stringify({ number, buyerName }), now).run();
    const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
    return Response.json({ ok: true, number, status, seller: { ...seller, usedCount: used?.total ?? 0 }, buyerName, buyerPhone: body.buyerPhone?.trim() ?? "", updatedAt: now });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string; number?: number };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
    const result = await getD1().prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_phone=NULL,notes=NULL,updated_at=? WHERE number=? AND seller_id=?")
      .bind(new Date().toISOString(), Number(body.number), seller.id).run();
    if (!result.meta.changes) return apiError(new Error("No se pudo liberar ese número."), 409);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
