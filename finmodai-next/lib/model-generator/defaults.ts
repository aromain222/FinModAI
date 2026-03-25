import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

export const DCF_DEFAULTS = {
  years: 5,
  baseRevenue: 10000,
  cash: 1200,
  debt: 2400,
  sharesOutstanding: 300,
  revenueGrowth: [0.2, 0.16, 0.12, 0.1, 0.08],
  ebitMargin: [0.25, 0.27, 0.28, 0.29, 0.3],
  taxRate: 0.18,
  daPctRevenue: 0.06,
  capexPctRevenue: 0.08,
  nwcPctRevenue: 0.02,
  wacc: 0.09,
  terminalGrowth: 0.025,
} as const;

export const THREE_STATEMENT_DEFAULTS = {
  years: 5,
  baseRevenue: 1000,
  revenueGrowth: [0.15, 0.12, 0.1, 0.08, 0.06],
  grossMargin: 0.6,
  opexPctRevenue: 0.3,
  taxRate: 0.2,
  capexPctRevenue: 0.05,
  daPctRevenue: 0.04,
  debt: 200,
  cash: 100,
} as const;

export const CAP_TABLE_DEFAULTS = {
  roundType: 'Seed',
  preMoney: 12000000,
  raiseAmount: 3000000,
  founderShares: 8000000,
  optionPoolRefresh: 0.1,
} as const;

export const SAAS_OPERATING_DEFAULTS = {
  years: 5,
  companyName: 'SaaS Co.',
  startingArr: 5000000,
  growthRate: 0.4,
  grossMargin: 0.75,
  churn: 0.08,
  cac: 12000,
  arpu: 18000,
} as const;

export const COMPS_DEFAULTS = {
  peerCount: 5,
  valuationMultiples: ['EV / Revenue', 'EV / EBITDA', 'P / E'],
} as const;

export const DEBT_CAPACITY_LITE_DEFAULTS = {
  maxLeverage: 4.5,
  minInterestCoverage: 2.0,
  interestRate: 0.08,
} as const;

export const FOOTBALL_FIELD_DEFAULTS = {
  peerCount: 5,
  includeTradingComps: true,
  includePrecedents: true,
  controlPremiumUplift: 0.15,
} as const;

export const MERGER_DEFAULTS = {
  forecastYears: 5,
  taxRate: 0.25,
  cashPct: 0.5,
  stockPct: 0.5,
  debtPct: 0,
  newDebtRate: 0.06,
  synergies: 0,
  oneTimeCosts: 0,
} as const;

export const PRECEDENTS_DEFAULTS = {
  transactionCount: 5,
  revenueMultiple: 4.5,
  ebitdaMultiple: 13,
} as const;

export const LBO_DEFAULTS = {
  years: 5,
  revenue: 1000,
  ebitda: 250,
  entryMultiple: 10,
  exitMultiple: 11,
  debtPercent: 0.6,
  equityPercent: 0.4,
  interestRate: 0.08,
  amortizationPercent: 0.1,
  cashSweepPercent: 0.5,
  revenueGrowth: [0.08, 0.07, 0.06, 0.05, 0.04],
  ebitdaMargin: 0.25,
  capexPctRevenue: 0.04,
  deltaNwcPctRevenue: 0.01,
  taxRate: 0.25,
  holdingPeriodYears: 5,
} as const;

export const MODEL_GENERATOR_DEFAULTS = {
  DCF: DCF_DEFAULTS,
  THREE_STATEMENT: THREE_STATEMENT_DEFAULTS,
  CAP_TABLE: CAP_TABLE_DEFAULTS,
  SAAS_OPERATING_MODEL: SAAS_OPERATING_DEFAULTS,
  COMPS: COMPS_DEFAULTS,
  DEBT_CAPACITY_LITE: DEBT_CAPACITY_LITE_DEFAULTS,
  FOOTBALL_FIELD: FOOTBALL_FIELD_DEFAULTS,
  MERGER: MERGER_DEFAULTS,
  PRECEDENTS: PRECEDENTS_DEFAULTS,
  LBO: LBO_DEFAULTS,
} as const;

export function getModelDefaults<T extends ModelGeneratorType>(modelType: T): (typeof MODEL_GENERATOR_DEFAULTS)[T] {
  return JSON.parse(JSON.stringify(MODEL_GENERATOR_DEFAULTS[modelType])) as (typeof MODEL_GENERATOR_DEFAULTS)[T];
}
