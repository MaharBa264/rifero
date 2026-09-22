import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings } from "@/tests/support/seed";
import { sha256 } from "@/lib/security";
import { jsonRequest, getRequest, cookieFromSetCookie } from "@/tests/support/http";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as adminRecover } from "@/app/api/admin/recover/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db); });
afterEach(() => db.close());

describe("POST /api/admin/login", () => {
  it("logs in with the right key and the session unlocks GET /api/admin", async () => {
    const response = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
    expect(response.status).toBe(200);
    const cookie = cookieFromSetCookie(response.headers.get("set-cookie"));
    const data = await adminGet(getRequest("/api/admin", cookie));
    expect(data.status).toBe(200);
  });

  it("rejects a wrong key and GET /api/admin stays locked", async () => {
    const response = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "wrong" } }));
    expect(response.status).toBe(401);
    const data = await adminGet(getRequest("/api/admin"));
    expect(data.status).toBe(403);
  });

  it("rate-limits repeated wrong keys", async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "wrong" }, headers: { "cf-connecting-ip": "8.8.8.8" } }));
    expect(last?.status).toBe(429);
  });
});

describe("POST /api/admin/recover", () => {
  async function generateCode(cookie: string | null) {
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "generate_recovery_code" } }));
    const body = await response.json() as { code: string };
    return body.code;
  }

  it("resets the admin PIN with a valid recovery code and logs the admin in", async () => {
    const login = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
    const cookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    const code = await generateCode(cookie);

    const response = await adminRecover(jsonRequest("/api/admin/recover", { body: { code, newPin: "brandnewpin1" } }));
    expect(response.status).toBe(200);
    const newCookie = cookieFromSetCookie(response.headers.get("set-cookie"));
    const data = await adminGet(getRequest("/api/admin", newCookie));
    expect(data.status).toBe(200);

    // Old key no longer works.
    const oldLogin = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" }, headers: { "cf-connecting-ip": "3.3.3.3" } }));
    expect(oldLogin.status).toBe(401);
  });

  it("is single-use — reusing the same code fails the second time", async () => {
    const login = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
    const cookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    const code = await generateCode(cookie);
    await adminRecover(jsonRequest("/api/admin/recover", { body: { code, newPin: "firstnewpin1" } }));
    const second = await adminRecover(jsonRequest("/api/admin/recover", { body: { code, newPin: "secondnewpin" }, headers: { "cf-connecting-ip": "4.4.4.4" } }));
    expect(second.status).toBe(404); // the code was consumed and cleared, not merely rejected
  });

  it("rejects an invalid code", async () => {
    await db.prepare("UPDATE raffle_settings SET admin_recovery_code_hash=? WHERE id=1").bind(await sha256("REAL-CODE-HERE")).run();
    const response = await adminRecover(jsonRequest("/api/admin/recover", { body: { code: "WRONG-CODE-HERE", newPin: "somenewpin12" } }));
    expect(response.status).toBe(401);
  });

  it("fails when no recovery code was ever generated", async () => {
    const response = await adminRecover(jsonRequest("/api/admin/recover", { body: { code: "ANYTHING", newPin: "somenewpin12" } }));
    expect(response.status).toBe(404);
  });
});

describe("admin PIN change revokes other sessions", () => {
  it("a session created before an admin_pin change stops working", async () => {
    const first = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
    const firstCookie = cookieFromSetCookie(first.headers.get("set-cookie"));
    const second = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" }, headers: { "cf-connecting-ip": "1.1.1.2" } }));
    const secondCookie = cookieFromSetCookie(second.headers.get("set-cookie"));

    await adminPost(jsonRequest("/api/admin", { cookie: secondCookie, body: { action: "admin_pin", data: { new_admin_pin: "changedpin12" } } }));

    const staleCheck = await adminGet(getRequest("/api/admin", firstCookie));
    expect(staleCheck.status).toBe(403);
  });

  it("never stores the admin PIN in plaintext in the audit log", async () => {
    const login = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
    const cookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "admin_pin", data: { new_admin_pin: "verysecretpin" } } }));
    const rows = await db.prepare("SELECT payload,before_json,after_json FROM audit_log").all<{ payload: string; before_json: string | null; after_json: string | null }>();
    const blob = JSON.stringify(rows.results);
    expect(blob).not.toContain("verysecretpin");
  });
});
