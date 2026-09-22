import { describe, expect, it } from "vitest";
import { hashSecret, sha256, verifySecret } from "@/lib/security";

describe("hashSecret / verifySecret", () => {
  it("verifies a freshly hashed PIN and never needs a rehash", async () => {
    const hash = await hashSecret("1234");
    expect(hash.startsWith("pbkdf2$")).toBe(true);
    const result = await verifySecret("1234", hash);
    expect(result).toEqual({ ok: true, needsRehash: false });
  });

  it("rejects the wrong PIN", async () => {
    const hash = await hashSecret("1234");
    const result = await verifySecret("9999", hash);
    expect(result.ok).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashSecret("1234");
    const b = await hashSecret("1234");
    expect(a).not.toBe(b);
  });

  it("accepts a legacy bare-SHA-256 hash and flags it for rehashing", async () => {
    const legacy = await sha256("1234");
    const result = await verifySecret("1234", legacy);
    expect(result).toEqual({ ok: true, needsRehash: true });
  });

  it("rejects a wrong PIN against a legacy hash without flagging a rehash", async () => {
    const legacy = await sha256("1234");
    const result = await verifySecret("9999", legacy);
    expect(result).toEqual({ ok: false, needsRehash: false });
  });

  it("rejects garbage/empty stored hashes safely", async () => {
    expect((await verifySecret("1234", "")).ok).toBe(false);
    expect((await verifySecret("1234", "not-a-hash")).ok).toBe(false);
  });
});
