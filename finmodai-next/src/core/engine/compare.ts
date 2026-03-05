import type { ModelOutputs } from '@/src/core/contracts/modelOutputs';

export type ScenarioOutput = {
  scenarioId: string;
  scenarioName: string;
  outputs: ModelOutputs;
};

export type ScenarioComparisonRow = {
  scenarioId: string;
  scenarioName: string;
  enterpriseValue: number;
  enterpriseValueDeltaVsBase: number;
  enterpriseValuePctVsBase: number;
  impliedSharePrice: number | null;
  impliedSharePriceDeltaVsBase: number | null;
  impliedSharePricePctVsBase: number | null;
};

export type ScenarioComparison = {
  baseScenarioId: string;
  baseScenarioName: string;
  rows: ScenarioComparisonRow[];
};

const safePct = (delta: number, base: number): number => {
  if (!Number.isFinite(base) || base === 0) return 0;
  return delta / base;
};

export function compareScenarios(entries: ScenarioOutput[]): ScenarioComparison {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      baseScenarioId: 'base',
      baseScenarioName: 'Base',
      rows: [],
    };
  }

  const base = entries[0];
  const baseEv = base.outputs.summary.enterpriseValue;
  const basePrice =
    typeof base.outputs.summary.impliedSharePrice === 'number'
      ? base.outputs.summary.impliedSharePrice
      : null;

  const rows: ScenarioComparisonRow[] = entries.map((entry) => {
    const ev = entry.outputs.summary.enterpriseValue;
    const evDelta = ev - baseEv;

    const price =
      typeof entry.outputs.summary.impliedSharePrice === 'number'
        ? entry.outputs.summary.impliedSharePrice
        : null;

    const priceDelta =
      basePrice !== null && price !== null
        ? price - basePrice
        : null;

    return {
      scenarioId: entry.scenarioId,
      scenarioName: entry.scenarioName,
      enterpriseValue: ev,
      enterpriseValueDeltaVsBase: evDelta,
      enterpriseValuePctVsBase: safePct(evDelta, baseEv),
      impliedSharePrice: price,
      impliedSharePriceDeltaVsBase: priceDelta,
      impliedSharePricePctVsBase:
        priceDelta !== null && basePrice !== null ? safePct(priceDelta, basePrice) : null,
    };
  });

  return {
    baseScenarioId: base.scenarioId,
    baseScenarioName: base.scenarioName,
    rows,
  };
}
