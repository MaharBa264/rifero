import { apiError, ensureSeed, getD1, sha256 } from "@/lib/raffle-db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; newPin?: string };
    const code = String(body.code ?? "").trim().toUpperCase();
    const newPin = String(body.newPin ?? "").trim();
    if (!code) return apiError(new Error("Ingresá el código de recuperación."), 400);
    if (newPin.length < 8) return apiError(new Error("La clave administradora debe tener al menos 8 caracteres."), 400);
    const settings = await ensureSeed();
    if (!settings.admin_recovery_code_hash) return apiError(new Error("Todavía no se generó un código de recuperación para esta rifa."), 404);
    if ((await sha256(code)) !== settings.admin_recovery_code_hash) return apiError(new Error("El código de recuperación no es válido."), 401);
    const db = getD1();
    const now = new Date().toISOString();
    await db.prepare("UPDATE raffle_settings SET admin_pin_hash=?,admin_recovery_code_hash=NULL WHERE id=1").bind(await sha256(newPin)).run();
    await db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
      .bind("admin_recovery_used", "recuperación", JSON.stringify({}), now).run();
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
