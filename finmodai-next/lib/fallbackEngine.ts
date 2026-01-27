// src/lib/fallbackEngine.ts

// ---------- Types ----------

export type Sector =
  | 'software'
  | 'internet'
  | 'fintech'
  | 'consumer'
  | 'luxury'
  | 'industrial'
  | 'staples'
  | 'telecom'
  | 'energy'
  | 'financials'
  | 'other';

export interface HistoricalRevenuePoint {
  year: number;
  revenue: number; // in same units you'll model (e.g. $mm)
}

export interface HistoricalMarginPoint {
  year: number;
  ebitdaMargin: number; // 0.25 = 25%
}

export interface PeerMetrics {
  // all are optional – use when you have a real peer set
  ebitdaMarginMedian?: number;
  capexPctRevenueMedian?: number;
  nwcPctRevenueMedian?: number;
  revenueCagr?: number;
}

export interface WorkingCapitalAssumptions {
  deltaNwcPctRevenue: number; // ΔNWC / Revenue
  daysAR: number;
  daysInventory: number;
  daysAP: number;
}

export interface DebtCapacityInput {
  sector: Sector;
  ltmEbitda: number;       // last-twelve-month EBITDA
  baseInterestRate: number; // blended cost of debt (e.g. 0.07 = 7%)
  targetLeverage?: number; // optional override for net leverage limit
  minCoverage?: number;    // optional override for EBITDA/Interest min
}

export interface DebtCapacityOutput {
  maxDebtByLeverage: number;
  maxDebtByCoverage: number;
  chosenDebt: number;
  impliedNetLeverage: number;
  coverageAtIssue: number;
}

export interface RevenueProjectionInput {
  sector: Sector;
  history?: HistoricalRevenuePoint[];
  peerMetrics?: PeerMetrics;
  forecastYears: number; // number of future periods to project
}

export interface RevenueProjectionOutput {
  baseYearRevenue: number;
  cagrUsed: number;     // decimal, e.g. 0.08 = 8%
  projections: number[]; // length = forecastYears
}

export interface MarginEstimateInput {
  sector: Sector;
  history?: HistoricalMarginPoint[];
  peerMetrics?: PeerMetrics;
}

export interface MarginEstimateOutput {
  ebitdaMargin: number; // decimal
  source: 'history' | 'peers' | 'sector-default';
}

export interface CapexEstimateInput {
  sector: Sector;
  peerMetrics?: PeerMetrics;
}

export interface FallbackEstimates {
  revenue: RevenueProjectionOutput;
  ebitdaMargin: MarginEstimateOutput;
  capexPctRevenue: number;
  workingCapital: WorkingCapitalAssumptions;
  debtCapacity: DebtCapacityOutput;
}

// ---------- Helper Functions ----------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeCagr(start: number, end: number, periods: number): number {
  if (start <= 0 || periods <= 0) return 0;
  return Math.pow(end / start, 1 / periods) - 1;
}

function sectorDefaultGrowth(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
    case 'fintech':
      return 0.10; // 10%
    case 'luxury':
    case 'consumer':
      return 0.06;
    case 'industrial':
    case 'staples':
      return 0.04;
    case 'telecom':
      return 0.03;
    case 'energy':
    case 'financials':
      return 0.03;
    default:
      return 0.05;
  }
}

function sectorDefaultEbitdaMargin(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
      return 0.28;
    case 'fintech':
      return 0.22;
    case 'luxury':
      return 0.24;
    case 'consumer':
      return 0.18;
    case 'industrial':
      return 0.17;
    case 'staples':
      return 0.20;
    case 'telecom':
      return 0.30;
    case 'energy':
      return 0.22;
    case 'financials':
      return 0.25;
    default:
      return 0.18;
  }
}

function sectorDefaultCapexPctRevenue(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
      return 0.02;
    case 'fintech':
      return 0.015;
    case 'luxury':
    case 'consumer':
      return 0.035;
    case 'industrial':
    case 'telecom':
      return 0.05;
    case 'energy':
      return 0.08;
    case 'staples':
      return 0.04;
    case 'financials':
      return 0.01;
    default:
      return 0.035;
  }
}

function sectorDefaultWorkingCapital(sector: Sector): WorkingCapitalAssumptions {
  switch (sector) {
    case 'software':
    case 'internet':
    case 'fintech':
      return {
        deltaNwcPctRevenue: -0.01, // negative working capital (subscriptions)
        daysAR: 40,
        daysInventory: 0,
        daysAP: 30,
      };
    case 'luxury':
    case 'consumer':
      return {
        deltaNwcPctRevenue: 0.02,
        daysAR: 35,
        daysInventory: 70,
        daysAP: 40,
      };
    case 'staples':
      return {
        deltaNwcPctRevenue: 0.015,
        daysAR: 30,
        daysInventory: 50,
        daysAP: 45,
      };
    case 'industrial':
      return {
        deltaNwcPctRevenue: 0.03,
        daysAR: 50,
        daysInventory: 60,
        daysAP: 45,
      };
    case 'telecom':
      return {
        deltaNwcPctRevenue: 0.01,
        daysAR: 35,
        daysInventory: 10,
        daysAP: 40,
      };
    case 'energy':
      return {
        deltaNwcPctRevenue: 0.03,
        daysAR: 45,
        daysInventory: 40,
        daysAP: 35,
      };
    case 'financials':
      return {
        deltaNwcPctRevenue: 0.0,
        daysAR: 0,
        daysInventory: 0,
        daysAP: 0,
      };
    default:
      return {
        deltaNwcPctRevenue: 0.02,
        daysAR: 40,
        daysInventory: 45,
        daysAP: 35,
      };
  }
}

export function sectorLeverageLimit(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
    case 'fintech':
      return 5.0;
    case 'luxury':
    case 'consumer':
    case 'staples':
      return 4.0;
    case 'industrial':
      return 3.5;
    case 'telecom':
      return 4.5;
    case 'energy':
      return 3.0;
    case 'financials':
      return 2.0;
    default:
      return 3.5;
  }
}

function sectorMinCoverage(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
    case 'fintech':
      return 2.0;
    case 'luxury':
    case 'consumer':
    case 'staples':
      return 2.0;
    case 'industrial':
    case 'telecom':
      return 2.25;
    case 'energy':
      return 2.5;
    case 'financials':
      return 2.5;
    default:
      return 2.0;
  }
}

// ---------- Revenue Projection ----------

export function estimateRevenueProjection(
  input: RevenueProjectionInput
): RevenueProjectionOutput {
  const { sector, history, peerMetrics, forecastYears } = input;

  if (!history || history.length === 0) {
    // If we truly have nothing, assume a base year of 1 and grow it.
    const base = 1;
    const growth =
      peerMetrics?.revenueCagr ?? sectorDefaultGrowth(sector);

    const projections: number[] = [];
    let rev = base;
    for (let i = 0; i < forecastYears; i++) {
      rev = rev * (1 + growth);
      projections.push(rev);
    }

    return {
      baseYearRevenue: base,
      cagrUsed: growth,
      projections,
    };
  }

  const sorted = [...history].sort((a, b) => a.year - b.year);
  const first = sorted[0].revenue;
  const last = sorted[sorted.length - 1].revenue;

  let cagr = 0;
  if (sorted.length >= 2 && first > 0) {
    const periods =
      sorted[sorted.length - 1].year - sorted[0].year || sorted.length - 1;
    cagr = computeCagr(first, last, periods);
  }

  // Blend: 60% company history, 40% sector/peer baseline
  const baselineCagr =
    peerMetrics?.revenueCagr ?? sectorDefaultGrowth(sector);
  const blendedCagr = clamp(
    0.6 * cagr + 0.4 * baselineCagr,
    -0.05,
    0.25 // -5% to +25%
  );

  const projections: number[] = [];
  let rev = last;
  for (let i = 0; i < forecastYears; i++) {
    rev = rev * (1 + blendedCagr);
    projections.push(rev);
  }

  return {
    baseYearRevenue: last,
    cagrUsed: blendedCagr,
    projections,
  };
}

// ---------- EBITDA Margin ----------

export function estimateEbitdaMargin(
  input: MarginEstimateInput
): MarginEstimateOutput {
  const { sector, history, peerMetrics } = input;

  if (peerMetrics?.ebitdaMarginMedian != null) {
    return {
      ebitdaMargin: peerMetrics.ebitdaMarginMedian,
      source: 'peers',
    };
  }

  if (history && history.length > 0) {
    const recent = history.slice(-3); // last 3 years
    const avg =
      recent.reduce((sum, p) => sum + p.ebitdaMargin, 0) / recent.length;
    const sectorMedian = sectorDefaultEbitdaMargin(sector);
    const blended = clamp(0.7 * avg + 0.3 * sectorMedian, 0.05, 0.45);

    return {
      ebitdaMargin: blended,
      source: 'history',
    };
  }

  return {
    ebitdaMargin: sectorDefaultEbitdaMargin(sector),
    source: 'sector-default',
  };
}

// ---------- Capex % of Revenue ----------

export function estimateCapexPctRevenue(
  input: CapexEstimateInput
): number {
  const { sector, peerMetrics } = input;

  if (peerMetrics?.capexPctRevenueMedian != null) {
    return peerMetrics.capexPctRevenueMedian;
  }

  return sectorDefaultCapexPctRevenue(sector);
}

// ---------- Working Capital ----------

export function estimateWorkingCapitalAssumptions(
  sector: Sector,
  peerMetrics?: PeerMetrics
): WorkingCapitalAssumptions {
  const base = sectorDefaultWorkingCapital(sector);

  if (peerMetrics?.nwcPctRevenueMedian != null) {
    return {
      ...base,
      deltaNwcPctRevenue: peerMetrics.nwcPctRevenueMedian,
    };
  }

  return base;
}

// ---------- Debt Capacity ----------

export function estimateDebtCapacity(
  input: DebtCapacityInput
): DebtCapacityOutput {
  const {
    sector,
    ltmEbitda,
    baseInterestRate,
    targetLeverage,
    minCoverage,
  } = input;

  const leverageLimit = targetLeverage ?? sectorLeverageLimit(sector);
  const coverageLimit = minCoverage ?? sectorMinCoverage(sector);

  const maxDebtByLev = Math.max(0, ltmEbitda * leverageLimit);
  const maxDebtByCov = Math.max(
    0,
    (ltmEbitda / coverageLimit) / baseInterestRate
  );

  const chosenDebt = Math.min(maxDebtByLev, maxDebtByCov);
  const impliedNetLeverage =
    ltmEbitda > 0 ? chosenDebt / ltmEbitda : 0;
  const coverageAtIssue =
    chosenDebt > 0 ? (ltmEbitda / (chosenDebt * baseInterestRate)) : Infinity;

  return {
    maxDebtByLeverage: maxDebtByLev,
    maxDebtByCoverage: maxDebtByCov,
    chosenDebt,
    impliedNetLeverage,
    coverageAtIssue,
  };
}

// ---------- Master Fallback Builder ----------

export interface BuildFallbackInput {
  sector: Sector;
  forecastYears: number;
  revenueHistory?: HistoricalRevenuePoint[];
  marginHistory?: HistoricalMarginPoint[];
  peerMetrics?: PeerMetrics;
  ltmEbitdaForDebt: number;
  blendedCostOfDebt: number;
}

/**
 * High-level entry point your route can call.
 * This gives you a full set of "banker-style" assumptions
 * when the raw data is missing or incomplete.
 */
export function buildFallbackEstimates(
  input: BuildFallbackInput
): FallbackEstimates {
  const revenue = estimateRevenueProjection({
    sector: input.sector,
    history: input.revenueHistory,
    peerMetrics: input.peerMetrics,
    forecastYears: input.forecastYears,
  });

  const ebitdaMargin = estimateEbitdaMargin({
    sector: input.sector,
    history: input.marginHistory,
    peerMetrics: input.peerMetrics,
  });

  const capexPctRevenue = estimateCapexPctRevenue({
    sector: input.sector,
    peerMetrics: input.peerMetrics,
  });

  const workingCapital = estimateWorkingCapitalAssumptions(
    input.sector,
    input.peerMetrics
  );

  const debtCapacity = estimateDebtCapacity({
    sector: input.sector,
    ltmEbitda: input.ltmEbitdaForDebt,
    baseInterestRate: input.blendedCostOfDebt,
  });

  return {
    revenue,
    ebitdaMargin,
    capexPctRevenue,
    workingCapital,
    debtCapacity,
  };
}

// ---------- OPTIONAL: AI enhancement hook ----------

// This is where you'd plug in OpenAI if you want the model to
// refine the above numbers using language-model reasoning
// on 10-K text, broker notes, etc.
// Keeping it as a stub so your app doesn't break if the key is missing.

export interface AiEnhanceParams {
  ticker: string;
  sector: Sector;
  rawEstimates: FallbackEstimates;
  // add any raw financials / scraped text you want the model to see
}

/*
export async function aiEnhanceFallbacks(
  params: AiEnhanceParams
): Promise<FallbackEstimates> {
  const { rawEstimates, ticker, sector } = params;

  // Example (pseudo-code):
  // const completion = await openai.chat.completions.create({
  //   model: "gpt-4-turbo-preview",
  //   messages: [
  //     {
  //       role: "system",
  //       content:
  //         "You are a private equity associate building a 5-year model. " +
  //         "You refine starting assumptions for revenue CAGR, EBITDA margin, capex %, working capital, and leverage " +
  //         "using industry data and comparable companies.",
  //     },
  //     {
  //       role: "user",
  //       content: JSON.stringify({ ticker, sector, rawEstimates }),
  //     },
  //   ],
  // });

  // const refined = JSON.parse(completion.choices[0].message.content ?? "{}");
  // return { ...rawEstimates, ...refined };

  return rawEstimates;
}
*/

