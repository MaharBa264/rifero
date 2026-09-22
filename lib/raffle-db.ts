import { env } from "cloudflare:workers";
import { hashSecret, sha256, verifySecret } from "@/lib/security";
import { logEvent } from "@/lib/observability";

export { sha256 };

export type RaffleSettings = {
  id: number; title: string; school: string; price_cents: number; promo_pair_price_cents: number | null; max_reserved_per_seller: number | null; start_number: number; number_count: number;
  draw_date: string | null; draw_name: string; official_url: string; result_number: string | null;
  whatsapp_text: string; admin_emails: string; admin_pin_hash: string; admin_recovery_code_hash: string | null; updated_at: string;
  hero_title: string; hero_intro: string; logo_image_url: string; hero_image_url: string;
  font_family: string; primary_color: string; secondary_color: string; accent_color: string;
  background_color: string; text_color: string;
  draw_resolution_method: "direct" | "official_lottery_mapping";
  official_lottery_name: string | null; official_draw_name: string | null; official_draw_date: string | null; official_draw_url: string | null;
  official_result_count: number | null; official_result_digits: number | null;
  mapping_number_count: number | null; mapping_start_number: number | null; mapping_result_space: number | null; mapping_valid_result_limit: number | null;
  draw_resolution_note: string; unclaimed_winner_policy: "no_winner" | "next_valid_official_position"; show_winner_buyer_name: number;
  roster_closed_at: string | null; roster_hash: string | null; roster_sold_count: number | null;
  active_draw_resolution_id: number | null;
};

export type DrawResolutionRow = {
  id: number; official_results_json: string; discarded_json: string; position_used: number | null; official_result_used: number | null;
  winner_number: number | null; winner_was_sold: number | null; status: "resolved" | "exhausted"; unclaimed_policy: string; formula: string | null;
  correction_of: number | null; correction_reason: string | null; resolved_by: string; created_at: string;
};

export function getD1() {
  if (!env.DB) throw new Error("La base de datos no está disponible.");
  return env.DB;
}

export async function ensureSeed() {
  const db = getD1();
  const now = new Date().toISOString();
  const settings = await db.prepare("SELECT * FROM raffle_settings WHERE id = 1").first<RaffleSettings>();
  if (!settings) {
    await db.batch([
      db.prepare("INSERT INTO raffle_settings (id,title,school,price_cents,number_count,draw_date,draw_name,official_url,result_number,whatsapp_text,admin_emails,admin_pin_hash,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("La gran rifa de 6.º", "6.º grado", 300000, 100, null, "Lotería de la Ciudad — Quiniela", "https://www.loteriadelaciudad.gob.ar/", null, "¡Gracias por colaborar con nuestra rifa!", "", await hashSecret("admin1234"), now),
      db.prepare("INSERT INTO prizes (position,title,description,image_url) VALUES (1,?,?,?)").bind("Premio sorpresa", "Próximamente anunciaremos este premio.", ""),
      db.prepare("INSERT INTO prizes (position,title,description,image_url) VALUES (2,?,?,?)").bind("Segundo premio", "Otro motivo para elegir tu número favorito.", ""),
      db.prepare("INSERT INTO sellers (child_name,display_name,pin_hash,active,created_at) VALUES (?,?,?,?,?)")
        .bind("Olivia", "Familia de Olivia", await hashSecret("1234"), 1, now),
      db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
        .bind("initial_setup", "system", JSON.stringify({ version: 1 }), now),
    ]);
  }
  const current = settings ?? (await db.prepare("SELECT * FROM raffle_settings WHERE id = 1").first<RaffleSettings>());
  if (!current) throw new Error("No se pudo iniciar la rifa.");
  if (!current.admin_pin_hash) {
    current.admin_pin_hash = await hashSecret("admin1234");
    await db.prepare("UPDATE raffle_settings SET admin_pin_hash=? WHERE id=1").bind(current.admin_pin_hash).run();
  }
  const count = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers").first<{ total: number }>();
  if (!count?.total) {
    const statements = Array.from({ length: current.number_count }, (_, i) => current.start_number + i).map((number) =>
      db.prepare("INSERT INTO raffle_numbers (number,status,active,updated_at) VALUES (?,'available',1,?)").bind(number, now),
    );
    for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  }
  return current;
}

export async function getPublicData() {
  const db = getD1();
  const settings = await ensureSeed();
  const [prizes, numbers, sellerCount, resolution] = await Promise.all([
    db.prepare("SELECT id,position,title,description,image_url FROM prizes ORDER BY position,id").all(),
    db.prepare("SELECT number,status FROM raffle_numbers WHERE active = 1 ORDER BY number").all(),
    db.prepare("SELECT COUNT(*) AS total FROM sellers WHERE active = 1 AND deleted_at IS NULL").first<{ total: number }>(),
    settings.active_draw_resolution_id
      ? db.prepare(settings.show_winner_buyer_name
          ? "SELECT r.*,n.buyer_name,n.buyer_last_name,s.child_name AS seller_name FROM draw_resolutions r LEFT JOIN raffle_numbers n ON n.number=r.winner_number LEFT JOIN sellers s ON s.id=n.seller_id WHERE r.id=?"
          : "SELECT r.* FROM draw_resolutions r WHERE r.id=?").bind(settings.active_draw_resolution_id).first()
      : Promise.resolve(null),
  ]);
  const { admin_emails: _emails, admin_pin_hash: _pin, admin_recovery_code_hash: _recovery, ...publicSettings } = settings;
  return { settings: publicSettings, prizes: prizes.results, numbers: numbers.results, sellerCount: sellerCount?.total ?? 0, drawResolution: resolution ?? null };
}

export type SellerRow = { id: number; child_name: string; display_name: string; pin_hash: string; limit_mode: "range" | "count"; limit_from: number | null; limit_to: number | null; limit_count: number; must_change_pin: number };
export type SellerSession = { id: number; childName: string; displayName: string; limitMode: "range" | "count"; limitFrom: number | null; limitTo: number | null; limitCount: number; mustChangePin: boolean; maxReservedPerSeller: number | null };

function toSellerSession(seller: SellerRow, maxReservedPerSeller: number | null): SellerSession {
  return { id: seller.id, childName: seller.child_name, displayName: seller.display_name, limitMode: seller.limit_mode, limitFrom: seller.limit_from, limitTo: seller.limit_to, limitCount: seller.limit_count, mustChangePin: Boolean(seller.must_change_pin), maxReservedPerSeller };
}

/** Verifies (childName, pin) — used only by the login endpoint. Transparently rehashes legacy SHA-256 rows to the PBKDF2 scheme on a successful match. */
export async function sellerFromCredentials(childName: string, pin: string): Promise<SellerSession | null> {
  const db = getD1();
  const seller = await db.prepare("SELECT id,child_name,display_name,pin_hash,limit_mode,limit_from,limit_to,limit_count,must_change_pin FROM sellers WHERE lower(child_name)=lower(?) AND active=1 AND deleted_at IS NULL")
    .bind(childName.trim()).first<SellerRow>();
  if (!seller) return null;
  const { ok, needsRehash } = await verifySecret(pin, seller.pin_hash);
  if (!ok) return null;
  if (needsRehash) await db.prepare("UPDATE sellers SET pin_hash=? WHERE id=?").bind(await hashSecret(pin), seller.id).run();
  const settings = await ensureSeed();
  return toSellerSession(seller, settings.max_reserved_per_seller);
}

/** Loads a seller for an already-authenticated session (no PIN check). */
export async function getSellerSession(id: number): Promise<SellerSession | null> {
  const db = getD1();
  const seller = await db.prepare("SELECT id,child_name,display_name,pin_hash,limit_mode,limit_from,limit_to,limit_count,must_change_pin FROM sellers WHERE id=? AND active=1 AND deleted_at IS NULL")
    .bind(id).first<SellerRow>();
  if (!seller) return null;
  const settings = await ensureSeed();
  return toSellerSession(seller, settings.max_reserved_per_seller);
}

/** Verifies the admin PIN — used only by the admin login and recovery endpoints. Rehashes legacy hashes on success. */
export async function verifyAdminPin(pin: string): Promise<boolean> {
  const db = getD1();
  const settings = await ensureSeed();
  const { ok, needsRehash } = await verifySecret(pin, settings.admin_pin_hash);
  if (!ok) return false;
  if (needsRehash) await db.prepare("UPDATE raffle_settings SET admin_pin_hash=? WHERE id=1").bind(await hashSecret(pin)).run();
  return true;
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export function priceForSale(settings: RaffleSettings, count: number) {
  if (count === 2 && settings.promo_pair_price_cents) return settings.promo_pair_price_cents;
  return settings.price_cents * count;
}

export function apiError(error: unknown, status = 500) {
  if (status >= 500) logEvent("error", "api_error", { status, error: error instanceof Error ? error.message : String(error) });
  return Response.json({ error: error instanceof Error ? error.message : "Ocurrió un error inesperado." }, { status });
}
