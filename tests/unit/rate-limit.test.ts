import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { asD1, createMigratedD1, type D1Shim } from "@/tests/support/d1-shim";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";

let db: D1Shim;
beforeEach(async () => { db = await createMigratedD1(); env.DB = asD1(db); });
afterEach(() => db.close());

describe("checkRateLimit", () => {
  it("allows the first attempts through", async () => {
    const result = await checkRateLimit("seller:olivia", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("locks out after enough recent failures from the same identity", async () => {
    for (let i = 0; i < 5; i++) await recordAttempt("seller:olivia", "1.2.3.4", false);
    const result = await checkRateLimit("seller:olivia", "1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not lock out a different identity/ip pair", async () => {
    for (let i = 0; i < 5; i++) await recordAttempt("seller:olivia", "1.2.3.4", false);
    const result = await checkRateLimit("seller:ines", "9.9.9.9");
    expect(result.allowed).toBe(true);
  });

  it("a successful attempt does not itself count toward the failure lockout", async () => {
    for (let i = 0; i < 4; i++) await recordAttempt("seller:olivia", "1.2.3.4", false);
    await recordAttempt("seller:olivia", "1.2.3.4", true);
    const result = await checkRateLimit("seller:olivia", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });
});
