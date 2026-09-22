import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings } from "@/tests/support/seed";
import { jsonRequest, getRequest, cookieFromSetCookie } from "@/tests/support/http";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as adminPost } from "@/app/api/admin/route";
import { GET as backupGet, BACKUP_SCHEMA_VERSION } from "@/app/api/admin/backup/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db, { title: "Rifa original" }); });
afterEach(() => db.close());

async function adminCookie() {
  const response = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
  return cookieFromSetCookie(response.headers.get("set-cookie"));
}

describe("GET /api/admin/backup", () => {
  it("requires an admin session", async () => {
    const response = await backupGet(getRequest("/api/admin/backup?format=json"));
    expect(response.status).toBe(403);
  });

  it("exports a versioned JSON backup that never includes the admin PIN hash", async () => {
    const cookie = await adminCookie();
    const response = await backupGet(getRequest("/api/admin/backup?format=json", cookie));
    expect(response.status).toBe(200);
    const body = await response.json() as { version: number; settings: Record<string, unknown> };
    expect(body.version).toBe(BACKUP_SCHEMA_VERSION);
    expect(body.settings.admin_pin_hash).toBeUndefined();
    expect(body.settings.admin_recovery_code_hash).toBeUndefined();
  });
});

describe("POST /api/admin { action: restore }", () => {
  it("rejects a malformed backup instead of touching the database", async () => {
    const cookie = await adminCookie();
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "restore", data: { settings: { title: 42 } } } }));
    expect(response.status).toBe(400);
    const row = await db.prepare("SELECT title FROM raffle_settings WHERE id=1").first<{ title: string }>();
    expect(row?.title).toBe("Rifa original");
  });

  it("restores settings and prizes from a well-formed backup", async () => {
    const cookie = await adminCookie();
    const backup = {
      version: BACKUP_SCHEMA_VERSION,
      settings: {
        title: "Rifa restaurada", school: "Otra escuela", price_cents: 5000, number_count: 50,
        draw_name: "Sorteo X", official_url: "https://x.test", whatsapp_text: "Hola", admin_emails: "a@b.com",
      },
      prizes: [{ position: 1, title: "Bici", description: "", image_url: "" }],
    };
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "restore", data: backup } }));
    expect(response.status).toBe(200);
    const row = await db.prepare("SELECT title,school,price_cents FROM raffle_settings WHERE id=1").first<{ title: string; school: string; price_cents: number }>();
    expect(row).toEqual({ title: "Rifa restaurada", school: "Otra escuela", price_cents: 5000 });
    const prizes = await db.prepare("SELECT title FROM prizes").all<{ title: string }>();
    expect(prizes.results).toEqual([{ title: "Bici" }]);
  });

  it("does not touch sellers or raffle_numbers — restore is settings/prizes only, by design", async () => {
    const cookie = await adminCookie();
    const before = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers").first<{ total: number }>();
    const backup = {
      version: BACKUP_SCHEMA_VERSION,
      settings: { title: "X", school: "X", price_cents: 1, number_count: 10, draw_name: "X", official_url: "https://x.test", whatsapp_text: "X", admin_emails: "" },
      prizes: [],
    };
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "restore", data: backup } }));
    const after = await db.prepare("SELECT COUNT(*) AS total FROM raffle_numbers").first<{ total: number }>();
    expect(after?.total).toBe(before?.total);
  });
});
