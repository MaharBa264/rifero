import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { GET as health } from "@/app/api/health/route";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); });
afterEach(() => db.close());

describe("GET /api/health", () => {
  it("reports ok when the database is reachable, with a request id", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = await response.json() as { ok: boolean; dbOk: boolean };
    expect(body).toMatchObject({ ok: true, dbOk: true });
  });

  it("reports failure when the database binding is missing", async () => {
    delete (env as Record<string, unknown>).DB;
    const response = await health();
    expect(response.status).toBe(503);
  });
});
