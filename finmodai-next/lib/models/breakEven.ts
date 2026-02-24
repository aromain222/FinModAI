import { runLboModel, type LboInputs } from '../lboEngine';
import { computeReverseDcfValuation } from './dcf/reverse';

type RootReason = 'target_out_of_bounds' | 'iteration_limit' | 'invalid_bounds';

type RootResult = {
  converged: boolean;
  solved: number;
  achieved: number | null;
  residual: number | null;
  iterations: number;
  reason?: RootReason;
};

export type DcfSolveFor = 'revenueGrowth' | 'ebitdaMargin';
export type LboSolveFor = 'exitMultiple' | 'entryMultiple';

export type DcfBreakEvenInputs = {
  ticker: string;
  targetPrice: number;
  solveFor: DcfSolveFor;
  revenue: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  taxRate: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  netDebt: number;
  sharesOutstanding: number;
  wacc: number;
  terminalGrowth: number;
  projectionYears: number;
  marketPrice?: number | null;
};

export type LboBreakEvenInputs = {
  ticker: string;
  targetIrr: number;
  solveFor: LboSolveFor;
  lboInputs: LboInputs;
};

export type BreakEvenSolveResult = {
  converged: boolean;
  modelType: 'dcf' | 'lbo';
  solveFor: string;
  solvedValue: number;
  achievedValue: number | null;
  targetValue: number;
  residualError: number | null;
  iterations: number;
  reason?: RootReason;
  fixedAssumptions: Record<string, number | string>;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function solveByBisection(options: {
  target: number;
  evaluate: (value: number) => number | null;
  low: number;
  high: number;
  min: number;
  max: number;
  monotonicDirection: 1 | -1;
  tolerance: number;
  maxIterations?: number;
}): RootResult {
  let low = clamp(options.low, options.min, options.max);
  let high = clamp(options.high, options.min, options.max);
  const maxIterations = options.maxIterations ?? 80;
  const direction = options.monotonicDirection;
  const evalPoint = (value: number) => {
    const y = options.evaluate(value);
    if (!isFiniteNumber(y)) {
      return { y: null as number | null, delta: null as number | null };
    }
    return {
      y,
      delta: (y - options.target) * direction,
    };
  };

  let lowEval = evalPoint(low);
  let highEval = evalPoint(high);
  if (lowEval.delta === null || highEval.delta === null) {
    return {
      converged: false,
      solved: low,
      achieved: lowEval.y,
      residual: lowEval.y !== null ? lowEval.y - options.target : null,
      iterations: 0,
      reason: 'invalid_bounds',
    };
  }

  for (let expand = 0; expand < 12 && lowEval.delta * highEval.delta > 0; expand++) {
    const span = Math.max(Math.abs(high - low), Math.abs(high) * 0.25, 0.25);
    if (lowEval.delta > 0 && highEval.delta > 0) {
      low = clamp(low - span, options.min, options.max);
      lowEval = evalPoint(low);
      if (lowEval.delta === null) break;
    } else {
      high = clamp(high + span, options.min, options.max);
      highEval = evalPoint(high);
      if (highEval.delta === null) break;
    }
    if (low === options.min && high === options.max) break;
  }

  if (
    lowEval.delta === null ||
    highEval.delta === null ||
    lowEval.delta * highEval.delta > 0
  ) {
    const lowResidual = lowEval.y !== null ? Math.abs(lowEval.y - options.target) : Number.POSITIVE_INFINITY;
    const highResidual = highEval.y !== null ? Math.abs(highEval.y - options.target) : Number.POSITIVE_INFINITY;
    const pickLow = lowResidual <= highResidual;
    const solved = pickLow ? low : high;
    const achieved = pickLow ? lowEval.y : highEval.y;
    return {
      converged: false,
      solved,
      achieved,
      residual: achieved !== null ? achieved - options.target : null,
      iterations: 0,
      reason: 'target_out_of_bounds',
    };
  }

  let bestSolved = Math.abs(lowEval.delta) <= Math.abs(highEval.delta) ? low : high;
  let bestAchieved = Math.abs(lowEval.delta) <= Math.abs(highEval.delta) ? lowEval.y : highEval.y;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const mid = (low + high) / 2;
    const midEval = evalPoint(mid);
    if (midEval.delta === null || midEval.y === null) {
      return {
        converged: false,
        solved: bestSolved,
        achieved: bestAchieved,
        residual: bestAchieved !== null ? bestAchieved - options.target : null,
        iterations: iteration,
        reason: 'invalid_bounds',
      };
    }

    if (bestAchieved === null || Math.abs(midEval.y - options.target) < Math.abs(bestAchieved - options.target)) {
      bestSolved = mid;
      bestAchieved = midEval.y;
    }

    if (Math.abs(midEval.y - options.target) <= options.tolerance) {
      return {
        converged: true,
        solved: mid,
        achieved: midEval.y,
        residual: midEval.y - options.target,
        iterations: iteration,
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
    solved: bestSolved,
    achieved: bestAchieved,
    residual: bestAchieved !== null ? bestAchieved - options.target : null,
    iterations: maxIterations,
    reason: 'iteration_limit',
  };
}

export function solveDcfBreakEven(inputs: DcfBreakEvenInputs): BreakEvenSolveResult {
  if (!isFiniteNumber(inputs.targetPrice) || inputs.targetPrice <= 0) {
    throw new Error('DCF break-even targetPrice must be a positive number.');
  }
  if (!isFiniteNumber(inputs.revenue) || inputs.revenue <= 0) {
    throw new Error('DCF break-even requires positive revenue.');
  }
  if (!isFiniteNumber(inputs.sharesOutstanding) || inputs.sharesOutstanding <= 0) {
    throw new Error('DCF break-even requires positive shares outstanding.');
  }
  if (!isFiniteNumber(inputs.wacc) || !isFiniteNumber(inputs.terminalGrowth) || inputs.wacc <= inputs.terminalGrowth) {
    throw new Error('DCF break-even requires WACC greater than terminal growth.');
  }

  const fixedGrowth = isFiniteNumber(inputs.revenueGrowth) ? inputs.revenueGrowth : 0.06;
  const fixedMargin = isFiniteNumber(inputs.ebitdaMargin) ? inputs.ebitdaMargin : 0.25;
  const taxRate = isFiniteNumber(inputs.taxRate) ? inputs.taxRate : 0.25;
  const capexPctRevenue = isFiniteNumber(inputs.capexPctRevenue) ? inputs.capexPctRevenue : 0.04;
  const nwcPctRevenue = isFiniteNumber(inputs.nwcPctRevenue) ? inputs.nwcPctRevenue : 0.02;

  const evaluate = (solveValue: number): number | null => {
    const growth = inputs.solveFor === 'revenueGrowth' ? solveValue : fixedGrowth;
    const margin = inputs.solveFor === 'ebitdaMargin' ? solveValue : fixedMargin;
    if (growth <= -0.95 || margin <= 0 || margin >= 1) return null;
    const valuation = computeReverseDcfValuation(
      {
        ticker: inputs.ticker,
        revenue: inputs.revenue,
        ebitdaMargin: margin,
        taxRate,
        capexPctRevenue,
        nwcPctRevenue,
        netDebt: inputs.netDebt || 0,
        sharesOutstanding: inputs.sharesOutstanding,
        inputs: {
          wacc: inputs.wacc,
          terminalGrowth: inputs.terminalGrowth,
          projectionYears: inputs.projectionYears,
          targetPrice: inputs.targetPrice,
        },
      },
      growth
    );
    return valuation.pricePerShare;
  };

  const base = inputs.solveFor === 'revenueGrowth' ? fixedGrowth : fixedMargin;
  const low = inputs.solveFor === 'revenueGrowth' ? base - 0.2 : base - 0.08;
  const high = inputs.solveFor === 'revenueGrowth' ? base + 0.3 : base + 0.12;
  const min = inputs.solveFor === 'revenueGrowth' ? -0.6 : 0.02;
  const max = inputs.solveFor === 'revenueGrowth' ? 1.2 : 0.8;

  const solved = solveByBisection({
    target: inputs.targetPrice,
    evaluate,
    low,
    high,
    min,
    max,
    monotonicDirection: 1,
    tolerance: 0.01,
  });

  return {
    converged: solved.converged,
    modelType: 'dcf',
    solveFor: inputs.solveFor,
    solvedValue: solved.solved,
    achievedValue: solved.achieved,
    targetValue: inputs.targetPrice,
    residualError: solved.residual,
    iterations: solved.iterations,
    reason: solved.reason,
    fixedAssumptions: {
      revenue: inputs.revenue,
      wacc: inputs.wacc,
      terminalGrowth: inputs.terminalGrowth,
      projectionYears: inputs.projectionYears,
      taxRate,
      capexPctRevenue,
      nwcPctRevenue,
      netDebt: inputs.netDebt || 0,
      sharesOutstanding: inputs.sharesOutstanding,
      revenueGrowth: inputs.solveFor === 'ebitdaMargin' ? fixedGrowth : NaN,
      ebitdaMargin: inputs.solveFor === 'revenueGrowth' ? fixedMargin : NaN,
      marketPrice: inputs.marketPrice ?? NaN,
    },
  };
}

export function solveLboBreakEven(inputs: LboBreakEvenInputs): BreakEvenSolveResult {
  if (!isFiniteNumber(inputs.targetIrr)) {
    throw new Error('LBO break-even target IRR must be numeric.');
  }
  const baseInputs = { ...inputs.lboInputs };
  if (!isFiniteNumber(baseInputs.entryMultiple) || !isFiniteNumber(baseInputs.exitMultiple)) {
    throw new Error('LBO break-even requires valid entry and exit multiples.');
  }

  const evaluate = (solveValue: number): number | null => {
    try {
      const output = runLboModel({
        ...baseInputs,
        entryMultiple: inputs.solveFor === 'entryMultiple' ? solveValue : baseInputs.entryMultiple,
        exitMultiple: inputs.solveFor === 'exitMultiple' ? solveValue : baseInputs.exitMultiple,
      });
      return output.returns.irr;
    } catch {
      return null;
    }
  };

  const base = inputs.solveFor === 'exitMultiple' ? baseInputs.exitMultiple : baseInputs.entryMultiple;
  const solved = solveByBisection({
    target: inputs.targetIrr,
    evaluate,
    low: base - 3,
    high: base + 3,
    min: 0.5,
    max: 40,
    monotonicDirection: inputs.solveFor === 'entryMultiple' ? -1 : 1,
    tolerance: 0.0005,
  });

  const achieved = solved.achieved;
  let solvedMoic: number | null = null;
  if (isFiniteNumber(solved.solved)) {
    try {
      const solvedOutput = runLboModel({
        ...baseInputs,
        entryMultiple: inputs.solveFor === 'entryMultiple' ? solved.solved : baseInputs.entryMultiple,
        exitMultiple: inputs.solveFor === 'exitMultiple' ? solved.solved : baseInputs.exitMultiple,
      });
      solvedMoic = solvedOutput.returns.moic;
    } catch {
      solvedMoic = null;
    }
  }

  return {
    converged: solved.converged,
    modelType: 'lbo',
    solveFor: inputs.solveFor,
    solvedValue: solved.solved,
    achievedValue: achieved,
    targetValue: inputs.targetIrr,
    residualError: solved.residual,
    iterations: solved.iterations,
    reason: solved.reason,
    fixedAssumptions: {
      revenue: baseInputs.revenue,
      ebitda: baseInputs.ebitda,
      debtPercent: baseInputs.debtPercent,
      interestRate: baseInputs.interestRate,
      holdingPeriodYears: baseInputs.holdingPeriodYears,
      revenueGrowth: Array.isArray(baseInputs.revenueGrowth)
        ? baseInputs.revenueGrowth[0] ?? NaN
        : baseInputs.revenueGrowth,
      ebitdaMargin: baseInputs.ebitdaMargin,
      entryMultiple: inputs.solveFor === 'exitMultiple' ? baseInputs.entryMultiple : NaN,
      exitMultiple: inputs.solveFor === 'entryMultiple' ? baseInputs.exitMultiple : NaN,
      solvedMoic: solvedMoic ?? NaN,
    },
  };
}
