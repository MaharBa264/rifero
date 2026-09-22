import { describe, expect, it } from "vitest";
import { computeRosterHash } from "@/lib/roster-hash";

describe("computeRosterHash", () => {
  it("is order-independent (canonical sort)", async () => {
    const a = await computeRosterHash([3, 1, 2]);
    const b = await computeRosterHash([1, 2, 3]);
    const c = await computeRosterHash([2, 3, 1]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("ignores duplicates", async () => {
    const a = await computeRosterHash([1, 2, 2, 3]);
    const b = await computeRosterHash([1, 2, 3]);
    expect(a).toBe(b);
  });

  it("changes when the set changes", async () => {
    const a = await computeRosterHash([1, 2, 3]);
    const b = await computeRosterHash([1, 2, 4]);
    expect(a).not.toBe(b);
  });

  it("produces a 64-char hex string", async () => {
    const hash = await computeRosterHash([326, 1826]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
