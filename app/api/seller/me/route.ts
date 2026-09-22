import { apiError, getD1 } from "@/lib/raffle-db";
import { AuthRequiredError, requireSeller } from "@/lib/auth";

/** Bootstraps the seller session on page load — replaces restoring credentials from client storage. */
export async function GET(request: Request) {
  try {
    const seller = await requireSeller(request);
    const db = getD1();
    const sales = await db.prepare("SELECT number,status,buyer_name,buyer_last_name,buyer_phone,buyer_email,price_cents,updated_at FROM raffle_numbers WHERE seller_id=? AND active=1 ORDER BY updated_at DESC")
      .bind(seller.id).all();
    return Response.json({ seller: { ...seller, usedCount: sales.results.length }, sales: sales.results });
  } catch (error) {
    if (error instanceof AuthRequiredError) return Response.json({ seller: null, sales: [] });
    return apiError(error);
  }
}
