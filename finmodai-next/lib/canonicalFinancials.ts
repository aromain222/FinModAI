import { detectUnit, ensureMillions } from './unitConversion';

export type CanonicalMetricKey =
  | 'revenue'
  | 'ebitda'
  | 'netIncome'
  | 'da'
  | 'capex'
  | 'deltaNwc'
  | 'cash'
  | 'totalDebt'
  | 'netDebt'
  | 'sharesOutstanding'
  | 'marketCap'
  | 'price';

export type MetricSource = 'user_override' | 'api' | 'derived' | 'missing';

export type CanonicalMetric = {
  value: number | null;
  source: MetricSource;
  updatedAt?: string;
};

export type CanonicalFinancials = {
  values: Record<CanonicalMetricKey, CanonicalMetric>;
  overrides: Array<{ key: CanonicalMetricKey; value: number; source: MetricSource }>;
  warnings: string[];
};

type BuildCanonicalParams = {
  requestBody?: any;
  normalizedFinancials?: Record<string, any> | null;
  ltmFinancials?: Record<string, any> | null;
  assumptions?: Record<string, any> | null;
  lastUpdated?: string;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toMillions = (value: number | null): number | null => {
  if (value === null) return null;
  const unit = detectUnit(value);
  return ensureMillions(value, unit);
};

const pickFirst = (
  values: Array<unknown>,
  opts?: { requireNonZero?: boolean }
): number | null => {
  for (const value of values) {
    const num = toFiniteNumber(value);
    if (num === null) continue;
    if (opts?.requireNonZero && num === 0) continue;
    return num;
  }
  return null;
};

export function buildCanonicalFinancials(params: BuildCanonicalParams): CanonicalFinancials {
  const { requestBody, normalizedFinancials, ltmFinancials, assumptions, lastUpdated } = params;
  const warnings: string[] = [];
  const overrides: CanonicalFinancials['overrides'] = [];

  const userOverrideContainer =
    requestBody?.canonicalOverrides ||
    requestBody?.manualInputs ||
    requestBody?.overrides ||
    assumptions?.manualInputs ||
    {};

  const readOverride = (keys: string[], opts?: { requireNonZero?: boolean }): number | null => {
    return pickFirst(
      keys.map(key => userOverrideContainer?.[key] ?? requestBody?.[key]).filter(v => v !== undefined),
      opts
    );
  };

  const readApiValue = (keys: string[], opts?: { requireNonZero?: boolean }): number | null => {
    return pickFirst(
      keys.map(key => normalizedFinancials?.[key] ?? ltmFinancials?.[key]).filter(v => v !== undefined),
      opts
    );
  };

  const buildMetric = (
    key: CanonicalMetricKey,
    overrideKeys: string[],
    apiKeys: string[],
    toMillionsFlag: boolean,
    opts?: { requireNonZero?: boolean }
  ): CanonicalMetric => {
    const overrideValue = readOverride(overrideKeys, opts);
    if (overrideValue !== null) {
      const value = toMillionsFlag ? toMillions(overrideValue) : overrideValue;
      overrides.push({ key, value: value ?? overrideValue, source: 'user_override' });
      return { value: value ?? overrideValue, source: 'user_override', updatedAt: lastUpdated };
    }

    const apiValue = readApiValue(apiKeys, opts);
    if (apiValue !== null) {
      const value = toMillionsFlag ? toMillions(apiValue) : apiValue;
      return { value, source: 'api', updatedAt: lastUpdated };
    }

    return { value: null, source: 'missing', updatedAt: lastUpdated };
  };

  const values: CanonicalFinancials['values'] = {
    revenue: buildMetric('revenue', ['revenue', 'revenueLTM', 'revenue_ltm'], ['revenueM', 'revenue', 'revenueLTM'], true, { requireNonZero: true }),
    ebitda: buildMetric('ebitda', ['ebitda', 'ebitdaLTM', 'ebitda_ltm'], ['ebitdaM', 'ebitda', 'ebitdaLTM'], true),
    netIncome: buildMetric('netIncome', ['netIncome', 'net_income', 'netIncomeLTM'], ['netIncomeM', 'netIncome', 'netIncomeLTM'], true),
    da: buildMetric('da', ['da', 'depreciation', 'depreciationAmortization'], ['daM', 'depreciation', 'depreciationM'], true),
    capex: buildMetric('capex', ['capex'], ['capexM', 'capex', 'capitalExpenditure'], true),
    deltaNwc: buildMetric('deltaNwc', ['deltaNwc', 'changeInNwc', 'nwcChange'], ['deltaNwcM', 'deltaNwc', 'nwcChange'], true),
    cash: buildMetric('cash', ['cash', 'cashAndEquivalents'], ['cashM', 'cash', 'cashAndEquivalents'], true),
    totalDebt: buildMetric('totalDebt', ['totalDebt', 'debt'], ['totalDebtM', 'totalDebt', 'debt'], true),
    netDebt: buildMetric('netDebt', ['netDebt'], ['netDebtM', 'netDebt'], true),
    sharesOutstanding: buildMetric('sharesOutstanding', ['sharesOutstanding', 'shares_outstanding'], ['sharesOutstandingM', 'sharesOutstanding', 'shares'], false, { requireNonZero: true }),
    marketCap: buildMetric('marketCap', ['marketCap', 'market_cap'], ['marketCap', 'marketCapM', 'mktCap'], true, { requireNonZero: true }),
    price: buildMetric('price', ['price', 'sharePrice'], ['price', 'currentPrice', 'lastPrice'], false, { requireNonZero: true }),
  };

  if (values.netDebt.value === null && values.totalDebt.value !== null && values.cash.value !== null) {
    values.netDebt = {
      value: values.totalDebt.value - values.cash.value,
      source: 'derived',
      updatedAt: lastUpdated,
    };
    warnings.push('Net debt derived from total debt and cash.');
  }
  if (values.netDebt.value !== null && values.totalDebt.value !== null && values.cash.value !== null) {
    const derivedNetDebt = values.totalDebt.value - values.cash.value;
    const delta = Math.abs(derivedNetDebt - values.netDebt.value);
    const tolerance = Math.max(1, Math.abs(derivedNetDebt) * 0.01);
    if (delta > tolerance) {
      values.netDebt = {
        value: derivedNetDebt,
        source: 'derived',
        updatedAt: lastUpdated,
      };
      warnings.push('Net debt recalculated from total debt and cash due to mismatch.');
    }
  }

  if (values.marketCap.value === null && values.price.value !== null && values.sharesOutstanding.value !== null) {
    values.marketCap = {
      value: (values.price.value * values.sharesOutstanding.value) / 1_000_000,
      source: 'derived',
      updatedAt: lastUpdated,
    };
    warnings.push('Market cap derived from price × shares outstanding.');
  }

  if (values.sharesOutstanding.value === null && values.marketCap.value !== null && values.price.value !== null) {
    values.sharesOutstanding = {
      value: (values.marketCap.value * 1_000_000) / values.price.value,
      source: 'derived',
      updatedAt: lastUpdated,
    };
    warnings.push('Shares outstanding derived from market cap ÷ price.');
  }

  return { values, overrides, warnings };
}
