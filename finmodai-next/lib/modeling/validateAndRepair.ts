import type { LBODebtScheduleYear, LboEngineOutput } from '@/lib/lboEngine';
import type { CompsModel } from '@/types/compsModel';
import type { MergerModelOutput } from '@/lib/models/merger/compute';

const TOLERANCE = 0.01;
const SAFE_FORECAST_YEARS = 5;

export type ModelChecksPayload = {
  incomeTies?: boolean;
  debtScheduleTies?: boolean;
  sourcesUsesBalanced?: boolean;
  outlierHandling?: boolean;
  issues: string[];
  repaired?: boolean;
  safeMode?: boolean;
};

export type ValidationResult = {
  checks: ModelChecksPayload;
  repaired: boolean;
  safeMode: boolean;
};

function sumArray(values: number[]): number {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function buildSafeLboForecast(summary: LboEngineOutput): LboEngineOutput['forecast'] {
  const baseRevenue = Math.max(summary.ltmRevenue || 0, 100);
  const revenueGrowth = 0.05;
  const ebitdaMargin = 0.25;
  const fcfPct = 0.5;
  return Array.from({ length: SAFE_FORECAST_YEARS }, (_, idx) => {
    const revenue = baseRevenue * Math.pow(1 + revenueGrowth, idx + 1);
    const ebitda = revenue * ebitdaMargin;
    return {
      year: idx + 1,
      revenue,
      ebitda,
      unleveredFcf: ebitda * fcfPct,
    };
  });
}

function buildSafeDebtSchedule(summary: LboEngineOutput): LBODebtScheduleYear[] {
  const schedule: LBODebtScheduleYear[] = [];
  let openingDebt = Math.max(summary.netDebt || 0, 0);
  for (let idx = 0; idx < SAFE_FORECAST_YEARS; idx++) {
    const mandatoryAmort = openingDebt * 0.05;
    const optionalPaydown = Math.min(openingDebt - mandatoryAmort, openingDebt * 0.1);
    const endingDebt = Math.max(openingDebt - mandatoryAmort - optionalPaydown, 0);
    const interestExpense = openingDebt * 0.065;
    schedule.push({
      year: idx + 1,
      openingDebt,
      mandatoryAmort,
      optionalPaydown,
      interestExpense,
      revolverDraw: 0,
      endingDebt,
      revolverBalance: 0,
      freeCashFlowAfterDebtService: Math.max(endingDebt * 0.1, 0),
    });
    openingDebt = endingDebt;
  }
  return schedule;
}

function debtRowConsistent(row: LBODebtScheduleYear): boolean {
  const expected = Math.max(row.openingDebt - row.mandatoryAmort - row.optionalPaydown, 0);
  if (!Number.isFinite(row.endingDebt) || !Number.isFinite(row.openingDebt)) {
    return false;
  }
  return Math.abs(row.endingDebt - expected) <= TOLERANCE;
}

export function validateLBO(params: { summary: LboEngineOutput }): ValidationResult {
  const { summary } = params;
  const issues: string[] = [];
  let repaired = false;
  let safeMode = false;

  let incomeTies =
    Array.isArray(summary.forecast) &&
    summary.forecast.length > 0 &&
    summary.forecast.every((row) => Number.isFinite(row.revenue) && Number.isFinite(row.ebitda));

  if (!incomeTies) {
    issues.push('Forecast income statement incomplete');
    summary.forecast = buildSafeLboForecast(summary);
    incomeTies = summary.forecast.length > 0;
    repaired = true;
  }

  let debtScheduleTies =
    Array.isArray(summary.debtSchedule) &&
    summary.debtSchedule.length === summary.forecast.length &&
    summary.debtSchedule.every(debtRowConsistent);

  if (!debtScheduleTies && Array.isArray(summary.debtSchedule)) {
    summary.debtSchedule.forEach((row) => {
      row.endingDebt = Math.max(row.openingDebt - row.mandatoryAmort - row.optionalPaydown, 0);
    });
    debtScheduleTies =
      summary.debtSchedule.length === summary.forecast.length &&
      summary.debtSchedule.every(debtRowConsistent);
    if (debtScheduleTies) {
      repaired = true;
    }
  }

  if (!debtScheduleTies) {
    issues.push('Debt schedule mismatched after repair');
  }

  if (!incomeTies || !debtScheduleTies) {
    safeMode = true;
    summary.forecast = buildSafeLboForecast(summary);
    summary.debtSchedule = buildSafeDebtSchedule(summary);
    issues.push('Switched to safe-mode LBO data');
  }

  return {
    checks: {
      incomeTies,
      debtScheduleTies,
      issues,
      repaired,
      safeMode,
    },
    repaired,
    safeMode,
  };
}

function clampValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function rebuildCompsSummary(model: CompsModel) {
  const evRevenuePool = model.comps
    .map((comp) => comp.evRevenue)
    .filter((value) => Number.isFinite(value));
  const evEbitdaPool = model.comps
    .map((comp) => comp.evEbitda)
    .filter((value) => Number.isFinite(value));
  const pePool = model.comps
    .map((comp) => comp.pe)
    .filter((value) => Number.isFinite(value));

  const calcStats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const mean = count > 0 ? sumArray(sorted) / count : 0;
    const getPercentile = (pct: number) => {
      if (count === 0) return 0;
      const index = Math.min(count - 1, Math.floor((count - 1) * pct));
      return sorted[index];
    };
    return {
      min: sorted[0] ?? 0,
      p25: getPercentile(0.25),
      median: median(values),
      mean,
      p75: getPercentile(0.75),
      max: sorted[count - 1] ?? 0,
    };
  };

  model.stats = {
    evRevenue: calcStats(evRevenuePool),
    evEbitda: calcStats(evEbitdaPool),
    evEbit: model.stats?.evEbit ?? { min: 0, median: 0, mean: 0, max: 0, p25: 0, p75: 0 },
    pe: calcStats(pePool),
  } as any;
}

export function validateComps(params: { model: CompsModel }): ValidationResult {
  const { model } = params;
  const issues: string[] = [];
  let repaired = false;
  let safeMode = false;

  const evEbitdaValues = model.comps
    .map((comp) => comp.evEbitda)
    .filter((value) => Number.isFinite(value) && value > 0);

  const medianEvEbitda = median(evEbitdaValues);
  const hasOutliers =
    evEbitdaValues.some((value) => value > medianEvEbitda * 2 || value < medianEvEbitda * 0.5) &&
    medianEvEbitda > 0;

  let outlierHandling = !hasOutliers;

  if (hasOutliers && medianEvEbitda > 0) {
    const lower = medianEvEbitda * 0.5;
    const upper = medianEvEbitda * 2;
    model.comps = model.comps.map((comp) => {
      const evEbitda = Number.isFinite(comp.evEbitda) ? comp.evEbitda : medianEvEbitda;
      const clamped = clampValue(evEbitda, lower, upper);
      if (clamped !== evEbitda) {
        repaired = true;
      }
      return {
        ...comp,
        evEbitda: clamped,
      };
    });
    rebuildCompsSummary(model);
    const newValues = model.comps
      .map((comp) => comp.evEbitda)
      .filter((value) => Number.isFinite(value) && value > 0);
    const newMedian = median(newValues);
    outlierHandling = !newValues.some((value) => value > newMedian * 2 || value < newMedian * 0.5);
  }

  if (!outlierHandling) {
    safeMode = true;
    const fallback: CompsModel = {
      target: model.target,
      comps: [model.target, ...(model.comps.slice(0, 2))].map((comp) => ({
        ...comp,
        evRevenue: comp.evRevenue || 0,
        evEbitda: comp.evEbitda || 0,
        pe: comp.pe || 0,
      })),
      stats: model.stats,
      impliedValuation: model.impliedValuation,
      commentary: model.commentary,
      metadata: model.metadata,
    };
    model.comps = fallback.comps;
    rebuildCompsSummary(model);
    issues.push('Fallback comps used after repeated outlier detection');
  }

  if (issues.length === 0 && repaired) {
    issues.push('Outliers clamped deterministically');
  }

  return {
    checks: {
      outlierHandling,
      issues,
      repaired,
      safeMode,
    },
    repaired,
    safeMode,
  };
}

export function validateMerger(params: { output: MergerModelOutput }): ValidationResult {
  const { output } = params;
  const issues: string[] = [];
  let repaired = false;
  let safeMode = false;

  const sources = output.sourcesUses?.sources ?? [];
  const uses = output.sourcesUses?.uses ?? [];
  const sumSources = sumArray(sources.map((item) => item.amount));
  const sumUses = sumArray(uses.map((item) => item.amount));
  let difference = sumSources - sumUses;
  let sourcesUsesBalanced = Math.abs(difference) <= TOLERANCE;

  if (!sourcesUsesBalanced && sources.length > 0) {
    const target = sources[sources.length - 1];
    target.amount -= difference;
    repaired = true;
  } else if (!sourcesUsesBalanced && uses.length > 0) {
    const target = uses[uses.length - 1];
    target.amount += difference;
    repaired = true;
  }

  const newSumSources = sumArray(sources.map((item) => item.amount));
  const newSumUses = sumArray(uses.map((item) => item.amount));
  difference = newSumSources - newSumUses;
  sourcesUsesBalanced = Math.abs(difference) <= TOLERANCE;

  if (!sourcesUsesBalanced) {
    safeMode = true;
    const targetAmount = Math.max(output.dealConsideration.equityValue, 1);
    output.sourcesUses.sources = [{ item: 'Equity / Cash', amount: targetAmount }];
    output.sourcesUses.uses = [{ item: 'Equity Purchase', amount: targetAmount }];
    sourcesUsesBalanced = true;
    issues.push('Safe-mode merger sources & uses applied');
  }

  output.checks = {
    ...output.checks,
    sourcesUsesBalanced,
  };

  return {
    checks: {
      sourcesUsesBalanced,
      issues,
      repaired,
      safeMode,
    },
    repaired,
    safeMode,
  };
}
