import type { BaseAssumptions } from '@/lib/scenarioEngine';
import { getDemoFundamentals } from '@/lib/data/providers/demoProvider';

export type ScenarioDriverDefaults = {
  revenueGrowth: number;
  ebitdaMargin: number;
  daPctRevenue: number;
  taxRate: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
};

export type ScenarioBaseline = {
  base: BaseAssumptions;
  defaults: ScenarioDriverDefaults;
  sector: string | null;
  provenance: Record<string, string>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sectorDefaults(sector: string | null): Omit<ScenarioDriverDefaults, 'ebitdaMargin'> {
  const s = (sector || '').toLowerCase();
  if (s.includes('technology')) {
    return { revenueGrowth: 0.1, daPctRevenue: 0.05, taxRate: 0.25, capexPctRevenue: 0.04, nwcPctRevenue: 0.1, wacc: 0.1, terminalGrowth: 0.025 };
  }
  if (s.includes('health')) {
    return { revenueGrowth: 0.07, daPctRevenue: 0.04, taxRate: 0.25, capexPctRevenue: 0.04, nwcPctRevenue: 0.08, wacc: 0.095, terminalGrowth: 0.025 };
  }
  if (s.includes('financial')) {
    return { revenueGrowth: 0.06, daPctRevenue: 0.02, taxRate: 0.25, capexPctRevenue: 0.02, nwcPctRevenue: 0.05, wacc: 0.1, terminalGrowth: 0.0225 };
  }
  if (s.includes('consumer')) {
    return { revenueGrowth: 0.06, daPctRevenue: 0.04, taxRate: 0.25, capexPctRevenue: 0.04, nwcPctRevenue: 0.1, wacc: 0.105, terminalGrowth: 0.0225 };
  }
  if (s.includes('energy')) {
    return { revenueGrowth: 0.04, daPctRevenue: 0.08, taxRate: 0.25, capexPctRevenue: 0.08, nwcPctRevenue: 0.1, wacc: 0.115, terminalGrowth: 0.02 };
  }
  return { revenueGrowth: 0.06, daPctRevenue: 0.04, taxRate: 0.25, capexPctRevenue: 0.04, nwcPctRevenue: 0.1, wacc: 0.105, terminalGrowth: 0.0225 };
}

export async function buildScenarioBaselineFromDemo(tickerRaw: string): Promise<ScenarioBaseline> {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!ticker) throw new Error('ticker required');

  const fundamentals = await getDemoFundamentals(ticker);
  if (!fundamentals) {
    throw new Error(`Demo company not found in demo_company_snapshots: ${ticker}`);
  }

  if (!(typeof fundamentals.revenueLTM === 'number' && Number.isFinite(fundamentals.revenueLTM))) {
    throw new Error(`Missing revenue_ltm for ${ticker}`);
  }
  if (!(typeof fundamentals.ebitdaLTM === 'number' && Number.isFinite(fundamentals.ebitdaLTM))) {
    throw new Error(`Missing ebitda_ltm for ${ticker}`);
  }
  if (!(typeof fundamentals.sharesOutstanding === 'number' && Number.isFinite(fundamentals.sharesOutstanding) && fundamentals.sharesOutstanding > 0)) {
    throw new Error(`Missing shares_outstanding for ${ticker}`);
  }

  const sector = fundamentals.sector ?? null;
  const defaultsCore = sectorDefaults(sector);
  const impliedMargin =
    fundamentals.revenueLTM > 0 ? fundamentals.ebitdaLTM / fundamentals.revenueLTM : null;
  const ebitdaMargin = impliedMargin != null && Number.isFinite(impliedMargin)
    ? clamp(impliedMargin, 0.02, 0.6)
    : 0.25;

  const cash = typeof fundamentals.cash === 'number' && Number.isFinite(fundamentals.cash) ? fundamentals.cash : 0;
  const debt = typeof fundamentals.totalDebt === 'number' && Number.isFinite(fundamentals.totalDebt) ? fundamentals.totalDebt : 0;
  const netDebt = debt - cash;

  const base: BaseAssumptions = {
    ticker,
    companyName: fundamentals.companyName ?? undefined,
    revenue: fundamentals.revenueLTM,
    revenueGrowth: defaultsCore.revenueGrowth,
    ebitdaMargin,
    taxRate: defaultsCore.taxRate,
    wacc: defaultsCore.wacc,
    terminalGrowth: defaultsCore.terminalGrowth,
    capexPctRevenue: defaultsCore.capexPctRevenue,
    nwcPctRevenue: defaultsCore.nwcPctRevenue,
    netDebt,
    sharesOutstanding: fundamentals.sharesOutstanding,
  };

  const defaults: ScenarioDriverDefaults = {
    ...defaultsCore,
    ebitdaMargin,
  };

  return {
    base,
    defaults,
    sector,
    provenance: {
      revenue: 'demo_company_snapshots.revenue_ltm',
      ebitdaMargin: 'demo_company_snapshots.ebitda_ltm / revenue_ltm',
      netDebt: 'demo_company_snapshots.total_debt - cash',
      sharesOutstanding: 'demo_company_snapshots.shares_outstanding (normalized to millions)',
      revenueGrowth: 'scenario_engine.sector_defaults',
      taxRate: 'scenario_engine.sector_defaults',
      wacc: 'scenario_engine.sector_defaults',
      terminalGrowth: 'scenario_engine.sector_defaults',
      capexPctRevenue: 'scenario_engine.sector_defaults',
      nwcPctRevenue: 'scenario_engine.sector_defaults',
      daPctRevenue: 'scenario_engine.sector_defaults',
    },
  };
}
