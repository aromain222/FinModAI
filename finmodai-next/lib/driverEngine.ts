/**
 * Driver Engine — Build forecast drivers from historical normalized actuals
 * Non-flat arrays; length == horizonYears.
 */

import type { NormalizedFinancials, ForecastDrivers } from './secPipeline/types';

const DEFAULT_REVENUE_GROWTH = 0.05;
const DEFAULT_GROSS_MARGIN = 0.4;
const DEFAULT_OPEX_PCT = 0.25;
const DEFAULT_CAPEX_PCT = 0.04;
const DEFAULT_TAX_RATE = 0.25;
const DEFAULT_NWC_PCT = 0.08;
const DEFAULT_DA_PCT = 0.03;

function safeNum(v: number | null | undefined): number | null {
  if (v != null && Number.isFinite(v)) return v;
  return null;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function trendBlend(arr: number[], recentWeight = 0.6): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];
  const recent = arr.slice(-2);
  const older = arr.slice(0, -2);
  const recentAvg = avg(recent);
  const olderAvg = older.length > 0 ? avg(older) : recentAvg;
  return recentWeight * recentAvg + (1 - recentWeight) * olderAvg;
}

/**
 * STEP 6 — Build forecast drivers from last 3–5 periods of normalized actuals.
 */
export function buildForecastDrivers(
  actuals: NormalizedFinancials[],
  horizonYears: number
): ForecastDrivers {
  const periods = actuals.slice(-5);
  const revenueGrowth: number[] = [];
  const grossMarginPct: number[] = [];
  const opexPctRevenue: number[] = [];
  const capexPctRevenue: number[] = [];
  const nwcPctRevenue: number[] = [];
  const daPctRevenue: number[] = [];

  const revenues = periods.map(a => safeNum(a.is.revenue)).filter((v): v is number => v != null && v > 0);
  const revGrowths: number[] = [];
  for (let i = 1; i < revenues.length; i++) {
    const g = (revenues[i] - revenues[i - 1]) / revenues[i - 1];
    if (Number.isFinite(g)) revGrowths.push(g);
  }
  const baseRevGrowth = revGrowths.length > 0 ? trendBlend(revGrowths) : DEFAULT_REVENUE_GROWTH;

  const grossMargins = periods
    .map(a => {
      const rev = safeNum(a.is.revenue);
      const gp = safeNum(a.is.grossProfit);
      if (rev != null && rev > 0 && gp != null) return gp / rev;
      return null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  const baseGrossMargin = grossMargins.length > 0 ? trendBlend(grossMargins) : DEFAULT_GROSS_MARGIN;

  const opexPcts = periods
    .map(a => {
      const rev = safeNum(a.is.revenue);
      const opEx = safeNum(a.is.opEx);
      if (rev != null && rev > 0 && opEx != null) return opEx / rev;
      return null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  const baseOpexPct = opexPcts.length > 0 ? trendBlend(opexPcts) : DEFAULT_OPEX_PCT;

  const capexPcts = periods
    .map(a => {
      const rev = safeNum(a.is.revenue);
      const cap = safeNum(a.cf.capex);
      if (rev != null && rev > 0 && cap != null) return Math.abs(cap) / rev;
      return null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  const baseCapexPct = capexPcts.length > 0 ? trendBlend(capexPcts) : DEFAULT_CAPEX_PCT;

  const nwcPcts = periods
    .map(a => {
      const rev = safeNum(a.is.revenue);
      const ar = safeNum(a.bs.ar) ?? 0;
      const inv = safeNum(a.bs.inventory) ?? 0;
      const ap = safeNum(a.bs.ap) ?? 0;
      const nwc = ar + inv - ap;
      if (rev != null && rev > 0) return nwc / rev;
      return null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  const baseNwcPct = nwcPcts.length > 0 ? trendBlend(nwcPcts) : DEFAULT_NWC_PCT;

  const daPcts = periods
    .map(a => {
      const rev = safeNum(a.is.revenue);
      const da = safeNum(a.is.da);
      if (rev != null && rev > 0 && da != null) return da / rev;
      return null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  const baseDaPct = daPcts.length > 0 ? trendBlend(daPcts) : DEFAULT_DA_PCT;

  const taxRates = periods
    .map(a => {
      const ebt = safeNum(a.is.ebt);
      const tax = safeNum(a.is.tax);
      if (ebt != null && ebt > 0 && tax != null) return tax / ebt;
      return null;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));
  const taxRate = taxRates.length > 0 ? Math.min(0.4, Math.max(0.1, avg(taxRates))) : DEFAULT_TAX_RATE;

  for (let i = 0; i < horizonYears; i++) {
    const decay = 1 - i * 0.02;
    revenueGrowth.push(Math.max(0, Math.min(0.5, baseRevGrowth * decay)));
    grossMarginPct.push(Math.max(0.1, Math.min(0.8, baseGrossMargin)));
    opexPctRevenue.push(Math.max(0.05, Math.min(0.6, baseOpexPct)));
    capexPctRevenue.push(Math.max(0.01, Math.min(0.2, baseCapexPct)));
    nwcPctRevenue.push(Math.max(0, Math.min(0.3, baseNwcPct)));
    daPctRevenue.push(Math.max(0.01, Math.min(0.15, baseDaPct)));
  }

  return {
    horizonYears,
    revenueGrowth,
    grossMarginPct,
    opexPctRevenue,
    capexPctRevenue,
    taxRate,
    nwcPctRevenue,
    daPctRevenue,
  };
}
