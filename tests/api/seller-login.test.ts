import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings, seedSeller, legacySha256 } from "@/tests/support/seed";
import { jsonRequest } from "@/tests/support/http";
import { POST as sellerLogin } from "@/app/api/seller/login/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db); });
afterEach(() => db.close());

describe("POST /api/seller/login", () => {
  it("logs in with the right PIN and sets a session cookie", async () => {
    await seedSeller(db);
    const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    expect(response.status).toBe(200);
    const body = await response.json() as { seller: { childName: string } };
    expect(body.seller.childName).toBe("Olivia");
    expect(response.headers.get("set-cookie")).toMatch(/rifa_seller_session=.+HttpOnly/);
  });

  it("rejects the wrong PIN", async () => {
    await seedSeller(db);
    const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "0000" } }));
    expect(response.status).toBe(401);
  });

  it("rejects an unknown seller name", async () => {
    const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Nadie", pin: "1234" } }));
    expect(response.status).toBe(401);
  });

  it("transparently upgrades a legacy SHA-256 PIN hash to PBKDF2 on successful login", async () => {
    const legacyHash = await legacySha256("1234");
    const id = await seedSeller(db, { pin_hash: legacyHash });
    const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    expect(response.status).toBe(200);
    const row = await db.prepare("SELECT pin_hash FROM sellers WHERE id=?").bind(id).first<{ pin_hash: string }>();
    expect(row?.pin_hash.startsWith("pbkdf2$")).toBe(true);
  });

  it("locks out after repeated failures for the same seller", async () => {
    await seedSeller(db);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "wrong" }, headers: { "cf-connecting-ip": "5.5.5.5" } }));
    }
    expect(last?.status).toBe(429);
  });

  it("does not authenticate a soft-deleted seller", async () => {
    await seedSeller(db, { deleted_at: new Date().toISOString(), active: 0 });
    const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    expect(response.status).toBe(401);
  });
});
