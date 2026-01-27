import { normalizeCurrencyToMillions, normalizeSharesOutstanding, toMillions } from './normalization';

export interface RawFinancials {
  revenue: number;
  ebitda: number;
  ebit: number;
  freeCashFlow: number;
  netDebt: number;
  sharesOutstanding: number;
  marketCap?: number;
}

export interface ScaledFinancials {
  revenueM: number;
  ebitdaM: number;
  ebitM: number;
  fcfM: number;
  netDebtM: number;
  sharesOutstandingM: number;
  marketCapM?: number;
}

export type NormalizedFinancials = ScaledFinancials;

/**
 * Convert all raw currency/share inputs into the Analyst AI base units (Millions).
 * This is the single source of truth for scaling raw API responses.
 */
export function cleanAndScaleFinancials(raw: RawFinancials): ScaledFinancials {
  const revenueM = toMillions(raw.revenue);
  const ebitdaM = toMillions(raw.ebitda);
  const ebitM = toMillions(raw.ebit);
  const fcfM = toMillions(raw.freeCashFlow);
  const netDebtM = normalizeCurrencyToMillions(raw.netDebt);
  const marketCapM = raw.marketCap !== undefined ? toMillions(raw.marketCap) : undefined;
  const sharesOutstandingM = normalizeSharesOutstanding(raw.sharesOutstanding);

  if (isFinite(revenueM) && isFinite(netDebtM) && revenueM > 0 && netDebtM > revenueM * 3) {
    console.warn('[AnalystAI] normalizeFinancials: netDebtM unusually high vs revenueM', {
      revenueM,
      netDebtM,
      sharesOutstandingM,
    });
  }

  return {
    revenueM,
    ebitdaM,
    ebitM,
    fcfM,
    netDebtM,
    sharesOutstandingM,
    marketCapM,
  };
}

/**
 * Backwards-compatible alias while callers migrate to cleanAndScaleFinancials.
 */
export const normalizeFinancials = cleanAndScaleFinancials;
