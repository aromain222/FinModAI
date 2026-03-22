import type {
  DeterministicValuationAssumptions,
  InvestmentCompanyMetadata,
} from '@/lib/investment-analysis/types';

export const TEST_COMPANY: InvestmentCompanyMetadata = {
  ticker: 'NVDA',
  companyName: 'NVIDIA Corporation',
  sector: 'Semiconductors',
  industry: 'Semiconductors',
  currency: 'USD',
  asOfDate: '2026-03-22',
};

export const TEST_DEFENSE_COMPANY: InvestmentCompanyMetadata = {
  ticker: 'LDOS',
  companyName: 'Leidos Holdings, Inc.',
  sector: 'Defense Tech',
  industry: 'Government Contracting',
  currency: 'USD',
  asOfDate: '2026-03-22',
};

export const BASE_DCF_ASSUMPTIONS: DeterministicValuationAssumptions = {
  baseRevenue: 200000,
  revenueGrowthByYear: [0.12, 0.1, 0.08, 0.06, 0.05],
  operatingMarginByYear: [0.34, 0.345, 0.35, 0.352, 0.355],
  taxRate: 0.18,
  capexPctRevenue: 0.04,
  nwcChangePctRevenue: 0.015,
  wacc: 0.095,
  terminalGrowthRate: 0.03,
  shareCount: 24305,
  netDebt: -2000,
};

export const INVALID_EDGE_ASSUMPTIONS: DeterministicValuationAssumptions = {
  ...BASE_DCF_ASSUMPTIONS,
  revenueGrowthByYear: [],
  operatingMarginByYear: [],
  wacc: 0.03,
  terminalGrowthRate: 0.08,
};
