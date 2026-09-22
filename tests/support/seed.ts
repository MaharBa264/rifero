import type { D1Shim } from "@/tests/support/d1-shim";
import { hashSecret, sha256 } from "@/lib/security";

export async function seedSettings(db: D1Shim, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const defaults: Record<string, unknown> = {
    title: "Rifa de prueba", school: "Test", price_cents: 1000, number_count: 10, start_number: 0,
    draw_name: "Sorteo", official_url: "https://example.org", whatsapp_text: "Gracias", admin_emails: "",
    admin_pin_hash: await hashSecret("admin1234"), updated_at: now,
  };
  const row = { ...defaults, ...overrides };
  const keys = Object.keys(row);
  await db.prepare(`INSERT INTO raffle_settings (id,${keys.join(",")}) VALUES (1,${keys.map(() => "?").join(",")})`)
    .bind(...keys.map((k) => row[k])).run();
  const count = Number(row.number_count);
  const start = Number(row.start_number);
  for (let n = start; n < start + count; n++) {
    await db.prepare("INSERT INTO raffle_numbers (number,status,active,updated_at) VALUES (?,'available',1,?)").bind(n, now).run();
  }
}

export async function seedSeller(db: D1Shim, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const defaults: Record<string, unknown> = {
    child_name: "Olivia", display_name: "Familia de Olivia", pin_hash: await hashSecret("1234"),
    active: 1, limit_mode: "count", limit_from: null, limit_to: null, limit_count: 15, must_change_pin: 0, created_at: now,
  };
  const row = { ...defaults, ...overrides };
  const keys = Object.keys(row);
  const result = await db.prepare(`INSERT INTO sellers (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .bind(...keys.map((k) => row[k])).run();
  return result.meta.last_row_id;
}

export async function legacySha256(value: string) {
  return sha256(value);
}
