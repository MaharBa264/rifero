import { apiError, ensureSeed, getD1, isAdmin } from "@/lib/raffle-db";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const admin = await isAdmin(request);
    if (!admin.ok) return apiError(new Error("Necesitás ingresar como administrador."), 403);
    const db = getD1();
    const settings = await ensureSeed();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const [prizes, sellers, numbers, audit] = await Promise.all([
      db.prepare("SELECT * FROM prizes ORDER BY position,id").all(),
      db.prepare("SELECT id,child_name,display_name,active,limit_mode,limit_from,limit_to,limit_count,created_at FROM sellers ORDER BY id").all(),
      db.prepare("SELECT n.*,s.child_name AS seller_name FROM raffle_numbers n LEFT JOIN sellers s ON s.id=n.seller_id ORDER BY n.number").all(),
      db.prepare("SELECT * FROM audit_log ORDER BY id").all(),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const header = ["numero", "estado", "vendedor", "comprador", "telefono", "notas", "actualizado"];
      const rows = numbers.results.map((n) => {
        const row = n as Record<string, unknown>;
        return [row.number,row.status,row.seller_name,row.buyer_name,row.buyer_phone,row.notes,row.updated_at].map(csvCell).join(",");
      });
      return new Response([header.join(","), ...rows].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=rifa-${stamp}.csv` } });
    }
    const { admin_pin_hash: _pin, ...safeSettings } = settings;
    const payload = { version: 2, exportedAt: new Date().toISOString(), settings: safeSettings, prizes: prizes.results, sellers: sellers.results, numbers: numbers.results, audit: audit.results };
    return new Response(JSON.stringify(payload, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename=rifa-${stamp}.json` } });
  } catch (error) { return apiError(error); }
}
