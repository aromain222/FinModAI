import type { ForecastResult } from '@/lib/scenarioEngine';
import type { ScenarioDrivers } from '@/lib/scenario/drivers';
import type { ScenarioDcfValuation } from '@/lib/scenario/dcf';

export type ScenarioValuationInput = {
  valuation: ScenarioDcfValuation;
  forecast: ForecastResult;
  drivers: ScenarioDrivers;
  netDebt: number;
  sharesOutstanding: number;
};

export type ScenarioComparison = {
  deltaEnterpriseValue: number;
  deltaEquityValue: number;
  deltaPerShare: number;
  driversImpactBreakdown: {
    revenueChangePct: number;
    marginExpansionPct: number;
    terminalGrowthPct: number;
  };
};

function presentValue(value: number, rate: number, year: number): number {
  return value / Math.pow(1 + rate, year);
}

function computeValuationFromFcff(
  fcffSeries: number[],
  discountRate: number,
  terminalGrowth: number,
  netDebt: number,
  sharesOutstanding: number
): ScenarioDcfValuation {
  let pvOfFcff = 0;
  fcffSeries.forEach((fcff, idx) => {
    pvOfFcff += presentValue(fcff, discountRate, idx + 1);
  });

  const lastFcff = fcffSeries.length > 0 ? fcffSeries[fcffSeries.length - 1] : 0;
  const terminalValue = (lastFcff * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  const pvTerminalValue = fcffSeries.length > 0 ? presentValue(terminalValue, discountRate, fcffSeries.length) : 0;
  const enterpriseValue = pvOfFcff + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const valuePerShare = equityValue / sharesOutstanding;

  return {
    enterpriseValue,
    equityValue,
    valuePerShare,
    terminalValue,
    pvOfFcff,
  };
}

function buildFcffMargins(forecast: ForecastResult): number[] {
  return forecast.projections.map(p => {
    if (!Number.isFinite(p.revenue) || p.revenue === 0) return 0;
    return p.freeCashFlow / p.revenue;
  });
}

function buildFcffFromRevenueAndMargins(revenues: number[], margins: number[]): number[] {
  const length = Math.min(revenues.length, margins.length);
  const series: number[] = [];
  for (let i = 0; i < length; i++) {
    series.push(revenues[i] * margins[i]);
  }
  return series;
}

function toPct(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return 0;
  return value / total;
}

export function compareScenarioValuations(
  base: ScenarioValuationInput,
  scenario: ScenarioValuationInput
): ScenarioComparison {
  const deltaEnterpriseValue = scenario.valuation.enterpriseValue - base.valuation.enterpriseValue;
  const deltaEquityValue = scenario.valuation.equityValue - base.valuation.equityValue;
  const deltaPerShare = scenario.valuation.valuePerShare - base.valuation.valuePerShare;

  const baseRevenues = base.forecast.projections.map(p => p.revenue);
  const scenarioRevenues = scenario.forecast.projections.map(p => p.revenue);
  const baseMargins = buildFcffMargins(base.forecast);
  const scenarioMargins = buildFcffMargins(scenario.forecast);

  const revenueOnlyFcff = buildFcffFromRevenueAndMargins(scenarioRevenues, baseMargins);
  const marginOnlyFcff = buildFcffFromRevenueAndMargins(baseRevenues, scenarioMargins);

  const revenueOnlyValuation = computeValuationFromFcff(
    revenueOnlyFcff,
    base.drivers.discountRate,
    base.drivers.terminalGrowth,
    base.netDebt,
    base.sharesOutstanding
  );
  const marginOnlyValuation = computeValuationFromFcff(
    marginOnlyFcff,
    base.drivers.discountRate,
    base.drivers.terminalGrowth,
    base.netDebt,
    base.sharesOutstanding
  );
  const terminalOnlyValuation = computeValuationFromFcff(
    base.forecast.projections.map(p => p.freeCashFlow),
    base.drivers.discountRate,
    scenario.drivers.terminalGrowth,
    base.netDebt,
    base.sharesOutstanding
  );

  const revenueDelta = revenueOnlyValuation.enterpriseValue - base.valuation.enterpriseValue;
  const marginDelta = marginOnlyValuation.enterpriseValue - base.valuation.enterpriseValue;
  const terminalDelta = terminalOnlyValuation.enterpriseValue - base.valuation.enterpriseValue;

  return {
    deltaEnterpriseValue,
    deltaEquityValue,
    deltaPerShare,
    driversImpactBreakdown: {
      revenueChangePct: toPct(revenueDelta, deltaEnterpriseValue),
      marginExpansionPct: toPct(marginDelta, deltaEnterpriseValue),
      terminalGrowthPct: toPct(terminalDelta, deltaEnterpriseValue),
    },
  };
}
