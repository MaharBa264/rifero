import { describe, expect, it } from "vitest";
import { priceForSale, type RaffleSettings } from "@/lib/raffle-db";

const baseSettings = { price_cents: 1000, promo_pair_price_cents: null } as RaffleSettings;

describe("priceForSale", () => {
  it("charges price_cents per number outside the promo", () => {
    expect(priceForSale(baseSettings, 1)).toBe(1000);
    expect(priceForSale({ ...baseSettings, promo_pair_price_cents: null }, 2)).toBe(2000);
  });

  it("uses the promo price for exactly 2 numbers when configured", () => {
    const settings = { ...baseSettings, promo_pair_price_cents: 1500 };
    expect(priceForSale(settings, 2)).toBe(1500);
  });

  it("ignores the promo price for counts other than 2", () => {
    const settings = { ...baseSettings, promo_pair_price_cents: 1500 };
    expect(priceForSale(settings, 1)).toBe(1000);
    expect(priceForSale(settings, 3)).toBe(3000);
  });
});
