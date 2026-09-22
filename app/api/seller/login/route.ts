import { apiError, getD1, sellerFromCredentials } from "@/lib/raffle-db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("Nombre o PIN incorrecto."), 401);
    const sales = await getD1().prepare("SELECT number,status,buyer_name,buyer_last_name,buyer_phone,buyer_email,price_cents,updated_at FROM raffle_numbers WHERE seller_id=? AND active=1 ORDER BY updated_at DESC")
      .bind(seller.id).all();
    return Response.json({ seller: { ...seller, usedCount: sales.results.length }, sales: sales.results });
  } catch (error) { return apiError(error); }
}
