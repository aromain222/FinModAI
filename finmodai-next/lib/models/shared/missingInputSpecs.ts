export type MissingInputType = 'number' | 'percent' | 'text' | 'select';

// Defines the numeric scale the backend expects for a field.
// "raw" means 1 == $1.0. Others are scaling conveniences.
export type MissingInputScale = 'raw' | 'thousands' | 'millions' | 'billions';

export type MissingInputSpec = {
  key: string;
  label: string;
  type: MissingInputType;
  unit?: string;
  scale?: MissingInputScale;
  hint?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: number | string;
};

const COMMON_SPECS: Record<string, MissingInputSpec> = {
  price: { key: 'price', label: 'Price', type: 'number', unit: 'USD', scale: 'raw', hint: 'Per share' },
  market_cap: { key: 'market_cap', label: 'Market Cap', type: 'number', unit: 'USD', scale: 'raw' },
  marketCap: { key: 'marketCap', label: 'Market Cap', type: 'number', unit: 'USD', scale: 'raw' },
  revenue: { key: 'revenue', label: 'Revenue (LTM)', type: 'number', unit: 'USD', scale: 'raw' },
  ebitda: { key: 'ebitda', label: 'EBITDA (LTM)', type: 'number', unit: 'USD', scale: 'raw' },
  ebit: { key: 'ebit', label: 'EBIT (LTM)', type: 'number', unit: 'USD', scale: 'raw' },
  net_income: { key: 'net_income', label: 'Net Income (LTM)', type: 'number', unit: 'USD', scale: 'raw' },
  netIncome: { key: 'netIncome', label: 'Net Income (LTM)', type: 'number', unit: 'USD', scale: 'raw' },
  cash: { key: 'cash', label: 'Cash', type: 'number', unit: 'USD', scale: 'raw' },
  total_debt: { key: 'total_debt', label: 'Total Debt', type: 'number', unit: 'USD', scale: 'raw' },
  net_debt: { key: 'net_debt', label: 'Net Debt', type: 'number', unit: 'USD', scale: 'raw' },
  shares_out_basic: { key: 'shares_out_basic', label: 'Shares Outstanding', type: 'number', unit: 'Shares', scale: 'raw' },
  rf_rate: { key: 'rf_rate', label: 'Risk-Free Rate', type: 'percent', unit: '%' },
  equity_risk_premium: { key: 'equity_risk_premium', label: 'Equity Risk Premium', type: 'percent', unit: '%' },
  beta: { key: 'beta', label: 'Beta', type: 'number' },
  cost_of_debt: { key: 'cost_of_debt', label: 'Cost of Debt', type: 'percent', unit: '%' },
  tax_rate_assumption: { key: 'tax_rate_assumption', label: 'Tax Rate', type: 'percent', unit: '%', defaultValue: 0.21 },
  terminal_growth: { key: 'terminal_growth', label: 'Terminal Growth', type: 'percent', unit: '%' },
  exit_multiple: { key: 'exit_multiple', label: 'Exit Multiple', type: 'number' },
  enterprise_value: { key: 'enterprise_value', label: 'Enterprise Value', type: 'number', unit: 'USD', scale: 'raw' },
  leverage_multiple: { key: 'leverage_multiple', label: 'Leverage Multiple', type: 'number' },
  debt_rate: { key: 'debt_rate', label: 'Debt Rate', type: 'percent', unit: '%' },
  holding_period_years: { key: 'holding_period_years', label: 'Holding Period (Years)', type: 'number' },
  entry_multiple: { key: 'entry_multiple', label: 'Entry Multiple (EV/EBITDA)', type: 'number' },
  transaction_fees_percent: { key: 'transaction_fees_percent', label: 'Transaction Fees', type: 'percent', unit: '%' },
  exit_fees_percent: { key: 'exit_fees_percent', label: 'Exit Fees', type: 'percent', unit: '%' },
  debt_percent: { key: 'debt_percent', label: 'Debt %', type: 'percent', unit: '%' },
  equity_percent: { key: 'equity_percent', label: 'Equity %', type: 'percent', unit: '%' },
  interest_rate: { key: 'interest_rate', label: 'Interest Rate', type: 'percent', unit: '%' },
  amortization_percent: { key: 'amortization_percent', label: 'Mandatory Amortization', type: 'percent', unit: '%' },
  cash_sweep_percent: { key: 'cash_sweep_percent', label: 'Cash Sweep', type: 'percent', unit: '%' },
  revenue_growth: { key: 'revenue_growth', label: 'Revenue Growth', type: 'percent', unit: '%' },
  ebitda_margin: { key: 'ebitda_margin', label: 'EBITDA Margin', type: 'percent', unit: '%' },
  capex_pct_revenue: { key: 'capex_pct_revenue', label: 'Capex % of Revenue', type: 'percent', unit: '%' },
  delta_nwc_pct_revenue: { key: 'delta_nwc_pct_revenue', label: 'ΔNWC % of Revenue', type: 'percent', unit: '%' },
  tax_rate: { key: 'tax_rate', label: 'Tax Rate', type: 'percent', unit: '%' },
  minimum_cash_balance: { key: 'minimum_cash_balance', label: 'Minimum Cash Balance', type: 'number', unit: 'USD', scale: 'raw' },
  customPeers: { key: 'customPeers', label: 'Peer tickers', type: 'text', unit: 'tickers', hint: 'Comma-separated (e.g., SQ, PYPL, AFRM, UPST, HOOD).' },
};

function humanize(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function buildMissingInputSpecs(modelType: string, missingKeys: string[]): MissingInputSpec[] {
  return missingKeys.map((key) => {
    if (COMMON_SPECS[key]) return COMMON_SPECS[key];
    // Heuristic defaults for unknown keys to keep unit/scale explicit.
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
      };
    }
    if (normalized.includes('shares')) {
      return {
        key,
        label: humanize(key),
        type: 'number',
        unit: 'Shares',
        scale: 'raw',
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
      };
    }
    // Allow model-specific overrides in the future.
    return {
      key,
      label: humanize(key),
      type: 'number',
    };
  });
}
