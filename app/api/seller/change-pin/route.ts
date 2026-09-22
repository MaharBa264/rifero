import { apiError, getD1, sellerFromCredentials, sha256 } from "@/lib/raffle-db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { childName?: string; pin?: string; newPin?: string };
    const seller = await sellerFromCredentials(body.childName ?? "", body.pin ?? "");
    if (!seller) return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
    const newPin = String(body.newPin ?? "").trim();
    if (newPin.length < 4) return apiError(new Error("El nuevo PIN debe tener al menos 4 caracteres."), 400);
    if (newPin === String(body.pin ?? "").trim()) return apiError(new Error("Elegí un PIN distinto al actual."), 400);
    await getD1().prepare("UPDATE sellers SET pin_hash=?,must_change_pin=0 WHERE id=?").bind(await sha256(newPin), seller.id).run();
    return Response.json({ ok: true, seller: { ...seller, mustChangePin: false } });
  } catch (error) { return apiError(error); }
}
