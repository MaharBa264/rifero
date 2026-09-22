import { describe, expect, it } from "vitest";
import { redact } from "@/lib/audit";

describe("redact", () => {
  it("masks known sensitive keys and leaves everything else intact", () => {
    const result = redact({ pin: "1234", newPin: "5678", buyerName: "Olivia", number: 7 });
    expect(result).toEqual({ pin: "[oculto]", newPin: "[oculto]", buyerName: "Olivia", number: 7 });
  });

  it("redacts inside nested objects and arrays", () => {
    const result = redact({ items: [{ pin: "1", ok: true }], nested: { code: "AAAA" } });
    expect(result).toEqual({ items: [{ pin: "[oculto]", ok: true }], nested: { code: "[oculto]" } });
  });

  it("passes through primitives unchanged", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});
