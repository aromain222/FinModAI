export type MissingInputType = 'number' | 'percent' | 'text' | 'select';

// Defines the numeric scale the backend expects for a field.
// "raw" means 1 == $1.0. Others are scaling conveniences.
export type MissingInputScale = 'raw' | 'thousands' | 'millions' | 'billions';

export type MissingInputRequirement = 'required' | 'conditional' | 'export-only';

export type MissingInputSpec = {
  key: string;
  label: string;
  type: MissingInputType;
  unit?: string;
  scale?: MissingInputScale;
  hint?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: number | string;
  requirement?: MissingInputRequirement;
  alternates?: string[];
  group?: string;
};

const KEY_ALIASES: Record<string, string> = {
  marketCap: 'market_cap',
  market_cap: 'market_cap',
  price: 'price',
  sharePrice: 'sharePrice',
  share_price: 'sharePrice',
  targetPrice: 'targetPrice',
  target_price: 'targetPrice',
  projectionYears: 'projectionYears',
  projection_years: 'projectionYears',
  netIncome: 'net_income',
  net_income: 'net_income',
  totalDebt: 'total_debt',
  total_debt: 'total_debt',
  netDebt: 'net_debt',
  net_debt: 'net_debt',
  sharesOutstanding: 'shares_out_basic',
  shares_out_basic: 'shares_out_basic',
  rf_rate: 'rf_rate',
  equity_risk_premium: 'equity_risk_premium',
  cost_of_debt: 'cost_of_debt',
  tax_rate_assumption: 'tax_rate_assumption',
  terminal_growth: 'terminal_growth',
  exit_multiple: 'exit_multiple',
  leverage_multiple: 'leverage_multiple',
  debt_rate: 'debt_rate',
  holding_period_years: 'holding_period_years',
  entry_multiple: 'entry_multiple',
  transaction_fees_percent: 'transaction_fees_percent',
  exit_fees_percent: 'exit_fees_percent',
  debt_percent: 'debt_percent',
  equity_percent: 'equity_percent',
  interest_rate: 'interest_rate',
  interestRatePct: 'interestRatePct',
  interest_rate_pct: 'interestRatePct',
  minInterestCoverage: 'minInterestCoverage',
  min_interest_coverage: 'minInterestCoverage',
  maxLeverage: 'maxLeverage',
  max_leverage: 'maxLeverage',
  amortization_percent: 'amortization_percent',
  cash_sweep_percent: 'cash_sweep_percent',
  revenue_growth: 'revenue_growth',
  revenueGrowth: 'revenue_growth',
  ebitda_margin: 'ebitda_margin',
  ebitdaMargin: 'ebitda_margin',
  ebit_margin: 'ebit_margin',
  ebitMargin: 'ebit_margin',
  capex_pct_revenue: 'capex_pct_revenue',
  capexPctRevenue: 'capex_pct_revenue',
  nwc_pct_revenue: 'delta_nwc_pct_revenue',
  delta_nwc_pct_revenue: 'delta_nwc_pct_revenue',
  deltaNwcPctRevenue: 'delta_nwc_pct_revenue',
  tax_rate: 'tax_rate',
  taxRate: 'tax_rate',
  minimum_cash_balance: 'minimum_cash_balance',
  minimumCashBalance: 'minimum_cash_balance',
  customPeers: 'customPeers',
  custom_peers: 'customPeers',
  companyName: 'companyName',
  company_name: 'companyName',
  grossProfit: 'gross_profit',
  gross_profit: 'gross_profit',
  operatingIncome: 'operating_income',
  operating_income: 'operating_income',
  daPctRevenue: 'da_pct_revenue',
  da_pct_revenue: 'da_pct_revenue',
  ticker: 'ticker',
};

export function normalizeMissingInputKey(key: string): string {
  if (!key) return key;
  return KEY_ALIASES[key] || key;
}

export function normalizeMissingInputKeys(keys: string[]): string[] {
  const normalized = keys
    .map((key) => normalizeMissingInputKey(key))
    .filter((key) => key && key.trim().length > 0);
  return [...new Set(normalized)];
}

const COMMON_SPECS: Record<string, MissingInputSpec> = {
  ticker: {
    key: 'ticker',
    label: 'Ticker',
    type: 'text',
    hint: 'Public-company models require a valid ticker or a synced catalog company.',
    requirement: 'required',
  },
  companyName: {
    key: 'companyName',
    label: 'Company Name',
    type: 'text',
    hint: 'Required when the subject company is not already resolved from the catalog.',
    requirement: 'required',
  },
  targetPrice: {
    key: 'targetPrice',
    label: 'Target Price',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'Use target price, market cap, or share price plus shares outstanding as the valuation anchor.',
    requirement: 'conditional',
    alternates: ['market_cap', 'sharePrice', 'shares_out_basic'],
    group: 'valuation_anchor',
  },
  market_cap: {
    key: 'market_cap',
    label: 'Market Cap',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'Alternative to target price for reverse DCF and price-anchored models.',
    requirement: 'conditional',
    alternates: ['targetPrice', 'sharePrice', 'shares_out_basic'],
    group: 'valuation_anchor',
  },
  sharePrice: {
    key: 'sharePrice',
    label: 'Share Price',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'If you use share price as the anchor, also provide shares outstanding.',
    requirement: 'conditional',
    alternates: ['targetPrice', 'market_cap'],
    group: 'valuation_anchor',
  },
  price: {
    key: 'price',
    label: 'Current Share Price',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'Used for price-to-value comparisons and football-field framing.',
    requirement: 'required',
  },
  marketCap: {
    key: 'market_cap',
    label: 'Market Cap',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  revenue: {
    key: 'revenue',
    label: 'Revenue (LTM)',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'Use the latest LTM or annualized run-rate revenue that the workbook should anchor to.',
    requirement: 'required',
  },
  gross_profit: {
    key: 'gross_profit',
    label: 'Gross Profit (LTM)',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'Needed for three-statement margin and cost build-outs.',
    requirement: 'required',
  },
  operating_income: {
    key: 'operating_income',
    label: 'Operating Income (LTM)',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    hint: 'Use EBIT / operating income before interest and taxes.',
    requirement: 'required',
  },
  ebitda: {
    key: 'ebitda',
    label: 'EBITDA (LTM)',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  ebit: {
    key: 'ebit',
    label: 'EBIT (LTM)',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  net_income: {
    key: 'net_income',
    label: 'Net Income (LTM)',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  cash: {
    key: 'cash',
    label: 'Cash',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  total_debt: {
    key: 'total_debt',
    label: 'Total Debt',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  net_debt: {
    key: 'net_debt',
    label: 'Net Debt',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  shares_out_basic: {
    key: 'shares_out_basic',
    label: 'Shares Outstanding',
    type: 'number',
    unit: 'Shares',
    scale: 'raw',
    requirement: 'required',
  },
  rf_rate: {
    key: 'rf_rate',
    label: 'Risk-Free Rate',
    type: 'percent',
    unit: '%',
    requirement: 'export-only',
  },
  equity_risk_premium: {
    key: 'equity_risk_premium',
    label: 'Equity Risk Premium',
    type: 'percent',
    unit: '%',
    requirement: 'export-only',
  },
  beta: {
    key: 'beta',
    label: 'Beta',
    type: 'number',
    requirement: 'export-only',
  },
  cost_of_debt: {
    key: 'cost_of_debt',
    label: 'Cost of Debt',
    type: 'percent',
    unit: '%',
    requirement: 'export-only',
  },
  tax_rate_assumption: {
    key: 'tax_rate_assumption',
    label: 'Tax Rate',
    type: 'percent',
    unit: '%',
    defaultValue: 0.21,
    requirement: 'required',
  },
  tax_rate: {
    key: 'tax_rate',
    label: 'Tax Rate',
    type: 'percent',
    unit: '%',
    defaultValue: 0.21,
    requirement: 'required',
  },
  wacc: {
    key: 'wacc',
    label: 'WACC',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  terminal_growth: {
    key: 'terminal_growth',
    label: 'Terminal Growth',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  projectionYears: {
    key: 'projectionYears',
    label: 'Projection Years',
    type: 'number',
    requirement: 'required',
  },
  exit_multiple: {
    key: 'exit_multiple',
    label: 'Exit Multiple',
    type: 'number',
    requirement: 'required',
  },
  enterprise_value: {
    key: 'enterprise_value',
    label: 'Enterprise Value',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'export-only',
  },
  leverage_multiple: {
    key: 'leverage_multiple',
    label: 'Leverage Multiple',
    type: 'number',
    requirement: 'required',
  },
  debt_rate: {
    key: 'debt_rate',
    label: 'Debt Rate',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  holding_period_years: {
    key: 'holding_period_years',
    label: 'Holding Period (Years)',
    type: 'number',
    requirement: 'required',
  },
  entry_multiple: {
    key: 'entry_multiple',
    label: 'Entry Multiple (EV/EBITDA)',
    type: 'number',
    requirement: 'required',
  },
  transaction_fees_percent: {
    key: 'transaction_fees_percent',
    label: 'Transaction Fees',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  exit_fees_percent: {
    key: 'exit_fees_percent',
    label: 'Exit Fees',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  debt_percent: {
    key: 'debt_percent',
    label: 'Debt %',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  equity_percent: {
    key: 'equity_percent',
    label: 'Equity %',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  interest_rate: {
    key: 'interest_rate',
    label: 'Interest Rate',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  interestRatePct: {
    key: 'interestRatePct',
    label: 'Interest Rate',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  maxLeverage: {
    key: 'maxLeverage',
    label: 'Max Leverage',
    type: 'number',
    hint: 'Maximum net leverage threshold in turns.',
    requirement: 'required',
  },
  minInterestCoverage: {
    key: 'minInterestCoverage',
    label: 'Minimum Interest Coverage',
    type: 'number',
    hint: 'Minimum EBITDA / cash interest threshold in turns.',
    requirement: 'required',
  },
  amortization_percent: {
    key: 'amortization_percent',
    label: 'Mandatory Amortization',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  cash_sweep_percent: {
    key: 'cash_sweep_percent',
    label: 'Cash Sweep',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  revenue_growth: {
    key: 'revenue_growth',
    label: 'Revenue Growth',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  ebitda_margin: {
    key: 'ebitda_margin',
    label: 'EBITDA Margin',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  ebit_margin: {
    key: 'ebit_margin',
    label: 'EBIT Margin',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  da_pct_revenue: {
    key: 'da_pct_revenue',
    label: 'D&A % of Revenue',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  capex_pct_revenue: {
    key: 'capex_pct_revenue',
    label: 'Capex % of Revenue',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  delta_nwc_pct_revenue: {
    key: 'delta_nwc_pct_revenue',
    label: 'ΔNWC % of Revenue',
    type: 'percent',
    unit: '%',
    requirement: 'required',
  },
  minimum_cash_balance: {
    key: 'minimum_cash_balance',
    label: 'Minimum Cash Balance',
    type: 'number',
    unit: 'USD',
    scale: 'raw',
    requirement: 'required',
  },
  customPeers: {
    key: 'customPeers',
    label: 'Peer Tickers',
    type: 'text',
    unit: 'tickers',
    hint: 'Comma-separated tickers (e.g., SQ, PYPL, AFRM, UPST, HOOD).',
    requirement: 'required',
  },
};

const MODEL_REQUIREMENTS: Record<string, string[]> = {
  dcf: [
    'revenue',
    'ebitda',
    'tax_rate_assumption',
    'capex_pct_revenue',
    'delta_nwc_pct_revenue',
    'wacc',
    'terminal_growth',
    'net_debt',
    'shares_out_basic',
  ],
  'reverse-dcf': [
    'targetPrice',
    'market_cap',
    'sharePrice',
    'shares_out_basic',
    'revenue',
    'ebitda_margin',
    'tax_rate_assumption',
    'capex_pct_revenue',
    'delta_nwc_pct_revenue',
    'wacc',
    'terminal_growth',
    'projectionYears',
  ],
  'three-statement': [
    'revenue',
    'gross_profit',
    'ebitda',
    'net_income',
    'cash',
    'total_debt',
    'capex_pct_revenue',
    'delta_nwc_pct_revenue',
    'tax_rate_assumption',
  ],
  lbo: [
    'revenue',
    'ebitda',
    'entry_multiple',
    'exit_multiple',
    'transaction_fees_percent',
    'exit_fees_percent',
    'debt_percent',
    'equity_percent',
    'interest_rate',
    'amortization_percent',
    'cash_sweep_percent',
    'revenue_growth',
    'ebitda_margin',
    'capex_pct_revenue',
    'delta_nwc_pct_revenue',
    'tax_rate',
    'holding_period_years',
    'minimum_cash_balance',
  ],
  comps: ['revenue', 'ebitda', 'net_income', 'market_cap', 'shares_out_basic', 'customPeers'],
  'football-field': ['revenue', 'ebitda', 'net_debt', 'shares_out_basic', 'price'],
  precedents: ['companyName', 'revenue', 'ebitda'],
  'debt-capacity-lite': ['revenue', 'ebitda', 'cash', 'total_debt', 'maxLeverage', 'minInterestCoverage', 'interestRatePct'],
  scorecard: ['revenue', 'ebitda', 'net_income', 'cash', 'total_debt'],
};

function orderModelKeys(modelType: string, keys: string[]): string[] {
  const normalizedModelType = String(modelType || '').toLowerCase();
  const preferredOrder = getModelRequiredInputKeys(normalizedModelType);
  const rank = new Map(preferredOrder.map((key, index) => [normalizeMissingInputKey(key), index] as const));
  return [...keys].sort((left, right) => {
    const leftRank = rank.get(normalizeMissingInputKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(normalizeMissingInputKey(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

function expandGroupedMissingKeys(modelType: string, missingKeys: string[]): string[] {
  const normalizedMissingKeys = normalizeMissingInputKeys(missingKeys);
  const groupSpecs = getModelRequiredInputSpecs(modelType).filter((spec) => spec.group);
  const groupMap = new Map<string, string[]>();

  groupSpecs.forEach((spec) => {
    const groupKey = spec.group!;
    const keys = groupMap.get(groupKey) || [];
    keys.push(spec.key);
    groupMap.set(groupKey, keys);
  });

  const expanded = new Set(normalizedMissingKeys);
  normalizedMissingKeys.forEach((key) => {
    const spec = COMMON_SPECS[key];
    const groupKey = spec?.group;
    if (!groupKey) return;
    for (const groupedKey of groupMap.get(groupKey) || []) {
      expanded.add(groupedKey);
    }
  });

  return orderModelKeys(modelType, [...expanded]);
}

function humanize(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildHeuristicSpec(key: string): MissingInputSpec {
  const normalized = key.toLowerCase();
  const isPercent =
    normalized.includes('percent') ||
    normalized.includes('pct') ||
    normalized.includes('margin') ||
    normalized.includes('growth') ||
    normalized.includes('rate');
  if (isPercent) {
    return {
      key,
      label: humanize(key),
      type: 'percent',
      unit: '%',
      requirement: 'required',
    };
  }
  if (normalized.includes('shares')) {
    return {
      key,
      label: humanize(key),
      type: 'number',
      unit: 'Shares',
      scale: 'raw',
      requirement: 'required',
    };
  }
  const isMoney =
    normalized.includes('debt') ||
    normalized.includes('cash') ||
    normalized.includes('revenue') ||
    normalized.includes('ebit') ||
    normalized.includes('income') ||
    normalized.includes('market') ||
    normalized.includes('price') ||
    normalized.includes('equity') ||
    normalized.includes('enterprise') ||
    normalized.includes('capex') ||
    normalized.includes('fcf') ||
    normalized.includes('nwc');
  if (isMoney) {
    return {
      key,
      label: humanize(key),
      type: 'number',
      unit: 'USD',
      scale: 'raw',
      requirement: 'required',
    };
  }
  return {
    key,
    label: humanize(key),
    type: 'number',
    requirement: 'required',
  };
}

export function getModelRequiredInputKeys(modelType: string): string[] {
  const normalizedModelType = String(modelType || '').toLowerCase();
  return MODEL_REQUIREMENTS[normalizedModelType] || ['revenue'];
}

export function getModelRequiredInputSpecs(modelType: string): MissingInputSpec[] {
  return getModelRequiredInputKeys(modelType).map((key) => {
    const normalizedKey = normalizeMissingInputKey(key);
    return COMMON_SPECS[normalizedKey] || buildHeuristicSpec(normalizedKey);
  });
}

export function buildMissingInputSpecs(modelType: string, missingKeys: string[]): MissingInputSpec[] {
  const normalizedMissingKeys = expandGroupedMissingKeys(modelType, missingKeys);
  const modelSpecMap = new Map(
    getModelRequiredInputSpecs(modelType).map((spec) => [spec.key, spec] as const)
  );

  return normalizedMissingKeys.map((key) => {
    const normalizedKey = normalizeMissingInputKey(key);
    return modelSpecMap.get(normalizedKey) || COMMON_SPECS[normalizedKey] || buildHeuristicSpec(normalizedKey);
  });
}
