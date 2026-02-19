import type { ForecastResult } from '@/lib/scenarioEngine';
import type { ScenarioDrivers } from '@/lib/scenario/drivers';

export type ScenarioDcfValuation = {
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  terminalValue: number;
  pvOfFcff: number;
};

function presentValue(value: number, rate: number, year: number): number {
  return value / Math.pow(1 + rate, year);
}

export function computeScenarioDcf(
  forecast: ForecastResult,
  drivers: ScenarioDrivers,
  netDebt: number,
  sharesOutstanding: number
): ScenarioDcfValuation {
  const rate = drivers.discountRate;
  const growth = drivers.terminalGrowth;
  const projections = forecast.projections || [];

  let pvOfFcff = 0;
  projections.forEach((projection, idx) => {
    const year = idx + 1;
    const fcff = projection.freeCashFlow;
    pvOfFcff += presentValue(fcff, rate, year);
  });

  const lastFcff = projections.length > 0 ? projections[projections.length - 1].freeCashFlow : 0;
  const terminalValue = (lastFcff * (1 + growth)) / (rate - growth);
  const pvTerminalValue = projections.length > 0 ? presentValue(terminalValue, rate, projections.length) : 0;

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
