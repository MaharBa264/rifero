import { apiError, ensureSeed, getD1, priceForSale, sellerFromCredentials } from "@/lib/raffle-db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string; numbers?: number[]; buyerName?: string; buyerPhone?: string; notes?: string; status?: "reserved" | "sold" };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
    const numbers = Array.from(new Set((body.numbers ?? []).map(Number).filter(Number.isInteger)));
    const buyerName = body.buyerName?.trim() ?? "";
    if (numbers.length !== 2) return apiError(new Error("La promo aplica a exactamente 2 números."), 400);
    if (!buyerName) return apiError(new Error("Indicá el nombre de quien compra."), 400);
    const status = body.status === "sold" ? "sold" : "reserved";
    const now = new Date().toISOString();
    const db = getD1();

    if (seller.limitMode === "range") {
      const outOfRange = numbers.some((n) => seller.limitFrom === null || seller.limitTo === null || n < seller.limitFrom || n > seller.limitTo);
      if (outOfRange) return apiError(new Error(`Solo podés vender números del ${seller.limitFrom ?? "?"} al ${seller.limitTo ?? "?"}.`), 403);
    } else {
      const existing = await db.prepare(`SELECT number,seller_id FROM raffle_numbers WHERE number IN (${numbers.map(() => "?").join(",")})`).bind(...numbers).all<{ number: number; seller_id: number | null }>();
      const newOnes = numbers.filter((n) => !existing.results.some((row) => row.number === n && row.seller_id === seller.id)).length;
      const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
      if ((used?.total ?? 0) + newOnes > seller.limitCount) return apiError(new Error(`Ya alcanzaste tu límite de ${seller.limitCount} números.`), 409);
    }

    const current = await db.prepare(`SELECT number,status,seller_id,active FROM raffle_numbers WHERE number IN (${numbers.map(() => "?").join(",")})`).bind(...numbers).all<{ number: number; status: string; seller_id: number | null; active: number }>();
    if (current.results.length !== 2) return apiError(new Error("Alguno de esos números no forma parte de la rifa activa."), 404);
    const blocked = current.results.some((row) => !row.active || (row.status !== "available" && row.seller_id !== seller.id));
    if (blocked) return apiError(new Error("Alguno de esos números ya fue elegido por otra familia."), 409);

    const settings = await ensureSeed();
    const totalPriceCents = priceForSale(settings, 2);
    const perNumberCents = Math.round(totalPriceCents / 2);
    const buyerPhone = body.buyerPhone?.trim() ?? "";
    const notes = body.notes?.trim() ?? "";

    const updates = await db.batch(numbers.map((number) =>
      db.prepare("UPDATE raffle_numbers SET status=?,seller_id=?,buyer_name=?,buyer_phone=?,notes=?,price_cents=?,updated_at=? WHERE number=? AND active=1 AND (status='available' OR seller_id=?)")
        .bind(status, seller.id, buyerName, buyerPhone, notes, perNumberCents, now, number, seller.id),
    ));
    const allChanged = updates.every((result) => result.meta.changes);
    if (!allChanged) {
      await db.batch(numbers.map((number) =>
        db.prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_phone=NULL,notes=NULL,price_cents=NULL,updated_at=? WHERE number=? AND seller_id=?")
          .bind(now, number, seller.id),
      ));
      return apiError(new Error("Alguno de esos números acaba de ser elegido por otra familia. Probá de nuevo."), 409);
    }

    await db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
      .bind(`numbers_${status}`, seller.childName, JSON.stringify({ numbers, buyerName, promo: true }), now).run();
    const used = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers WHERE active=1 AND seller_id=? AND status IN ('reserved','sold')").bind(seller.id).first<{ total: number }>();
    return Response.json({ ok: true, numbers, priceCents: totalPriceCents, status, seller: { ...seller, usedCount: used?.total ?? 0 }, buyerName, buyerPhone, updatedAt: now });
  } catch (error) { return apiError(error); }
}
