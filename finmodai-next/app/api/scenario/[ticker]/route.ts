import { NextResponse } from 'next/server';
import { loadScenarioBaseline, ScenarioBaselineError } from '@/lib/data/scenarioBaseline';
import { BaseCaseDrivers, BullCaseDrivers, BearCaseDrivers } from '@/lib/scenario/drivers';
import { computeScenarioDcf, type ScenarioDcfValuation } from '@/lib/scenario/dcf';
import { compareScenarioValuations } from '@/lib/scenario/compare';
import type { ForecastResult } from '@/lib/scenarioEngine';
import type { ScenarioDrivers } from '@/lib/scenario/drivers';

type ScenarioBundle = {
  drivers: ScenarioDrivers;
  forecast: ForecastResult;
  valuation: ScenarioDcfValuation;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function averageGrowth(growth: number[]): number {
  if (!growth.length) return 0;
  const sum = growth.reduce((acc, g) => acc + g, 0);
  return sum / growth.length;
}

function buildForecast(
  scenarioName: string,
  baseline: {
    revenue_ltm: number;
    ebitda_margin: number;
    net_margin: number;
  },
  drivers: ScenarioDrivers
): ForecastResult {
  const projections: ForecastResult['projections'] = [];
  const growth = drivers.revenueGrowth;
  const startRevenue = baseline.revenue_ltm;
  const baseMargin = baseline.ebitda_margin;
  const targetMargin = drivers.targetEbitdaMargin;
  const rampYears = Math.max(1, Math.round(drivers.marginRampYears));

  const taxFactor = baseMargin !== 0
    ? clamp(baseline.net_margin / baseMargin, 0.4, 0.85)
    : 0.65;

  let currentRevenue = startRevenue;
  let previousRevenue = startRevenue;

  for (let year = 1; year <= growth.length; year++) {
    const yearGrowth = growth[year - 1] ?? 0;
    currentRevenue = currentRevenue * (1 + yearGrowth);
    const rampStep = Math.min(year, rampYears) / rampYears;
    const ebitdaMargin = baseMargin + (targetMargin - baseMargin) * rampStep;
    const ebitda = currentRevenue * ebitdaMargin;

    const reinvestment = drivers.salesToCapital !== 0
      ? (currentRevenue - previousRevenue) / drivers.salesToCapital
      : 0;
    previousRevenue = currentRevenue;

    const afterTaxOperatingIncome = ebitda * taxFactor;
    const freeCashFlow = afterTaxOperatingIncome - reinvestment;

    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      ebitdaMargin,
      freeCashFlow,
    });
  }

  return {
    scenario: scenarioName,
    projections,
  };
}

function buildScenarioBundle(
  name: string,
  baseline: { revenue_ltm: number; ebitda_margin: number; net_margin: number },
  drivers: ScenarioDrivers,
  netDebt: number,
  sharesOutstanding: number
): ScenarioBundle {
  const forecast = buildForecast(name, baseline, drivers);
  const valuation = computeScenarioDcf(forecast, drivers, netDebt, sharesOutstanding);
  return { drivers, forecast, valuation };
}

export async function GET(
  _req: Request,
  context: { params: { ticker: string } }
) {
  try {
    const ticker = context.params.ticker.trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    const baseline = await loadScenarioBaseline(ticker);

    const baseDrivers = BaseCaseDrivers(baseline, baseline.sector);
    const bullDrivers = BullCaseDrivers(baseline, baseline.sector);
    const bearDrivers = BearCaseDrivers(baseline, baseline.sector);

    const baseBundle = buildScenarioBundle(
      'Base',
      baseline,
      baseDrivers,
      baseline.net_debt,
      baseline.shares_outstanding
    );
    const bullBundle = buildScenarioBundle(
      'Bull',
      baseline,
      bullDrivers,
      baseline.net_debt,
      baseline.shares_outstanding
    );
    const bearBundle = buildScenarioBundle(
      'Bear',
      baseline,
      bearDrivers,
      baseline.net_debt,
      baseline.shares_outstanding
    );

    const bullComparison = compareScenarioValuations(
      { ...baseBundle, netDebt: baseline.net_debt, sharesOutstanding: baseline.shares_outstanding },
      { ...bullBundle, netDebt: baseline.net_debt, sharesOutstanding: baseline.shares_outstanding }
    );
    const bearComparison = compareScenarioValuations(
      { ...baseBundle, netDebt: baseline.net_debt, sharesOutstanding: baseline.shares_outstanding },
      { ...bearBundle, netDebt: baseline.net_debt, sharesOutstanding: baseline.shares_outstanding }
    );

    return NextResponse.json({
      ticker: baseline.ticker,
      company_name: baseline.company_name,
      sector: baseline.sector,
      baseline: {
        revenue_ltm: baseline.revenue_ltm,
        ebitda_ltm: baseline.ebitda_ltm,
        net_income_ltm: baseline.net_income_ltm,
        cash: baseline.cash,
        total_debt: baseline.total_debt,
        shares_outstanding: baseline.shares_outstanding,
        ebitda_margin: baseline.ebitda_margin,
        net_margin: baseline.net_margin,
        net_debt: baseline.net_debt,
      },
      drivers: {
        base: baseDrivers,
        bull: bullDrivers,
        bear: bearDrivers,
      },
      forecast: {
        base: baseBundle.forecast,
        bull: bullBundle.forecast,
        bear: bearBundle.forecast,
      },
      valuation: {
        base: baseBundle.valuation,
        bull: bullBundle.valuation,
        bear: bearBundle.valuation,
      },
      comparison: {
        bull: bullComparison,
        bear: bearComparison,
      },
      meta: {
        average_growth: {
          base: averageGrowth(baseDrivers.revenueGrowth),
          bull: averageGrowth(bullDrivers.revenueGrowth),
          bear: averageGrowth(bearDrivers.revenueGrowth),
        },
      },
    });
  } catch (err) {
    if (err instanceof ScenarioBaselineError) {
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Scenario generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
