import type {
  AnalystDcfAdjustment,
  AnalystDcfAssumptions,
  AnalystDcfDemoPayload,
  AnalystDcfScenarioKey,
  AnalystDcfScenarioResult,
} from '@/lib/analyst/dcfDemo';
import { repairDcfPayloadShareCount } from '@/lib/analyst/dcfUnits';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAssumptions(
  base: AnalystDcfAssumptions,
  adjustment: AnalystDcfAdjustment | null | undefined,
): AnalystDcfAssumptions {
  return {
    ...base,
    revenueGrowth: Array.isArray(adjustment?.revenueGrowth)
      ? adjustment.revenueGrowth.map((value) => Number(clamp(value, -0.05, 0.25).toFixed(4)))
      : base.revenueGrowth,
    ebitMargin: Array.isArray(adjustment?.ebitMargin)
      ? adjustment.ebitMargin.map((value) => Number(clamp(value, 0.05, 0.5).toFixed(4)))
      : base.ebitMargin,
    wacc:
      typeof adjustment?.wacc === 'number'
        ? Number(clamp(adjustment.wacc, 0.06, 0.16).toFixed(4))
        : base.wacc,
    terminalGrowth:
      typeof adjustment?.terminalGrowth === 'number'
        ? Number(clamp(adjustment.terminalGrowth, 0.01, 0.04).toFixed(4))
        : base.terminalGrowth,
  };
}

function buildScenarioAssumptions(
  assumptions: AnalystDcfAssumptions,
  key: AnalystDcfScenarioKey,
): AnalystDcfAssumptions {
  if (key === 'base') return assumptions;

  const growthDelta = key === 'bull' ? 0.015 : -0.015;
  const marginDelta = key === 'bull' ? 0.01 : -0.015;
  const waccDelta = key === 'bull' ? -0.0075 : 0.01;
  const terminalDelta = key === 'bull' ? 0.005 : -0.005;

  return {
    ...assumptions,
    revenueGrowth: assumptions.revenueGrowth.map((value) =>
      Number(clamp(value + growthDelta, -0.03, 0.28).toFixed(4)),
    ),
    ebitMargin: assumptions.ebitMargin.map((value) =>
      Number(clamp(value + marginDelta, 0.06, 0.48).toFixed(4)),
    ),
    wacc: Number(clamp(assumptions.wacc + waccDelta, 0.06, 0.18).toFixed(4)),
    terminalGrowth: Number(clamp(assumptions.terminalGrowth + terminalDelta, 0.01, 0.04).toFixed(4)),
  };
}

function evaluateScenario(
  payload: AnalystDcfDemoPayload,
  assumptions: AnalystDcfAssumptions,
  key: AnalystDcfScenarioKey,
): { scenario: AnalystDcfScenarioResult; forecast: AnalystDcfDemoPayload['forecast'] } {
  const scenarioAssumptions = buildScenarioAssumptions(assumptions, key);
  const baseRevenue = payload.baseMetrics.revenueLtm;
  const years = payload.years;
  const taxRate = scenarioAssumptions.taxRate;
  const daPctRevenue = scenarioAssumptions.daPctRevenue;
  const capexPctRevenue = scenarioAssumptions.capexPctRevenue;
  const nwcPctRevenue = scenarioAssumptions.nwcPctRevenue;
  const wacc = scenarioAssumptions.wacc;
  const terminalGrowth = Math.min(scenarioAssumptions.terminalGrowth, wacc - 0.005);

  const revenue: number[] = [];
  const ebit: number[] = [];
  const fcff: number[] = [];
  const pvFcff: number[] = [];

  let previousRevenue = baseRevenue;
  for (let i = 0; i < years; i += 1) {
    const nextRevenue = previousRevenue * (1 + (scenarioAssumptions.revenueGrowth[i] ?? 0));
    const nextEbit = nextRevenue * (scenarioAssumptions.ebitMargin[i] ?? 0);
    const nopat = nextEbit * (1 - taxRate);
    const da = nextRevenue * daPctRevenue;
    const capex = nextRevenue * capexPctRevenue;
    const deltaNwc = nextRevenue * nwcPctRevenue;
    const nextFcff = nopat + da - capex - deltaNwc;
    const discountFactor = Math.pow(1 + wacc, i + 1);

    revenue.push(nextRevenue);
    ebit.push(nextEbit);
    fcff.push(nextFcff);
    pvFcff.push(nextFcff / discountFactor);
    previousRevenue = nextRevenue;
  }

  const stagePv = pvFcff.reduce((sum, value) => sum + value, 0);
  const lastFcff = fcff[fcff.length - 1] ?? 0;
  const terminalValue = lastFcff * (1 + terminalGrowth) / Math.max(wacc - terminalGrowth, 0.005);
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, years);
  const enterpriseValue = stagePv + pvTerminalValue;
  const equityValue = enterpriseValue - payload.baseMetrics.netDebt;
  const pricePerShare =
    typeof payload.baseMetrics.sharesOutstanding === 'number' && payload.baseMetrics.sharesOutstanding > 0
      ? equityValue / payload.baseMetrics.sharesOutstanding
      : null;
  const upsidePct =
    pricePerShare !== null && payload.baseMetrics.sharePrice !== null && payload.baseMetrics.sharePrice > 0
      ? pricePerShare / payload.baseMetrics.sharePrice - 1
      : null;
  const terminalValueWeight = enterpriseValue !== 0 ? pvTerminalValue / enterpriseValue : null;

  return {
    scenario: {
      name: key === 'bull' ? 'Bull' : key === 'bear' ? 'Bear' : 'Base',
      enterpriseValue,
      equityValue,
      pricePerShare,
      marketPrice: payload.baseMetrics.sharePrice,
      upsidePct,
      netDebt: payload.baseMetrics.netDebt,
      stagePv,
      terminalValue,
      pvTerminalValue,
      terminalValueWeight,
    },
    forecast: revenue.map((value, index) => ({
      year: new Date().getUTCFullYear() + index + 1,
      revenue: value,
      ebit: ebit[index] ?? 0,
      fcff: fcff[index] ?? 0,
    })),
  };
}

export function buildAnalystDcfPreviewPayload(
  payload: AnalystDcfDemoPayload,
  adjustment: AnalystDcfAdjustment,
): AnalystDcfDemoPayload {
  const repairedPayload = repairDcfPayloadShareCount(payload);
  const assumptions = normalizeAssumptions(repairedPayload.assumptions, adjustment);
  const base = evaluateScenario(repairedPayload, assumptions, 'base');
  const bull = evaluateScenario(repairedPayload, assumptions, 'bull');
  const bear = evaluateScenario(repairedPayload, assumptions, 'bear');

  return {
    ...repairedPayload,
    assumptions,
    forecast: base.forecast,
    scenarios: {
      base: base.scenario,
      bull: bull.scenario,
      bear: bear.scenario,
    },
  };
}
