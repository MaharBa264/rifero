import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings, seedSeller } from "@/tests/support/seed";
import { jsonRequest, cookieFromSetCookie } from "@/tests/support/http";
import { POST as sellerLogin } from "@/app/api/seller/login/route";
import { POST as changePin } from "@/app/api/seller/change-pin/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db); });
afterEach(() => db.close());

async function loginCookie() {
  await seedSeller(db, { must_change_pin: 1 });
  const response = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
  return cookieFromSetCookie(response.headers.get("set-cookie"));
}

describe("POST /api/seller/change-pin", () => {
  it("requires an active session", async () => {
    const response = await changePin(jsonRequest("/api/seller/change-pin", { body: { currentPin: "1234", newPin: "5678" } }));
    expect(response.status).toBe(401);
  });

  it("changes the PIN, clears must_change_pin, and lets a new login use the new PIN", async () => {
    const cookie = await loginCookie();
    const response = await changePin(jsonRequest("/api/seller/change-pin", { cookie, body: { currentPin: "1234", newPin: "5678" } }));
    expect(response.status).toBe(200);
    const body = await response.json() as { seller: { mustChangePin: boolean } };
    expect(body.seller.mustChangePin).toBe(false);

    const relogin = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "5678" } }));
    expect(relogin.status).toBe(200);
  });

  it("rejects a wrong current PIN", async () => {
    const cookie = await loginCookie();
    const response = await changePin(jsonRequest("/api/seller/change-pin", { cookie, body: { currentPin: "0000", newPin: "5678" } }));
    expect(response.status).toBe(401);
  });

  it("rejects a new PIN that's the same as the current one", async () => {
    const cookie = await loginCookie();
    const response = await changePin(jsonRequest("/api/seller/change-pin", { cookie, body: { currentPin: "1234", newPin: "1234" } }));
    expect(response.status).toBe(400);
  });

  it("revokes the old session so a stale cookie stops working", async () => {
    const cookie = await loginCookie();
    await changePin(jsonRequest("/api/seller/change-pin", { cookie, body: { currentPin: "1234", newPin: "5678" } }));
    const reuse = await changePin(jsonRequest("/api/seller/change-pin", { cookie, body: { currentPin: "5678", newPin: "9999" } }));
    expect(reuse.status).toBe(401);
  });
});
