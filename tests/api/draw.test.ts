import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { seedSettings, seedSeller } from "@/tests/support/seed";
import { jsonRequest, getRequest, cookieFromSetCookie } from "@/tests/support/http";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/route";
import { GET as publicRaffle } from "@/app/api/raffle/route";
import { POST as sellerLogin } from "@/app/api/seller/login/route";
import { POST as sellNumber } from "@/app/api/seller/number/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); await seedSettings(db, { number_count: 1500 }); });
afterEach(() => db.close());

async function adminCookie() {
  const response = await adminLogin(jsonRequest("/api/admin/login", { body: { key: "admin1234" } }));
  return cookieFromSetCookie(response.headers.get("set-cookie"));
}

const drawConfigBody = {
  draw_resolution_method: "official_lottery_mapping",
  official_lottery_name: "Lotería de la Ciudad",
  official_draw_name: "Quiniela",
  official_draw_date: "2026-12-24",
  official_draw_url: "https://www.loteriadelaciudad.gob.ar/",
  official_result_count: 20,
  official_result_digits: 4,
  unclaimed_winner_policy: "no_winner",
};

describe("POST /api/admin { action: draw_config }", () => {
  it("configures the official lottery mapping and computes usable results / equivalents for N=1500", async () => {
    const cookie = await adminCookie();
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "draw_config", data: drawConfigBody } }));
    expect(response.status).toBe(200);
    const data = await adminGet(getRequest("/api/admin", cookie));
    const body = await data.json() as { settings: Record<string, unknown> };
    expect(body.settings.mapping_number_count).toBe(1500);
    expect(body.settings.mapping_valid_result_limit).toBe(9000);
    expect(body.settings.draw_resolution_method).toBe("official_lottery_mapping");
  });

  it("rejects a configuration that would not be mathematically fair", async () => {
    const cookie = await adminCookie();
    // 1 digit -> resultSpace 10, but the raffle has 1500 numbers: impossible to map fairly.
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "draw_config", data: { ...drawConfigBody, official_result_digits: 1 } } }));
    expect(response.status).toBe(400);
  });

  it("cannot be changed anymore once the draw has been resolved", async () => {
    const cookie = await adminCookie();
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "draw_config", data: drawConfigBody } }));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [7826] } } }));
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "draw_config", data: drawConfigBody } }));
    expect(response.status).toBe(409);
  });
});

describe("POST /api/admin { action: close_roster }", () => {
  it("hashes the sold numbers and blocks further sales", async () => {
    await seedSeller(db);
    const login = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    const sellerCookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    await sellNumber(jsonRequest("/api/seller/number", { cookie: sellerCookie, body: { number: 326, buyerName: "Ana", buyerLastName: "G", buyerPhone: "1", status: "sold" } }));

    const cookie = await adminCookie();
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    expect(response.status).toBe(200);
    const body = await response.json() as { hash: string; soldCount: number };
    expect(body.soldCount).toBe(1);
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);

    const blocked = await sellNumber(jsonRequest("/api/seller/number", { cookie: sellerCookie, body: { number: 327, buyerName: "Ana", buyerLastName: "G", buyerPhone: "1", status: "sold" } }));
    expect(blocked.status).toBe(409);
  });

  it("cannot be closed twice", async () => {
    const cookie = await adminCookie();
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    const second = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    expect(second.status).toBe(409);
  });
});

describe("POST /api/admin { action: resolve_draw }", () => {
  async function setupSoldWinner(cookie: string | null) {
    await seedSeller(db);
    const login = await sellerLogin(jsonRequest("/api/seller/login", { body: { childName: "Olivia", pin: "1234" } }));
    const sellerCookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    await sellNumber(jsonRequest("/api/seller/number", { cookie: sellerCookie, body: { number: 326, buyerName: "Ana", buyerLastName: "G", buyerPhone: "1", status: "sold" } }));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "draw_config", data: drawConfigBody } }));
  }

  it("requires the roster to be closed first", async () => {
    const cookie = await adminCookie();
    await setupSoldWinner(cookie);
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [7826] } } }));
    expect(response.status).toBe(409);
  });

  it("resolves 9347 (discarded) then 7826 (valid) to winner 0326, and publishes it", async () => {
    const cookie = await adminCookie();
    await setupSoldWinner(cookie);
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [9347, 7826, 21] } } }));
    expect(response.status).toBe(200);
    const body = await response.json() as { resolution: { status: string; winnerNumber: number; positionUsed: number; discarded: unknown[] } };
    expect(body.resolution.status).toBe("resolved");
    expect(body.resolution.winnerNumber).toBe(326);
    expect(body.resolution.positionUsed).toBe(2);
    expect(body.resolution.discarded).toEqual([{ position: 1, result: 9347, reason: "out_of_range" }]);

    const publicData = await publicRaffle();
    const publicBody = await publicData.json() as { drawResolution: { winner_number: number } | null };
    expect(publicBody.drawResolution?.winner_number).toBe(326);
  });

  it("refuses to silently re-resolve an already-resolved draw", async () => {
    const cookie = await adminCookie();
    await setupSoldWinner(cookie);
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [7826] } } }));
    const attempt = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [500] } } }));
    expect(attempt.status).toBe(409);
  });

  it("allows a correction with an explicit reason, and audits it", async () => {
    const cookie = await adminCookie();
    await setupSoldWinner(cookie);
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [7826] } } }));
    const correction = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [500], confirmCorrection: true, correctionReason: "Se cargó mal el primer extracto." } } }));
    expect(correction.status).toBe(200);
    const auditRows = await db.prepare("SELECT action FROM audit_log WHERE action='admin_resolve_draw_correction'").all();
    expect(auditRows.results.length).toBe(1);
  });

  it("under next_valid_official_position, skips a result mapping to an unsold number", async () => {
    const cookie = await adminCookie();
    await setupSoldWinner(cookie); // only raffle number 326 is sold
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "draw_config", data: { ...drawConfigBody, unclaimed_winner_policy: "next_valid_official_position" } } }));
    await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "close_roster" } }));
    // 21 -> raffle number 21 (unsold), 7826 -> raffle number 326 (sold)
    const response = await adminPost(jsonRequest("/api/admin", { cookie, body: { action: "resolve_draw", data: { officialResults: [21, 7826] } } }));
    const body = await response.json() as { resolution: { winnerNumber: number; discarded: Array<{ reason: string }> } };
    expect(body.resolution.winnerNumber).toBe(326);
    expect(body.resolution.discarded).toEqual([{ position: 1, result: 21, reason: "not_sold" }]);
  });
});
