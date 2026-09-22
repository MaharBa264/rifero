import { env } from "cloudflare:workers";

export type RaffleSettings = {
  id: number; title: string; school: string; price_cents: number; number_count: number;
  draw_date: string | null; draw_name: string; official_url: string; result_number: string | null;
  whatsapp_text: string; admin_emails: string; admin_pin_hash: string; updated_at: string;
  hero_title: string; hero_intro: string; logo_image_url: string; hero_image_url: string;
  font_family: string; primary_color: string; secondary_color: string; accent_color: string;
  background_color: string; text_color: string;
};

export function getD1() {
  if (!env.DB) throw new Error("La base de datos no está disponible.");
  return env.DB;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureSeed() {
  const db = getD1();
  const now = new Date().toISOString();
  const settings = await db.prepare("SELECT * FROM raffle_settings WHERE id = 1").first<RaffleSettings>();
  if (!settings) {
    await db.batch([
      db.prepare("INSERT INTO raffle_settings (id,title,school,price_cents,number_count,draw_date,draw_name,official_url,result_number,whatsapp_text,admin_emails,admin_pin_hash,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("La gran rifa de 6.º", "6.º grado", 300000, 100, null, "Lotería de la Ciudad — Quiniela", "https://www.loteriadelaciudad.gob.ar/", null, "¡Gracias por colaborar con nuestra rifa!", "", "3f2dc0ae5ada1a6863993b399a2675f5420f790061db0a3a44e0aca540e892cc", now),
      db.prepare("INSERT INTO prizes (position,title,description,image_url) VALUES (1,?,?,?)").bind("Premio sorpresa", "Próximamente anunciaremos este premio.", ""),
      db.prepare("INSERT INTO prizes (position,title,description,image_url) VALUES (2,?,?,?)").bind("Segundo premio", "Otro motivo para elegir tu número favorito.", ""),
      db.prepare("INSERT INTO sellers (child_name,display_name,pin_hash,active,created_at) VALUES (?,?,?,?,?)")
        .bind("Martina", "Familia de Martina", await sha256("1234"), 1, now),
      db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
        .bind("initial_setup", "system", JSON.stringify({ version: 1 }), now),
    ]);
  }
  const current = settings ?? (await db.prepare("SELECT * FROM raffle_settings WHERE id = 1").first<RaffleSettings>());
  if (!current) throw new Error("No se pudo iniciar la rifa.");
  if (!current.admin_pin_hash) {
    current.admin_pin_hash = "3f2dc0ae5ada1a6863993b399a2675f5420f790061db0a3a44e0aca540e892cc";
    await db.prepare("UPDATE raffle_settings SET admin_pin_hash=? WHERE id=1").bind(current.admin_pin_hash).run();
  }
  const count = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers").first<{ total: number }>();
  if (!count?.total) {
    const statements = Array.from({ length: current.number_count }, (_, number) =>
      db.prepare("INSERT INTO raffle_numbers (number,status,active,updated_at) VALUES (?,'available',1,?)").bind(number, now),
    );
    for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  }
  return current;
}

export async function getPublicData() {
  const db = getD1();
  const settings = await ensureSeed();
  const [prizes, numbers, sellerCount] = await Promise.all([
    db.prepare("SELECT id,position,title,description,image_url FROM prizes ORDER BY position,id").all(),
    db.prepare("SELECT number,status FROM raffle_numbers WHERE active = 1 ORDER BY number").all(),
    db.prepare("SELECT COUNT(*) AS total FROM sellers WHERE active = 1").first<{ total: number }>(),
  ]);
  const { admin_emails: _emails, admin_pin_hash: _pin, ...publicSettings } = settings;
  return { settings: publicSettings, prizes: prizes.results, numbers: numbers.results, sellerCount: sellerCount?.total ?? 0 };
}

export async function sellerFromCredentials(childName: string, pin: string) {
  const seller = await getD1().prepare("SELECT id,child_name,display_name,pin_hash,limit_mode,limit_from,limit_to,limit_count,must_change_pin FROM sellers WHERE lower(child_name)=lower(?) AND active=1")
    .bind(childName.trim()).first<{ id: number; child_name: string; display_name: string; pin_hash: string; limit_mode: "range" | "count"; limit_from: number | null; limit_to: number | null; limit_count: number; must_change_pin: number }>();
  if (!seller || seller.pin_hash !== (await sha256(pin))) return null;
  return { id: seller.id, childName: seller.child_name, displayName: seller.display_name, limitMode: seller.limit_mode, limitFrom: seller.limit_from, limitTo: seller.limit_to, limitCount: seller.limit_count, mustChangePin: Boolean(seller.must_change_pin) };
}

export async function isAdmin(request: Request) {
  const settings = await ensureSeed();
  const key = request.headers.get("x-rifa-admin-key") ?? "";
  return { ok: Boolean(key && (await sha256(key)) === settings.admin_pin_hash), email: "administrador" };
}

export function apiError(error: unknown, status = 500) {
  return Response.json({ error: error instanceof Error ? error.message : "Ocurrió un error inesperado." }, { status });
}
