import type {
  InvestmentEventAppliedAssumptionChange,
  InvestmentEventAppliedField,
  InvestmentEventAssumptionApplicationResult,
  InvestmentEventAssumptionDelta,
  InvestmentEventAssumptionDeltaResult,
  InvestmentEventAssumptionValidationIssue,
} from '@/lib/investment-analysis/eventTypes';
import type { DeterministicValuationAssumptions } from '@/lib/investment-analysis/types';

type EditableEventAssumptions = Pick<
  DeterministicValuationAssumptions,
  'revenueGrowthByYear' | 'operatingMarginByYear' | 'wacc' | 'terminalGrowthRate'
>;

function cloneBaseAssumptions(baseAssumptions: EditableEventAssumptions): EditableEventAssumptions {
  return {
    revenueGrowthByYear: [...baseAssumptions.revenueGrowthByYear],
    operatingMarginByYear: [...baseAssumptions.operatingMarginByYear],
    wacc: baseAssumptions.wacc,
    terminalGrowthRate: baseAssumptions.terminalGrowthRate,
  };
}

function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatBpsValue(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value} bps`;
}

function formatPath(values: number[]): string {
  return values.map(formatPercent).join(' / ');
}

function formatDeltaPath(values: number[]): string {
  return values.map(formatBpsValue).join(' / ');
}

function getFieldLabel(field: InvestmentEventAppliedField): string {
  switch (field) {
    case 'revenueGrowthByYear':
      return 'Revenue Growth';
    case 'operatingMarginByYear':
      return 'Operating Margin';
    case 'wacc':
      return 'WACC';
    case 'terminalGrowthRate':
      return 'Terminal Growth';
  }
}

function applyPathDelta(basePath: number[], rawDelta: number | number[]): { updated: number[]; normalizedDelta: number[] } {
  const deltaPath = Array.isArray(rawDelta) ? rawDelta : [rawDelta];
  const updated = basePath.map((value, index) => {
    const deltaBps = deltaPath[Math.min(index, deltaPath.length - 1)] ?? 0;
    return value + bpsToDecimal(deltaBps);
  });

  return {
    updated,
    normalizedDelta: basePath.map((_, index) => deltaPath[Math.min(index, deltaPath.length - 1)] ?? 0),
  };
}

function applyPointDelta(baseValue: number, rawDelta: number | number[]): { updated: number; normalizedDelta: number } {
  const delta = Array.isArray(rawDelta) ? (rawDelta[0] ?? 0) : rawDelta;
  return {
    updated: baseValue + bpsToDecimal(delta),
    normalizedDelta: delta,
  };
}

function applySingleDelta(
  current: EditableEventAssumptions,
  delta: InvestmentEventAssumptionDelta,
): InvestmentEventAppliedAssumptionChange {
  if (delta.lever === 'revenueGrowthByYear' || delta.lever === 'operatingMarginByYear') {
    const originalValue = [...current[delta.lever]];
    const { updated, normalizedDelta } = applyPathDelta(originalValue, delta.amount);
    current[delta.lever] = updated;

    return {
      field: delta.lever,
      label: getFieldLabel(delta.lever),
      unit: 'percent',
      originalValue,
      deltaValue: normalizedDelta,
      updatedValue: updated,
      rationale: delta.rationale,
      confidence: delta.confidence,
      display: {
        original: formatPath(originalValue),
        delta: formatDeltaPath(normalizedDelta),
        updated: formatPath(updated),
      },
    };
  }

  const originalValue = current[delta.lever];
  const { updated, normalizedDelta } = applyPointDelta(originalValue, delta.amount);
  current[delta.lever] = updated;

  return {
    field: delta.lever,
    label: getFieldLabel(delta.lever),
    unit: 'percent',
    originalValue,
    deltaValue: normalizedDelta,
    updatedValue: updated,
    rationale: delta.rationale,
    confidence: delta.confidence,
    display: {
      original: formatPercent(originalValue),
      delta: formatBpsValue(normalizedDelta),
      updated: formatPercent(updated),
    },
  };
}

function validateAdjustedAssumptions(
  assumptions: EditableEventAssumptions,
): InvestmentEventAssumptionValidationIssue[] {
  const issues: InvestmentEventAssumptionValidationIssue[] = [];

  if (assumptions.wacc < 0.05 || assumptions.wacc > 0.18) {
    issues.push({
      field: 'wacc',
      severity: 'warning',
      message: 'WACC moved outside the normal demo range of 5% to 18%.',
    });
  }

  if (assumptions.terminalGrowthRate < 0 || assumptions.terminalGrowthRate > 0.05) {
    issues.push({
      field: 'terminalGrowthRate',
      severity: 'warning',
      message: 'Terminal growth moved outside the normal demo range of 0% to 5%.',
    });
  }

  if (assumptions.terminalGrowthRate >= assumptions.wacc) {
    issues.push({
      field: 'terminalGrowthRate',
      severity: 'error',
      message: 'Terminal growth must remain below WACC for a valid DCF terminal value.',
    });
  }

  if (assumptions.revenueGrowthByYear.some((value) => value < -0.3 || value > 0.5)) {
    issues.push({
      field: 'revenueGrowthByYear',
      severity: 'warning',
      message: 'Revenue growth path includes values outside the normal demo range of -30% to 50%.',
    });
  }

  if (assumptions.operatingMarginByYear.some((value) => value < -0.1 || value > 0.5)) {
    issues.push({
      field: 'operatingMarginByYear',
      severity: 'warning',
      message: 'Operating margin path includes values outside the normal demo range of -10% to 50%.',
    });
  }

  return issues;
}

export function applyEventAssumptionDeltas(
  baseAssumptions: EditableEventAssumptions,
  deltaResult: InvestmentEventAssumptionDeltaResult,
): InvestmentEventAssumptionApplicationResult {
  const base = cloneBaseAssumptions(baseAssumptions);
  const adjusted = cloneBaseAssumptions(baseAssumptions);

  const changes = deltaResult.deltas.map((delta) => applySingleDelta(adjusted, delta));
  const validationIssues = validateAdjustedAssumptions(adjusted);

  return {
    baseAssumptions: base,
    adjustedAssumptions: adjusted,
    changes,
    validationIssues,
    summary: deltaResult.rationaleSummary,
    hasMaterialChanges: changes.length > 0,
  };
}
