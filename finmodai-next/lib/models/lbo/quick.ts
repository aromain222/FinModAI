import type { AppliedDefault } from '@/lib/settings/schema';

export type QuickLboInputs = {
  entryMultiple: number;
  debtPercent: number; // percent, e.g. 60
  interestRatePct: number; // percent, e.g. 7
  revenueGrowthPct: number; // percent, e.g. 5
  exitMultiple: number;
  holdingPeriodYears: number;
};

export type QuickLboAutoDefaults = {
  transactionFeesPercent: number;
  exitFeesPercent: number;
  amortizationPercent: number;
  cashSweepPercent: number;
  ebitdaMargin: number;
  capexPctRevenue: number;
  deltaNwcPctRevenue: number;
  taxRate: number;
  minimumCashBalance: number;
};

export const QUICK_LBO_AUTO_DEFAULTS: QuickLboAutoDefaults = {
  transactionFeesPercent: 0.015,
  exitFeesPercent: 0.01,
  amortizationPercent: 0.05,
  cashSweepPercent: 1.0,
  ebitdaMargin: 0.25,
  capexPctRevenue: 0.04,
  deltaNwcPctRevenue: 0.02,
  taxRate: 0.25,
  minimumCashBalance: 0,
};

export const QUICK_LBO_DEFAULT_SUMMARY: Array<{ label: string; value: string }> = [
  { label: 'Transaction Fees', value: '1.5%' },
  { label: 'Exit Fees', value: '1.0%' },
  { label: 'Mandatory Amortization', value: '5.0%' },
  { label: 'Cash Sweep', value: '100%' },
  { label: 'EBITDA Margin', value: '25.0%' },
  { label: 'Capex % Revenue', value: '4.0%' },
  { label: 'ΔNWC % Revenue', value: '2.0%' },
  { label: 'Tax Rate', value: '25.0%' },
  { label: 'Minimum Cash Balance', value: '$0MM' },
];

export type QuickLboBuildResult = {
  quickInputs: QuickLboInputs;
  lboOverrides: Record<string, number>;
  lboDealAssumptions: {
    entry: { entryMultiple: number; transactionFeesPercent: number };
    financing: {
      debtPercent: number;
      equityPercent: number;
      interestRate: number;
      amortizationPercent: number;
      cashSweepPercent: number;
    };
    operations: {
      revenueGrowth: number;
      ebitdaMargin: number;
      capexPctRevenue: number;
      deltaNwcPctRevenue: number;
      taxRate: number;
    };
    exit: { exitMultiple: number; holdingPeriodYears: number; exitFeesPercent: number };
  };
  appliedDefaults: AppliedDefault[];
  workbookNotes: string[];
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseNumeric = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export function normalizeQuickLboInputs(raw: any): QuickLboInputs | null {
  const input = raw && typeof raw === 'object' ? raw : {};
  const entryMultiple = parseNumeric(input.entryMultiple ?? input.entry_multiple);
  const debtPercent = parseNumeric(input.debtPercent ?? input.debt_percent);
  const interestRatePct = parseNumeric(input.interestRatePct ?? input.interestRate ?? input.interest_rate);
  const revenueGrowthPct = parseNumeric(input.revenueGrowthPct ?? input.revenueGrowth ?? input.revenue_growth);
  const exitMultiple = parseNumeric(input.exitMultiple ?? input.exit_multiple);
  const holdingPeriodYears = parseNumeric(input.holdingPeriodYears ?? input.holding_period_years);

  if (
    !isFiniteNumber(entryMultiple) ||
    !isFiniteNumber(debtPercent) ||
    !isFiniteNumber(interestRatePct) ||
    !isFiniteNumber(revenueGrowthPct) ||
    !isFiniteNumber(exitMultiple) ||
    !isFiniteNumber(holdingPeriodYears)
  ) {
    return null;
  }

  return {
    entryMultiple,
    debtPercent,
    interestRatePct,
    revenueGrowthPct,
    exitMultiple,
    holdingPeriodYears,
  };
}

export function buildQuickLboPayload(quickInputs: QuickLboInputs): QuickLboBuildResult {
  const debtPercentDecimal = quickInputs.debtPercent / 100;
  const equityPercentDecimal = Math.max(0, 1 - debtPercentDecimal);
  const interestRateDecimal = quickInputs.interestRatePct / 100;
  const revenueGrowthDecimal = quickInputs.revenueGrowthPct / 100;

  const lboOverrides: Record<string, number> = {
    entryMultiple: quickInputs.entryMultiple,
    exitMultiple: quickInputs.exitMultiple,
    debtPercent: debtPercentDecimal,
    equityPercent: equityPercentDecimal,
    interestRate: interestRateDecimal,
    revenueGrowth: revenueGrowthDecimal,
    holdingPeriodYears: quickInputs.holdingPeriodYears,
    exitYear: quickInputs.holdingPeriodYears,
    leverageMultiple: quickInputs.entryMultiple * debtPercentDecimal,
    transactionFeesPercent: QUICK_LBO_AUTO_DEFAULTS.transactionFeesPercent,
    exitFeesPercent: QUICK_LBO_AUTO_DEFAULTS.exitFeesPercent,
    amortizationPercent: QUICK_LBO_AUTO_DEFAULTS.amortizationPercent,
    cashSweepPercent: QUICK_LBO_AUTO_DEFAULTS.cashSweepPercent,
    ebitdaMargin: QUICK_LBO_AUTO_DEFAULTS.ebitdaMargin,
    capexPercent: QUICK_LBO_AUTO_DEFAULTS.capexPctRevenue,
    nwcPercent: QUICK_LBO_AUTO_DEFAULTS.deltaNwcPctRevenue,
    taxRate: QUICK_LBO_AUTO_DEFAULTS.taxRate,
    minimumCash: QUICK_LBO_AUTO_DEFAULTS.minimumCashBalance,
    offerPremium: 0,
    termLoanBRate: interestRateDecimal,
    revolverRate: interestRateDecimal,
  };

  const lboDealAssumptions = {
    entry: {
      entryMultiple: quickInputs.entryMultiple,
      transactionFeesPercent: QUICK_LBO_AUTO_DEFAULTS.transactionFeesPercent,
    },
    financing: {
      debtPercent: debtPercentDecimal,
      equityPercent: equityPercentDecimal,
      interestRate: interestRateDecimal,
      amortizationPercent: QUICK_LBO_AUTO_DEFAULTS.amortizationPercent,
      cashSweepPercent: QUICK_LBO_AUTO_DEFAULTS.cashSweepPercent,
    },
    operations: {
      revenueGrowth: revenueGrowthDecimal,
      ebitdaMargin: QUICK_LBO_AUTO_DEFAULTS.ebitdaMargin,
      capexPctRevenue: QUICK_LBO_AUTO_DEFAULTS.capexPctRevenue,
      deltaNwcPctRevenue: QUICK_LBO_AUTO_DEFAULTS.deltaNwcPctRevenue,
      taxRate: QUICK_LBO_AUTO_DEFAULTS.taxRate,
    },
    exit: {
      exitMultiple: quickInputs.exitMultiple,
      holdingPeriodYears: quickInputs.holdingPeriodYears,
      exitFeesPercent: QUICK_LBO_AUTO_DEFAULTS.exitFeesPercent,
    },
  };

  const appliedDefaults: AppliedDefault[] = [
    {
      path: 'quickLbo.mode',
      field: 'quickLbo',
      value: true,
      reason: 'Quick LBO (Demo assumptions) enabled',
      source: 'system',
    },
    {
      path: 'lboOverrides.equityPercent',
      field: 'equityPercent',
      value: equityPercentDecimal,
      reason: 'Derived as 1 - debtPercent in quick LBO mode',
      source: 'system',
    },
    {
      path: 'lboOverrides.transactionFeesPercent',
      field: 'transactionFeesPercent',
      value: QUICK_LBO_AUTO_DEFAULTS.transactionFeesPercent,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.exitFeesPercent',
      field: 'exitFeesPercent',
      value: QUICK_LBO_AUTO_DEFAULTS.exitFeesPercent,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.amortizationPercent',
      field: 'amortizationPercent',
      value: QUICK_LBO_AUTO_DEFAULTS.amortizationPercent,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.cashSweepPercent',
      field: 'cashSweepPercent',
      value: QUICK_LBO_AUTO_DEFAULTS.cashSweepPercent,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.ebitdaMargin',
      field: 'ebitdaMargin',
      value: QUICK_LBO_AUTO_DEFAULTS.ebitdaMargin,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.capexPercent',
      field: 'capexPctRevenue',
      value: QUICK_LBO_AUTO_DEFAULTS.capexPctRevenue,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.nwcPercent',
      field: 'deltaNwcPctRevenue',
      value: QUICK_LBO_AUTO_DEFAULTS.deltaNwcPctRevenue,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.taxRate',
      field: 'taxRate',
      value: QUICK_LBO_AUTO_DEFAULTS.taxRate,
      reason: 'Quick LBO default',
      source: 'system',
    },
    {
      path: 'lboOverrides.minimumCash',
      field: 'minimumCashBalance',
      value: QUICK_LBO_AUTO_DEFAULTS.minimumCashBalance,
      reason: 'Quick LBO default',
      source: 'system',
    },
  ];

  const workbookNotes = [
    'Quick LBO (Demo assumptions) mode enabled.',
    'Auto-filled defaults: Transaction fees 1.5%, Exit fees 1.0%, Amortization 5.0%, Cash sweep 100%, EBITDA margin 25.0%, Capex 4.0%, ΔNWC 2.0%, Tax rate 25.0%.',
  ];

  return {
    quickInputs,
    lboOverrides,
    lboDealAssumptions,
    appliedDefaults,
    workbookNotes,
  };
}

export function assessDemoLboReadiness(ltmFinancials: any): {
  ready: boolean;
  revenue: number | null;
  ebitda: number | null;
} {
  const revenue = isFiniteNumber(ltmFinancials?.revenue) ? ltmFinancials.revenue : null;
  const ebitda = isFiniteNumber(ltmFinancials?.ebitda) ? ltmFinancials.ebitda : null;
  return {
    ready: revenue !== null && revenue > 0 && ebitda !== null && ebitda > 0,
    revenue,
    ebitda,
  };
}
