import type { ModelInputs } from '@/src/core/contracts/modelInputs';
import type { ModelOutputs } from '@/src/core/contracts/modelOutputs';
import { ENGINE_VERSION } from '@/src/core/engine/version';

const safeDivide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

const toSeries = (value: number | number[] | undefined, years: number, fallback: number): number[] => {
  if (Array.isArray(value) && value.length > 0) {
    const normalized = value.slice(0, years);
    while (normalized.length < years) normalized.push(normalized[normalized.length - 1] ?? fallback);
    return normalized;
  }
  return Array.from({ length: years }, () => (typeof value === 'number' ? value : fallback));
};

export function runDcfTemplate(inputs: ModelInputs): ModelOutputs {
  const years = Math.max(3, Math.min(10, Math.round(inputs.assumptions.projectionYears ?? 5)));
  const baseRevenue = (inputs.historicals.revenue && inputs.historicals.revenue[inputs.historicals.revenue.length - 1]) || 1_000;
  const growthSeries = toSeries(inputs.assumptions.growth, years, 0.08);
  const marginSeries = toSeries(inputs.assumptions.margins, years, 0.2);

  const taxRate = inputs.assumptions.taxRate ?? 0.25;
  const capexPct = inputs.assumptions.capexPct ?? 0.04;
  const nwcPct = inputs.assumptions.nwcPct ?? 0.02;
  const daPct = inputs.assumptions.daPct ?? 0.04;
  const wacc = inputs.assumptions.wacc ?? 0.1;
  const terminalGrowth = inputs.assumptions.terminalGrowth ?? 0.025;

  const startYear =
    (inputs.historicals.years && inputs.historicals.years[inputs.historicals.years.length - 1]) ||
    new Date().getUTCFullYear() - 1;
  const projectionYears = Array.from({ length: years }, (_, idx) => startYear + idx + 1);

  const revenue: number[] = [];
  const ebit: number[] = [];
  const fcf: number[] = [];
  let prevRevenue = baseRevenue;

  for (let i = 0; i < years; i += 1) {
    const projectedRevenue = prevRevenue * (1 + growthSeries[i]);
    const projectedEbit = projectedRevenue * marginSeries[i];
    const da = projectedRevenue * daPct;
    const capex = projectedRevenue * capexPct;
    const deltaNwc = projectedRevenue * nwcPct;
    const projectedFcf = projectedEbit * (1 - taxRate) + da - capex - deltaNwc;

    revenue.push(projectedRevenue);
    ebit.push(projectedEbit);
    fcf.push(projectedFcf);
    prevRevenue = projectedRevenue;
  }

  const discountFactors = projectionYears.map((_, idx) => 1 / Math.pow(1 + wacc, idx + 1));
  const pvFcf = fcf.reduce((sum, value, idx) => sum + value * (discountFactors[idx] ?? 0), 0);
  const lastFcf = fcf[fcf.length - 1] ?? 0;
  const lastEbit = ebit[ebit.length - 1] ?? 0;

  const terminalValue =
    typeof inputs.assumptions.terminalMultiple === 'number' && inputs.assumptions.terminalMultiple > 0
      ? lastEbit * (1 - taxRate) * inputs.assumptions.terminalMultiple
      : lastFcf * (1 + terminalGrowth) * safeDivide(1, wacc - terminalGrowth);

  const pvTerminalValue = terminalValue * (discountFactors[discountFactors.length - 1] ?? 0);
  const enterpriseValue = pvFcf + pvTerminalValue;
  const netDebt = inputs.capitalStructure?.netDebt ?? 0;
  const equityValue = enterpriseValue - netDebt;

  const sharesOutstanding =
    inputs.capitalStructure?.sharesOutstanding ?? inputs.pricingAnchor?.sharesOutstanding;
  const impliedSharePrice =
    typeof sharesOutstanding === 'number' && sharesOutstanding > 0
      ? equityValue / sharesOutstanding
      : undefined;

  return {
    templateId: 'dcf',
    summary: {
      enterpriseValue,
      equityValue,
      impliedSharePrice,
      wacc,
      terminalValueShare: safeDivide(pvTerminalValue, enterpriseValue),
      notes: [
        'Deterministic DCF run from normalized ModelInputs.',
        'FCF = EBIT*(1-tax)+D&A-Capex-ΔNWC.',
      ],
    },
    statements: {
      projectionYears,
      revenue,
      ebit,
      fcf,
    },
    charts: {
      series: [
        { id: 'revenue', label: 'Revenue', values: revenue },
        { id: 'fcf', label: 'Free Cash Flow', values: fcf },
      ],
    },
    audit: {
      inputsHash: '',
      timestamp: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      warnings: [],
      assumptionsUsed: {
        years,
        taxRate,
        capexPct,
        nwcPct,
        daPct,
        wacc,
        terminalGrowth,
        terminalMultiple: inputs.assumptions.terminalMultiple ?? null,
      },
    },
  };
}
