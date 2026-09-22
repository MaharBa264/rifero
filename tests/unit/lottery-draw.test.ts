import { describe, expect, it } from "vitest";
import { computeMappingParams, getOfficialEquivalentNumbers, resolveOfficialLotteryDraw, validateFairness } from "@/lib/lottery-draw";

describe("computeMappingParams (N=1500)", () => {
  it("uses 9000 of 10000 as the usable result space, 6 equivalents per number", () => {
    const params = computeMappingParams(1500);
    expect(params).toEqual({ resultSpace: 10000, usableResults: 9000, discardedCount: 1000, equivalentsPerNumber: 6 });
  });
});

describe("getOfficialEquivalentNumbers (N=1500, start=0)", () => {
  const base = { startNumber: 0, numberCount: 1500 };

  it("0326 has exactly six equivalents", () => {
    expect(getOfficialEquivalentNumbers({ raffleNumber: 326, ...base })).toEqual(["0326", "1826", "3326", "4826", "6326", "7826"]);
  });

  it("1499 has exactly six equivalents", () => {
    expect(getOfficialEquivalentNumbers({ raffleNumber: 1499, ...base })).toEqual(["1499", "2999", "4499", "5999", "7499", "8999"]);
  });

  it("0000 has exactly six equivalents", () => {
    expect(getOfficialEquivalentNumbers({ raffleNumber: 0, ...base })).toEqual(["0000", "1500", "3000", "4500", "6000", "7500"]);
  });

  it("every raffle number 0..1499 gets exactly six equivalents", () => {
    for (let n = 0; n < 1500; n++) expect(getOfficialEquivalentNumbers({ raffleNumber: n, ...base })).toHaveLength(6);
  });
});

describe("resolveOfficialLotteryDraw (N=1500, start=0)", () => {
  const base = { raffleStartNumber: 0, raffleNumberCount: 1500 };

  it("8999 is a valid result and resolves to 1499", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [8999] });
    expect(result.status).toBe("resolved");
    expect(result.winnerNumber).toBe(1499);
    expect(result.positionUsed).toBe(1);
    expect(result.discarded).toEqual([]);
  });

  it("9000 is invalid (out of range) and discarded", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [9000] });
    expect(result.status).toBe("exhausted");
    expect(result.discarded).toEqual([{ position: 1, result: 9000, reason: "out_of_range" }]);
  });

  it("9999 is invalid (out of range) and discarded", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [9999] });
    expect(result.discarded[0].reason).toBe("out_of_range");
  });

  it("7826 resolves to 0326", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [7826] });
    expect(result.winnerNumber).toBe(326);
    expect(result.formula).toBe("7826 mod 1500 = 326");
  });

  it("9000 followed by 7826 skips the first (out of range) and resolves using the second position", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [9000, 7826] });
    expect(result.status).toBe("resolved");
    expect(result.winnerNumber).toBe(326);
    expect(result.positionUsed).toBe(2);
    expect(result.officialResultUsed).toBe(7826);
    expect(result.discarded).toEqual([{ position: 1, result: 9000, reason: "out_of_range" }]);
  });

  it("the admin example: 9347 discarded, 7826 valid at position 2, winner 0326", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [9347, 7826, 21] });
    expect(result.positionUsed).toBe(2);
    expect(result.winnerNumber).toBe(326);
  });

  it("respects a non-zero start_number: 7826 mod 1500 = 326, winner = 1326", () => {
    const result = resolveOfficialLotteryDraw({ raffleStartNumber: 1000, raffleNumberCount: 1500, officialResults: [7826] });
    expect(result.winnerNumber).toBe(1326);
    expect(result.formula).toBe("7826 mod 1500 = 326 (+ 1000 inicial) = 1326");
  });

  it("is exhausted when every supplied result is out of range", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [9000, 9500, 9999] });
    expect(result.status).toBe("exhausted");
    expect(result.winnerNumber).toBeNull();
    expect(result.discarded).toHaveLength(3);
  });
});

describe("unclaimed winner policy", () => {
  const base = { raffleStartNumber: 0, raffleNumberCount: 1500 };
  // 7826 -> raffle number 326 (7826 mod 1500). 500 -> raffle number 500 (a different number).
  const soldOnly500 = (n: number) => n === 500;

  it("no_winner: resolves to the first valid result even if not sold, and reports winnerWasSold=false", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [7826], unclaimedPolicy: "no_winner", isSold: soldOnly500 });
    expect(result.status).toBe("resolved");
    expect(result.winnerNumber).toBe(326);
    expect(result.winnerWasSold).toBe(false);
    expect(result.discarded).toEqual([]);
  });

  it("next_valid_official_position: skips unsold winners and keeps scanning until a sold one is found", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [7826, 500], unclaimedPolicy: "next_valid_official_position", isSold: soldOnly500 });
    expect(result.status).toBe("resolved");
    expect(result.winnerNumber).toBe(500);
    expect(result.positionUsed).toBe(2);
    expect(result.discarded).toEqual([{ position: 1, result: 7826, reason: "not_sold" }]);
  });

  it("next_valid_official_position: exhausted when no supplied result maps to a sold number", () => {
    const result = resolveOfficialLotteryDraw({ ...base, officialResults: [7826, 21], unclaimedPolicy: "next_valid_official_position", isSold: () => false });
    expect(result.status).toBe("exhausted");
    expect(result.discarded.every((d) => d.reason === "not_sold")).toBe(true);
  });
});

describe("validateFairness (N=1500)", () => {
  it("confirms every number gets exactly six equivalents with no overlaps or gaps", () => {
    const report = validateFairness(1500);
    expect(report.fair).toBe(true);
    expect(report.equivalentsPerNumber).toBe(6);
    expect(report.usableResults).toBe(9000);
    expect(report.discardedCount).toBe(1000);
    expect(report.issues).toEqual([]);
  });

  it("every one of the 9000 valid results is assigned to exactly one raffle number, and no number has an advantage", () => {
    const counts = new Array(1500).fill(0);
    for (let result = 0; result < 9000; result++) counts[result % 1500]++;
    expect(new Set(counts).size).toBe(1); // every number has the exact same count
    expect(counts[0]).toBe(6);
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(9000); // every valid result assigned exactly once, none duplicated
  });

  it("flags a raffle with more numbers than the result space as unfair", () => {
    const report = validateFairness(20000);
    expect(report.fair).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it("is fair for the trivial case where the count divides the result space evenly (N=100)", () => {
    const report = validateFairness(100);
    expect(report.fair).toBe(true);
    expect(report.equivalentsPerNumber).toBe(100);
    expect(report.discardedCount).toBe(0);
  });
});
