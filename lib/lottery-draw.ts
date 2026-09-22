// Pure, dependency-free math for resolving a raffle winner from an official
// four-digit lottery extract (Quiniela-style). No randomness lives here —
// every function is a deterministic transform of its inputs, which is what
// makes the draw auditable and reproducible.
//
// Core idea: a raffle with N numbers (0..N-1, offset by startNumber) maps to
// a "usable" prefix of the result space (usually 0000-9999) that is the
// largest multiple of N. Every raffle number then gets exactly
// usableResults/N official results that all resolve to it, so no number has
// better odds than any other. Results at or above usableResults fall outside
// any raffle number and are skipped.

export type DiscardReason = "out_of_range" | "not_sold";

export type MappingParams = {
  resultSpace: number;
  usableResults: number;
  discardedCount: number;
  equivalentsPerNumber: number;
};

/** Largest multiple of `numberCount` that fits in `resultSpace`, and what falls out of it. */
export function computeMappingParams(numberCount: number, resultSpace = 10000): MappingParams {
  if (!Number.isInteger(numberCount) || numberCount <= 0) throw new Error("numberCount debe ser un entero positivo.");
  if (!Number.isInteger(resultSpace) || resultSpace <= 0) throw new Error("resultSpace debe ser un entero positivo.");
  const usableResults = Math.floor(resultSpace / numberCount) * numberCount;
  return {
    resultSpace,
    usableResults,
    discardedCount: resultSpace - usableResults,
    equivalentsPerNumber: usableResults > 0 ? usableResults / numberCount : 0,
  };
}

export type FairnessReport = {
  fair: boolean;
  issues: string[];
  usableResults: number;
  equivalentsPerNumber: number;
  discardedCount: number;
};

/**
 * Brute-force check (not just an assumed invariant): every usable result maps
 * to exactly one raffle number, and every raffle number gets the same count.
 * Cheap for any realistic raffle size (usableResults <= resultSpace <= ~10^6).
 */
export function validateFairness(numberCount: number, resultSpace = 10000): FairnessReport {
  const issues: string[] = [];
  let params: MappingParams;
  try {
    params = computeMappingParams(numberCount, resultSpace);
  } catch (error) {
    return { fair: false, issues: [error instanceof Error ? error.message : String(error)], usableResults: 0, equivalentsPerNumber: 0, discardedCount: 0 };
  }
  const { usableResults, equivalentsPerNumber, discardedCount } = params;
  if (usableResults === 0) issues.push("No hay resultados utilizables: la cantidad de números es mayor que el espacio de resultados.");
  if (usableResults % numberCount !== 0) issues.push("usableResults no es múltiplo exacto de la cantidad de números.");

  const counts = new Array(numberCount).fill(0);
  for (let result = 0; result < usableResults; result++) counts[result % numberCount]++;
  const distinctCounts = new Set(counts);
  if (distinctCounts.size > 1) issues.push("No todos los números reciben la misma cantidad de resultados equivalentes.");
  else if (counts[0] !== equivalentsPerNumber) issues.push("La cantidad de equivalentes calculada no coincide con la real.");

  return { fair: issues.length === 0, issues, usableResults, equivalentsPerNumber, discardedCount };
}

export type EquivalentsInput = { raffleNumber: number; startNumber: number; numberCount: number; resultSpace?: number; digits?: number };

/** Every official result that resolves to this specific raffle number, formatted with leading zeros. */
export function getOfficialEquivalentNumbers({ raffleNumber, startNumber, numberCount, resultSpace = 10000, digits = 4 }: EquivalentsInput): string[] {
  const offset = raffleNumber - startNumber;
  if (offset < 0 || offset >= numberCount) throw new Error("raffleNumber está fuera del rango de la rifa.");
  const { usableResults } = computeMappingParams(numberCount, resultSpace);
  const equivalents: string[] = [];
  for (let result = offset; result < usableResults; result += numberCount) equivalents.push(String(result).padStart(digits, "0"));
  return equivalents;
}

export type DiscardedEntry = { position: number; result: number; reason: DiscardReason };

export type DrawResolveInput = {
  raffleStartNumber: number;
  raffleNumberCount: number;
  officialResults: number[];
  resultSpace?: number;
  /** 'no_winner': stop at the first valid result even if unsold (there's simply no winner). 'next_valid_official_position': keep scanning valid results until a sold one is found. Defaults to 'no_winner'. */
  unclaimedPolicy?: "no_winner" | "next_valid_official_position";
  /** Required for 'next_valid_official_position' — whether a given raffle number was actually sold. Ignored for 'no_winner'. */
  isSold?: (raffleNumber: number) => boolean;
};

export type DrawResolution = {
  /** 'resolved': a winning official result was found (its raffle number may still turn out unsold — see `winnerWasSold`). 'exhausted': none of the supplied positions resolved; load more positions from the extract. */
  status: "resolved" | "exhausted";
  winnerNumber: number | null;
  /** Only meaningful when a policy + isSold() were supplied. Under 'no_winner' this tells the caller whether to actually award a prize. */
  winnerWasSold: boolean | null;
  positionUsed: number | null;
  officialResultUsed: number | null;
  discarded: DiscardedEntry[];
  formula: string | null;
  usableResults: number;
  equivalentsPerNumber: number;
};

/**
 * Scans `officialResults` in order (1-indexed positions, as printed on the
 * official extract) for the first one inside the valid range.
 *
 * - `unclaimedPolicy: 'no_winner'` (default): the first valid result IS the
 *   draw. If that number wasn't sold, `winnerWasSold` comes back false and
 *   the raffle simply has no winner — the function does not keep scanning.
 * - `unclaimedPolicy: 'next_valid_official_position'`: keeps scanning valid
 *   results, skipping ones whose number wasn't sold, until it finds a sold
 *   one or runs out of supplied results (status 'exhausted' — the admin
 *   needs to load more positions from the extract).
 */
export function resolveOfficialLotteryDraw(input: DrawResolveInput): DrawResolution {
  const { raffleStartNumber, raffleNumberCount, officialResults, resultSpace = 10000, unclaimedPolicy = "no_winner", isSold } = input;
  const { usableResults, equivalentsPerNumber } = computeMappingParams(raffleNumberCount, resultSpace);
  const discarded: DiscardedEntry[] = [];

  for (let i = 0; i < officialResults.length; i++) {
    const position = i + 1;
    const result = officialResults[i];
    if (result < 0 || result >= usableResults) {
      discarded.push({ position, result, reason: "out_of_range" });
      continue;
    }
    const winnerNumber = raffleStartNumber + (result % raffleNumberCount);
    const sold = isSold ? isSold(winnerNumber) : null;
    if (unclaimedPolicy === "next_valid_official_position" && sold === false) {
      discarded.push({ position, result, reason: "not_sold" });
      continue;
    }
    return {
      status: "resolved",
      winnerNumber,
      winnerWasSold: sold,
      positionUsed: position,
      officialResultUsed: result,
      discarded,
      formula: `${result} mod ${raffleNumberCount} = ${result % raffleNumberCount}${raffleStartNumber ? ` (+ ${raffleStartNumber} inicial) = ${winnerNumber}` : ""}`,
      usableResults,
      equivalentsPerNumber,
    };
  }

  return {
    status: "exhausted",
    winnerNumber: null,
    winnerWasSold: null,
    positionUsed: null,
    officialResultUsed: null,
    discarded,
    formula: null,
    usableResults,
    equivalentsPerNumber,
  };
}
