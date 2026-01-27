/**
 * Shared normalization helpers for currency and share values.
 */

/**
 * Normalize a raw currency value (assumed USD) into millions.
 */
export function toMillions(valueInDollars: number): number {
  if (!isFinite(valueInDollars)) {
    return 0;
  }
  return valueInDollars / 1_000_000;
}

/**
 * Normalize shares outstanding into millions of shares.
 * Attempts to detect whether the raw value is already scaled.
 */
export function normalizeSharesOutstanding(rawShares: number): number {
  if (!isFinite(rawShares)) {
    return 0;
  }

  let sharesM = rawShares;

  if (rawShares > 100_000_000) {
    sharesM = rawShares / 1_000_000;
  } else if (rawShares < 1_000) {
    sharesM = rawShares;
  }

  if (sharesM <= 0) {
    console.warn('[AnalystAI] normalizeSharesOutstanding: non-positive shares after normalization', {
      rawShares,
      sharesM,
    });
  }

  return sharesM;
}

/**
 * Convenience helper for currency normalization.
 */
export function normalizeCurrencyToMillions(rawValue: number): number {
  return toMillions(rawValue);
}
