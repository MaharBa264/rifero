import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings, seedSeller } from "@/tests/support/seed";
import { jsonRequest, getRequest, cookieFromSetCookie } from "@/tests/support/http";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/route";
import { POST as sellerLogin } from "@/app/api/seller/login/route";
import { POST as sellNumber } from "@/app/api/seller/number/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db); });
afterEach(() => db.close());

async function adminCookie() {
  const response = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
  return cookieFromSetCookie(response.headers.get("set-cookie"));
}

describe("deleting a seller is a soft delete", () => {
  it("keeps the row and their confirmed sales, but the seller can no longer log in or be listed by default", async () => {
    const id = await seedSeller(db);
    const login = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    const sellerCookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    const sale = await sellNumber(jsonRequest("/api/seller/number", { cookie: sellerCookie, body: { number: 1, buyerName: "Ana", buyerLastName: "Gomez", buyerPhone: "1", status: "sold" } }));
    expect(sale.status).toBe(200);

    const cookie = await adminCookie();
    const del = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "delete_seller", data: { id } } }));
    expect(del.status).toBe(200);

    const row = await db.prepare("SELECT deleted_at,active FROM sellers WHERE id=?").bind(id).first<{ deleted_at: string | null; active: number }>();
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.active).toBe(0);

    // The confirmed sale is untouched.
    const number = await db.prepare("SELECT status,seller_id,buyer_name FROM raffle_numbers WHERE number=1").first<{ status: string; seller_id: number; buyer_name: string }>();
    expect(number).toEqual({ status: "sold", seller_id: id, buyer_name: "Ana" });

    // Default listing hides the deleted seller.
    const list = await adminGet(getRequest("/api/admin", cookie));
    const listed = await list.json() as { sellers: Array<{ id: number }> };
    expect(listed.sellers.find((s) => s.id === id)).toBeUndefined();

    // include_deleted=1 shows it again.
    const listDeleted = await adminGet(getRequest("/api/admin?include_deleted=1", cookie));
    const listedDeleted = await listDeleted.json() as { sellers: Array<{ id: number }> };
    expect(listedDeleted.sellers.find((s) => s.id === id)).toBeDefined();

    // The seller can no longer log in.
    const blockedLogin = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" }, headers: { "cf-connecting-ip": "2.2.2.2" } }));
    expect(blockedLogin.status).toBe(401);
  });

  it("frees up a pending reservation but not a confirmed sale", async () => {
    const id = await seedSeller(db);
    const login = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    const sellerCookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    await sellNumber(jsonRequest("/api/seller/number", { cookie: sellerCookie, body: { number: 2, buyerName: "Ana", buyerLastName: "Gomez", buyerPhone: "1", status: "reserved" } }));

    const cookie = await adminCookie();
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "delete_seller", data: { id } } }));

    const number = await db.prepare("SELECT status,seller_id FROM raffle_numbers WHERE number=2").first<{ status: string; seller_id: number | null }>();
    expect(number).toEqual({ status: "available", seller_id: null });
  });

  it("restore_seller un-deletes without touching sales history", async () => {
    const id = await seedSeller(db);
    const cookie = await adminCookie();
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "delete_seller", data: { id } } }));
    const restore = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "restore_seller", data: { id } } }));
    expect(restore.status).toBe(200);
    const row = await db.prepare("SELECT deleted_at FROM sellers WHERE id=?").bind(id).first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBeNull();
  });
});
