/**
 * Model Validator — Ensure no stubbed output; BS balances; cash reconciles.
 * Return structured errors so stubbed models never ship.
 */

import type {
  ThreeStatementForecast,
  ValidationResult,
  BuildFinancialsError,
  NormalizedFinancials,
} from './secPipeline/types';

const BALANCE_TOLERANCE = 0.01;

export function validateThreeStatementForecast(
  forecast: ThreeStatementForecast
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bsBalances: { year: number; ok: boolean; diff?: number }[] = [];
  const cashReconciles: { year: number; ok: boolean; diff?: number }[] = [];

  const years = forecast.years;
  if (!years || years.length === 0) {
    errors.push('No forecast years');
    return {
      bsBalances: [],
      cashReconciles: [],
      allYearsPresent: false,
      noBlanks: false,
      warnings,
      errors,
    };
  }

  let allYearsPresent = true;
  let noBlanks = true;

  for (const year of years) {
    const isRow = forecast.is[year];
    const bsRow = forecast.bs[year];
    const cfRow = forecast.cf[year];

    if (!isRow || !bsRow || !cfRow) {
      allYearsPresent = false;
      errors.push(`Missing IS/BS/CF for year ${year}`);
      continue;
    }

    const checkNum = (v: number, label: string, y: number) => {
      if (v !== v || v === Infinity || v === -Infinity) {
        noBlanks = false;
        errors.push(`${label} invalid (NaN/Inf) in ${y}`);
      }
    };

    checkNum(bsRow.totalAssets, 'totalAssets', year);
    checkNum(bsRow.totalLiabilities, 'totalLiabilities', year);
    checkNum(bsRow.equity, 'equity', year);
    checkNum(bsRow.totalLiabAndEquity, 'totalLiabAndEquity', year);
    const diff = bsRow.totalAssets - bsRow.totalLiabAndEquity;
    const balanceOk = Math.abs(diff) <= BALANCE_TOLERANCE;
    bsBalances.push({ year, ok: balanceOk, diff: balanceOk ? undefined : diff });
    if (!balanceOk) {
      errors.push(`Balance sheet does not balance in ${year} (diff=${diff.toFixed(4)})`);
    }

    const cashDiff = Math.abs((cfRow.endingCash ?? 0) - bsRow.cash);
    const cashOk = cashDiff <= BALANCE_TOLERANCE;
    cashReconciles.push({ year, ok: cashOk, diff: cashOk ? undefined : cashDiff });
    if (!cashOk) {
      errors.push(`Cash does not reconcile in ${year} (CF ending vs BS cash diff=${cashDiff.toFixed(4)})`);
    }
  }

  return {
    bsBalances,
    cashReconciles,
    allYearsPresent,
    noBlanks,
    warnings,
    errors,
  };
}

export function validateNormalizedActuals(actuals: NormalizedFinancials[]): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!actuals || actuals.length === 0) {
    missing.push('actuals');
    return { ok: false, missing };
  }
  const latest = actuals[actuals.length - 1];
  const rev = latest.is?.revenue ?? null;
  if (rev == null || !Number.isFinite(rev) || rev <= 0) missing.push('revenue');
  const ni = latest.is?.netIncome ?? null;
  if (ni == null || !Number.isFinite(ni)) missing.push('netIncome');
  const cash = latest.bs?.cash ?? null;
  if (cash == null || !Number.isFinite(cash)) missing.push('cash');
  const assets = latest.bs?.totalAssets ?? null;
  if (assets == null || !Number.isFinite(assets)) missing.push('totalAssets');
  return { ok: missing.length === 0, missing };
}

/**
 * Structured error when data is insufficient — do not return half-empty model.
 */
export function buildInsufficientDataError(
  code: string,
  message: string,
  missing: string[],
  debug?: Record<string, unknown>
): BuildFinancialsError {
  return {
    ok: false,
    code,
    message,
    missing,
    debug,
  };
}

/**
 * Gate: only return success payload if validations pass.
 */
export function shouldShipModel(validations: ValidationResult): boolean {
  return (
    validations.errors.length === 0 &&
    validations.allYearsPresent &&
    validations.noBlanks &&
    validations.bsBalances.every(b => b.ok) &&
    validations.cashReconciles.every(c => c.ok)
  );
}
