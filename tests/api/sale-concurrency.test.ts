import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings, seedSeller } from "@/tests/support/seed";
import { jsonRequest, cookieFromSetCookie } from "@/tests/support/http";
import { POST as sellerLogin } from "@/app/api/seller/login/route";
import { POST as sellNumber } from "@/app/api/seller/number/route";
import { POST as sellPair } from "@/app/api/seller/numbers/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db, { number_count: 20 }); });
afterEach(() => db.close());

async function loginAs(childName: string, pin: string, limitCount = 15) {
  await seedSeller(db, { child_name: childName, pin_hash: await import("@/lib/security").then((m) => m.hashSecret(pin)), limit_count: limitCount });
  const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName, pin } }));
  return cookieFromSetCookie(response.headers.get("set-cookie"));
}

const buyer = { buyerName: "Ana", buyerLastName: "Gomez", buyerPhone: "1111", status: "reserved" as const };

describe("double-selling protection on /api/seller/number", () => {
  it("two simultaneous requests for the same number: exactly one wins", async () => {
    const cookieA = await loginAs("Olivia", "1234");
    const cookieB = await loginAs("Bianca", "5678");
    const [a, b] = await Promise.all([
      sellNumber(jsonRequest("/api/seller/number", { cookie: cookieA, body: { ...buyer, number: 3 } })),
      sellNumber(jsonRequest("/api/seller/number", { cookie: cookieB, body: { ...buyer, number: 3, buyerName: "Otra" } })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const row = await db.prepare("SELECT status,seller_id FROM raffle_numbers WHERE number=3").first<{ status: string; seller_id: number }>();
    expect(row?.status).toBe("reserved");
  });

  it("idempotency key: retrying the exact same request does not double-book or duplicate the audit trail", async () => {
    const cookie = await loginAs("Olivia", "1234");
    const request = () => sellNumber(jsonRequest("/api/seller/number", { cookie, body: { ...buyer, number: 4 }, headers: { "idempotency-key": "retry-1" } }));
    const first = await request();
    const second = await request();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.clone().json();
    const secondBody = await second.clone().json();
    expect(firstBody).toEqual(secondBody);
    const audit = await db.prepare("SELECT COUNT(*) AS total FROM audit_log WHERE entity_id='4'").first<{ total: number }>();
    expect(audit?.total).toBe(1);
  });
});

describe("promo pair /api/seller/numbers", () => {
  it("sells exactly 2 numbers together and records half the promo price on each", async () => {
    await db.prepare("UPDATE raffle_settings SET promo_pair_price_cents=1800 WHERE id=1").run();
    const cookie = await loginAs("Olivia", "1234");
    const response = await sellPair(jsonRequest("/api/seller/numbers", { cookie, body: { ...buyer, numbers: [5, 6], status: "sold" } }));
    expect(response.status).toBe(200);
    const rows = await db.prepare("SELECT number,price_cents,status FROM raffle_numbers WHERE number IN (5,6) ORDER BY number").all<{ number: number; price_cents: number; status: string }>();
    expect(rows.results).toEqual([
      { number: 5, price_cents: 900, status: "sold" },
      { number: 6, price_cents: 900, status: "sold" },
    ]);
  });

  it("rolls back both numbers if one of the pair was taken in the meantime", async () => {
    const cookieA = await loginAs("Olivia", "1234");
    const cookieB = await loginAs("Bianca", "5678");
    await sellNumber(jsonRequest("/api/seller/number", { cookie: cookieA, body: { ...buyer, number: 8 } }));
    const response = await sellPair(jsonRequest("/api/seller/numbers", { cookie: cookieB, body: { ...buyer, numbers: [7, 8] } }));
    expect(response.status).toBe(409);
    const row7 = await db.prepare("SELECT status FROM raffle_numbers WHERE number=7").first<{ status: string }>();
    expect(row7?.status).toBe("available");
  });
});

describe("per-seller sell limit", () => {
  it("blocks a seller from exceeding their configured limit", async () => {
    const cookie = await loginAs("Olivia", "1234", 1);
    const first = await sellNumber(jsonRequest("/api/seller/number", { cookie, body: { ...buyer, number: 1 } }));
    expect(first.status).toBe(200);
    const second = await sellNumber(jsonRequest("/api/seller/number", { cookie, body: { ...buyer, number: 2 } }));
    expect(second.status).toBe(409);
  });
});

describe("max reserved (not-yet-sold) cap", () => {
  it("blocks new reservations once the general cap is reached, but selling still works", async () => {
    await db.prepare("UPDATE raffle_settings SET max_reserved_per_seller=1 WHERE id=1").run();
    const cookie = await loginAs("Olivia", "1234");
    const first = await sellNumber(jsonRequest("/api/seller/number", { cookie, body: { ...buyer, number: 1, status: "reserved" } }));
    expect(first.status).toBe(200);
    const second = await sellNumber(jsonRequest("/api/seller/number", { cookie, body: { ...buyer, number: 2, status: "reserved" } }));
    expect(second.status).toBe(409);
    const sell = await sellNumber(jsonRequest("/api/seller/number", { cookie, body: { ...buyer, number: 1, status: "sold" } }));
    expect(sell.status).toBe(200);
  });
});
