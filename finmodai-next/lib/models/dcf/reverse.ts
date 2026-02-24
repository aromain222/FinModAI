export type ReverseDcfInputs = {
  wacc: number;
  terminalGrowth: number;
  projectionYears: number;
  targetPrice: number;
};

export type ReverseDcfSolveContext = {
  ticker: string;
  revenue: number;
  ebitdaMargin: number;
  taxRate: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  netDebt: number;
  sharesOutstanding: number;
  inputs: ReverseDcfInputs;
};

export type ReverseDcfValuation = {
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number;
  pvExplicitFCF: number;
  pvTerminalValue: number;
};

export type ReverseDcfSolveResult = {
  converged: boolean;
  impliedRevenueGrowth: number;
  iterations: number;
  valuation: ReverseDcfValuation;
  pricingGap: number;
  reason?: 'target_out_of_bounds' | 'iteration_limit';
};

export function assessReverseDcfDemoReadiness(input: {
  marketPrice: number | null;
  sharesOutstanding: number | null;
  revenue: number | null;
}): {
  ready: boolean;
  missing: Array<'market_price' | 'shares_outstanding' | 'revenue'>;
} {
  const missing: Array<'market_price' | 'shares_outstanding' | 'revenue'> = [];
  if (!isFiniteNumber(input.marketPrice) || input.marketPrice <= 0) {
    missing.push('market_price');
  }
  if (!isFiniteNumber(input.sharesOutstanding) || input.sharesOutstanding <= 0) {
    missing.push('shares_outstanding');
  }
  if (!isFiniteNumber(input.revenue) || input.revenue <= 0) {
    missing.push('revenue');
  }
  return {
    ready: missing.length === 0,
    missing,
  };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseNumeric = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function parseReverseDcfInputs(raw: any): {
  waccPct: number;
  terminalGrowthPct: number;
  projectionYears: number;
  targetPrice?: number;
} | null {
  const input = raw && typeof raw === 'object' ? raw : {};
  const waccPct = parseNumeric(input.waccPct ?? input.wacc);
  const terminalGrowthPct = parseNumeric(
    input.terminalGrowthPct ?? input.terminalGrowth ?? input.terminal_growth
  );
  const projectionYears = parseNumeric(input.projectionYears ?? input.projection_years);
  const targetPrice = parseNumeric(input.targetPrice ?? input.target_price);

  if (
    !isFiniteNumber(waccPct) ||
    !isFiniteNumber(terminalGrowthPct) ||
    !isFiniteNumber(projectionYears)
  ) {
    return null;
  }

  return {
    waccPct,
    terminalGrowthPct,
    projectionYears,
    targetPrice: isFiniteNumber(targetPrice) ? targetPrice : undefined,
  };
}

export function computeReverseDcfValuation(
  context: ReverseDcfSolveContext,
  growth: number
): ReverseDcfValuation {
  const projectionYears = context.inputs.projectionYears;
  const wacc = context.inputs.wacc;
  const terminalGrowth = context.inputs.terminalGrowth;
  const taxRate = context.taxRate;
  const capexPct = context.capexPctRevenue;
  const nwcPct = context.nwcPctRevenue;
  const ebitdaMargin = context.ebitdaMargin;

  let currentRevenue = context.revenue;
  let previousNwc = currentRevenue * nwcPct;
  let pvExplicitFCF = 0;

  for (let year = 1; year <= projectionYears; year++) {
    currentRevenue = currentRevenue * (1 + growth);
    const ebitda = currentRevenue * ebitdaMargin;
    const nopat = ebitda * (1 - taxRate);
    const capex = currentRevenue * capexPct;
    const currentNwc = currentRevenue * nwcPct;
    const nwcChange = currentNwc - previousNwc;
    previousNwc = currentNwc;

    const fcf = nopat - capex - nwcChange;
    pvExplicitFCF += fcf / Math.pow(1 + wacc, year);
  }

  const finalFCF = currentRevenue * ebitdaMargin * (1 - taxRate) - currentRevenue * capexPct;
  const waccMinusGrowth = wacc - terminalGrowth;
  const terminalValue =
    waccMinusGrowth > 0.001
      ? (finalFCF * (1 + terminalGrowth)) / waccMinusGrowth
      : finalFCF * 10;
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, projectionYears);
  const enterpriseValue = pvExplicitFCF + pvTerminalValue;
  const equityValue = enterpriseValue - context.netDebt;
  const pricePerShare =
    context.sharesOutstanding > 0 ? equityValue / context.sharesOutstanding : 0;

  return {
    enterpriseValue,
    equityValue,
    pricePerShare,
    pvExplicitFCF,
    pvTerminalValue,
  };
}

export function solveReverseDcfImpliedGrowth(
  context: ReverseDcfSolveContext,
  options?: {
    maxIterations?: number;
    priceTolerance?: number;
    initialLowGrowth?: number;
    initialHighGrowth?: number;
  }
): ReverseDcfSolveResult {
  const maxIterations = options?.maxIterations ?? 80;
  const priceTolerance = options?.priceTolerance ?? 0.01;
  let low = options?.initialLowGrowth ?? -0.6;
  let high = options?.initialHighGrowth ?? 0.8;
  const targetPrice = context.inputs.targetPrice;

  const f = (growth: number) => {
    const valuation = computeReverseDcfValuation(context, growth);
    return {
      valuation,
      delta: valuation.pricePerShare - targetPrice,
    };
  };

  let lowEval = f(low);
  let highEval = f(high);

  for (let expand = 0; expand < 10 && lowEval.delta * highEval.delta > 0; expand++) {
    if (lowEval.delta > 0 && highEval.delta > 0) {
      low = clamp(low - 0.1, -0.95, 3.0);
      lowEval = f(low);
    } else {
      high = clamp(high + 0.2, -0.95, 3.0);
      highEval = f(high);
    }
  }

  if (lowEval.delta * highEval.delta > 0) {
    const near = Math.abs(lowEval.delta) <= Math.abs(highEval.delta) ? lowEval : highEval;
    const nearGrowth = near === lowEval ? low : high;
    return {
      converged: false,
      impliedRevenueGrowth: nearGrowth,
      iterations: 0,
      valuation: near.valuation,
      pricingGap: near.delta,
      reason: 'target_out_of_bounds',
    };
  }

  let bestGrowth = Math.abs(lowEval.delta) <= Math.abs(highEval.delta) ? low : high;
  let bestValuation = Math.abs(lowEval.delta) <= Math.abs(highEval.delta) ? lowEval.valuation : highEval.valuation;
  let bestGap = Math.abs(lowEval.delta) <= Math.abs(highEval.delta) ? lowEval.delta : highEval.delta;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const mid = (low + high) / 2;
    const midEval = f(mid);
    if (Math.abs(midEval.delta) < Math.abs(bestGap)) {
      bestGrowth = mid;
      bestValuation = midEval.valuation;
      bestGap = midEval.delta;
    }
    if (Math.abs(midEval.delta) <= priceTolerance) {
      return {
        converged: true,
        impliedRevenueGrowth: mid,
        iterations: iteration,
        valuation: midEval.valuation,
        pricingGap: midEval.delta,
      };
    }
    if (midEval.delta > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return {
    converged: false,
    impliedRevenueGrowth: bestGrowth,
    iterations: maxIterations,
    valuation: bestValuation,
    pricingGap: bestGap,
    reason: 'iteration_limit',
  };
}
