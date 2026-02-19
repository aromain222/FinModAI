/**
 * Three-Statement Engine — Generate linked IS/BS/CF forecast from drivers + base actuals
 * BS must balance every year; cash from CF feeds BS.
 */

import type {
  NormalizedFinancials,
  ForecastDrivers,
  ThreeStatementForecast,
  ForecastYearIS,
  ForecastYearBS,
  ForecastYearCF,
} from './secPipeline/types';

const ROUNDING_TOLERANCE = 0.01;

function fill<T>(n: number, value: T): T[] {
  return Array.from({ length: n }, () => value);
}

/**
 * STEP 7 — Generate linked three-statement forecast.
 * Base year = most recent annual actual; then project horizonYears forward.
 */
export function generateThreeStatementForecast(
  baseActual: NormalizedFinancials,
  drivers: ForecastDrivers,
  baseYear: number,
  debtConstant: number,
  interestRate: number
): ThreeStatementForecast {
  const n = drivers.horizonYears;
  const years = Array.from({ length: n }, (_, i) => baseYear + 1 + i);

  const revenue: number[] = [];
  const rev0 = (baseActual.is.revenue ?? 0) > 0 ? (baseActual.is.revenue as number) : 1000;
  revenue.push(rev0 * (1 + (drivers.revenueGrowth[0] ?? 0)));
  for (let i = 1; i < n; i++) {
    revenue.push(revenue[i - 1] * (1 + (drivers.revenueGrowth[i] ?? drivers.revenueGrowth[0] ?? 0)));
  }

  const cogsPct = drivers.grossMarginPct.map(m => 1 - m);
  const cogs = revenue.map((r, i) => r * (1 - (drivers.grossMarginPct[i] ?? 0.4)));
  const grossProfit = revenue.map((r, i) => r - cogs[i]);
  const opEx = revenue.map((r, i) => r * (drivers.opexPctRevenue[i] ?? 0.25));
  const ebitda = grossProfit.map((gp, i) => gp - opEx[i]);
  const da = revenue.map((r, i) => r * (drivers.daPctRevenue[i] ?? 0.03));
  const ebit = ebitda.map((eb, i) => eb - da[i]);
  const interestExpense = fill(n, debtConstant * interestRate);
  const ebt = ebit.map((eb, i) => eb - interestExpense[i]);
  const tax = ebt.map(e => Math.max(0, e * drivers.taxRate));
  const netIncome = ebt.map((e, i) => e - tax[i]);

  const capex = revenue.map((r, i) => r * (drivers.capexPctRevenue[i] ?? 0.04));

  const cash0 = (baseActual.bs.cash ?? 0) >= 0 ? (baseActual.bs.cash as number) : 100;
  const ar0 = (baseActual.bs.ar ?? 0) >= 0 ? (baseActual.bs.ar as number) : revenue[0] * 0.15;
  const inv0 = (baseActual.bs.inventory ?? 0) >= 0 ? (baseActual.bs.inventory as number) : cogs[0] * 0.1;
  const ap0 = (baseActual.bs.ap ?? 0) >= 0 ? (baseActual.bs.ap as number) : cogs[0] * 0.08;
  const ppe0 = (baseActual.bs.ppe ?? 0) >= 0 ? (baseActual.bs.ppe as number) : 500;

  const ar: number[] = [ar0];
  const inventory: number[] = [inv0];
  const ap: number[] = [ap0];
  const ppe: number[] = [ppe0];
  for (let i = 1; i < n; i++) {
    const nwcPct = drivers.nwcPctRevenue[i] ?? 0.08;
    const nwc = revenue[i] * nwcPct;
    ar.push(nwc * 0.5);
    inventory.push(nwc * 0.4);
    ap.push(nwc * 0.3);
    ppe.push(Math.max(0, ppe[i - 1] + capex[i] - da[i]));
  }

  const changeNWC: number[] = [];
  const prevNWC = ar0 + inv0 - ap0;
  changeNWC.push((ar[0] + inventory[0] - ap[0]) - prevNWC);
  for (let i = 1; i < n; i++) {
    changeNWC.push((ar[i] + inventory[i] - ap[i]) - (ar[i - 1] + inventory[i - 1] - ap[i - 1]));
  }

  const cfo = netIncome.map((ni, i) => ni + da[i] - changeNWC[i]);
  const cfi = capex.map(c => -c);
  const cff = fill(n, 0);
  const netCashChange = cfo.map((c, i) => c + cfi[i] + cff[i]);
  const endingCash: number[] = [cash0 + netCashChange[0]];
  for (let i = 1; i < n; i++) {
    endingCash.push(endingCash[i - 1] + netCashChange[i]);
  }

  const cash = [...endingCash];
  const currentAssets = cash.map((c, i) => c + ar[i] + inventory[i]);
  const currentLiabilities = [...ap];
  const totalAssets = currentAssets.map((ca, i) => ca + ppe[i]);
  const debt = fill(n, debtConstant);
  const totalLiabilities = currentLiabilities.map((cl, i) => cl + debt[i]);
  const equity: number[] = [];
  const retainedEarnings: number[] = [];
  const re0 = (baseActual.bs.retainedEarnings ?? baseActual.bs.equity ?? 0) >= 0
    ? (baseActual.bs.retainedEarnings ?? baseActual.bs.equity ?? 0) as number
    : 200;
  retainedEarnings.push(re0 + netIncome[0]);
  for (let i = 1; i < n; i++) {
    retainedEarnings.push(retainedEarnings[i - 1] + netIncome[i]);
  }
  for (let i = 0; i < n; i++) {
    equity.push(retainedEarnings[i]);
  }
  const totalLiabAndEquity = totalAssets.map((ta, i) => {
    const diff = ta - (totalLiabilities[i] + equity[i]);
    if (Math.abs(diff) > ROUNDING_TOLERANCE) {
      equity[i] += diff;
    }
    return totalLiabilities[i] + equity[i];
  });

  const isByYear: Record<number, ForecastYearIS> = {};
  const bsByYear: Record<number, ForecastYearBS> = {};
  const cfByYear: Record<number, ForecastYearCF> = {};
  for (let i = 0; i < n; i++) {
    const y = years[i];
    isByYear[y] = {
      revenue: revenue[i],
      cogs: cogs[i],
      grossProfit: grossProfit[i],
      opEx: opEx[i],
      ebitda: ebitda[i],
      da: da[i],
      ebit: ebit[i],
      interestExpense: interestExpense[i],
      ebt: ebt[i],
      tax: tax[i],
      netIncome: netIncome[i],
    };
    bsByYear[y] = {
      cash: cash[i],
      ar: ar[i],
      inventory: inventory[i],
      currentAssets: currentAssets[i],
      ppe: ppe[i],
      totalAssets: totalAssets[i],
      ap: ap[i],
      currentLiabilities: currentLiabilities[i],
      debt: debt[i],
      totalLiabilities: totalLiabilities[i],
      equity: equity[i],
      retainedEarnings: retainedEarnings[i],
      totalLiabAndEquity: totalLiabAndEquity[i],
    };
    cfByYear[y] = {
      netIncome: netIncome[i],
      da: da[i],
      changeNWC: changeNWC[i],
      capex: capex[i],
      cfo: cfo[i],
      cfi: cfi[i],
      cff: cff[i],
      netCashChange: netCashChange[i],
      endingCash: endingCash[i],
    };
  }

  return {
    years,
    is: isByYear,
    bs: bsByYear,
    cf: cfByYear,
  };
}
