import { apiError, ensureSeed, getD1 } from "@/lib/raffle-db";
import { AuthRequiredError, requireAdminSession } from "@/lib/auth";

export const BACKUP_SCHEMA_VERSION = 3;

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    await requireAdminSession(request);
    const db = getD1();
    const settings = await ensureSeed();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const [prizes, sellers, numbers, audit] = await Promise.all([
      db.prepare("SELECT * FROM prizes ORDER BY position,id").all(),
      db.prepare("SELECT id,child_name,display_name,active,limit_mode,limit_from,limit_to,limit_count,deleted_at,created_at FROM sellers ORDER BY id").all(),
      db.prepare("SELECT n.*,s.child_name AS seller_name FROM raffle_numbers n LEFT JOIN sellers s ON s.id=n.seller_id ORDER BY n.number").all(),
      db.prepare("SELECT * FROM audit_log ORDER BY id").all(),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const header = ["numero", "estado", "vendedor", "comprador_nombre", "comprador_apellido", "telefono", "email", "precio_centavos", "notas", "actualizado"];
      const rows = numbers.results.map((n) => {
        const row = n as Record<string, unknown>;
        return [row.number,row.status,row.seller_name,row.buyer_name,row.buyer_last_name,row.buyer_phone,row.buyer_email,row.price_cents,row.notes,row.updated_at].map(csvCell).join(",");
      });
      return new Response([header.join(","), ...rows].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=rifa-${stamp}.csv` } });
    }
    const { admin_pin_hash: _pin, admin_recovery_code_hash: _recovery, ...safeSettings } = settings;
    const payload = { version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings: safeSettings, prizes: prizes.results, sellers: sellers.results, numbers: numbers.results, audit: audit.results };
    return new Response(JSON.stringify(payload, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename=rifa-${stamp}.json` } });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(new Error("Necesitás ingresar como administrador."), 403);
    return apiError(error);
  }
}
