/**
 * Auto-Estimate Required Inputs
 * 
 * Provides sensible defaults for finance constants so models become computable by default
 */

export interface EstimatedInput {
  key: string;
  value: number;
  source: string; // e.g., "Latest 10Y Treasury", "Sector median", "Historical effective"
  confidence: 'low' | 'medium' | 'high';
  label: string; // User-facing label
  unit?: string; // e.g., "%", "x"
}

/**
 * Auto-estimate Risk-Free Rate
 * Default: Latest 10Y Treasury yield
 */
export async function estimateRiskFreeRate(): Promise<EstimatedInput> {
  const { isDemoMode } = await import('@/lib/demo/isDemoMode');
  if (isDemoMode()) {
    return {
      key: 'rf_rate',
      value: 0.045,
      source: 'Demo default (4.5%)',
      confidence: 'medium',
      label: 'Risk-Free Rate',
      unit: '%',
    };
  }
  try {
    // Try to fetch latest 10Y Treasury yield from FRED
    const fredKey = process.env.FRED_API_KEY;
    if (fredKey) {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const latest = data.observations?.[0]?.value;
        if (latest && !isNaN(parseFloat(latest))) {
          return {
            key: 'rf_rate',
            value: parseFloat(latest) / 100, // Convert to decimal
            source: 'Latest 10Y Treasury (FRED)',
            confidence: 'high',
            label: 'Risk-Free Rate',
            unit: '%',
          };
        }
      }
    }
  } catch (error) {
    console.warn('[autoEstimates] Failed to fetch 10Y Treasury, using default');
  }

  // Fallback: Use current market default (4.5%)
  return {
    key: 'rf_rate',
    value: 0.045,
    source: 'Market default (4.5%)',
    confidence: 'medium',
    label: 'Risk-Free Rate',
    unit: '%',
  };
}

/**
 * Auto-estimate Equity Risk Premium
 * Default: Fixed default (5.0-5.5%)
 */
export function estimateERP(): EstimatedInput {
  return {
    key: 'equity_risk_premium',
    value: 0.0525, // 5.25% (midpoint of 5.0-5.5%)
    source: 'Fixed default (5.25%)',
    confidence: 'medium',
    label: 'Equity Risk Premium',
    unit: '%',
  };
}

/**
 * Auto-estimate Beta
 * Default: Sector median or regression-based
 */
export async function estimateBeta(
  ticker: string,
  sector?: string
): Promise<EstimatedInput> {
  // Try to fetch beta from market data
  try {
    const { fetchTickerSnapshot } = await import('@/lib/tickerDataService');
    const snapshot = await fetchTickerSnapshot(ticker);
    if (snapshot.beta && snapshot.beta > 0) {
      return {
        key: 'beta',
        value: snapshot.beta,
        source: 'Market data (reported)',
        confidence: 'high',
        label: 'Beta',
        unit: 'x',
      };
    }
  } catch (error) {
    console.warn('[autoEstimates] Failed to fetch beta, using sector default');
  }

  // Sector-based defaults
  const sectorBetas: Record<string, number> = {
    Technology: 1.2,
    Financials: 1.1,
    Healthcare: 0.9,
    Consumer: 1.0,
    Industrials: 1.1,
    Energy: 1.3,
    Materials: 1.2,
    Utilities: 0.7,
    RealEstate: 0.8,
    Communication: 1.0,
  };

  const sectorBeta = sector ? sectorBetas[sector] || 1.0 : 1.0;

  return {
    key: 'beta',
    value: sectorBeta,
    source: sector ? `Sector median (${sector})` : 'Market default (1.0)',
    confidence: sector ? 'medium' : 'low',
    label: 'Beta',
    unit: 'x',
  };
}

/**
 * Auto-estimate Cost of Debt
 * Default: Interest expense ÷ avg debt (if available)
 */
export async function estimateCostOfDebt(
  interestExpense?: number | null,
  avgDebt?: number | null
): Promise<EstimatedInput> {
  if (interestExpense && avgDebt && avgDebt > 0) {
    const rate = interestExpense / avgDebt;
    if (rate > 0 && rate < 0.25) {
      // Sanity check: cost of debt should be 0-25%
      return {
        key: 'cost_of_debt',
        value: rate,
        source: 'Interest expense ÷ avg debt (historical)',
        confidence: 'high',
        label: 'Cost of Debt',
        unit: '%',
      };
    }
  }

  // Fallback: Market default (6.5%)
  return {
    key: 'cost_of_debt',
    value: 0.065,
    source: 'Market default (6.5%)',
    confidence: 'medium',
    label: 'Cost of Debt',
    unit: '%',
  };
}

/**
 * Auto-estimate Tax Rate
 * Default: Effective tax rate from historical (if available)
 */
export async function estimateTaxRate(
  taxExpense?: number | null,
  preTaxIncome?: number | null
): Promise<EstimatedInput> {
  if (taxExpense && preTaxIncome && preTaxIncome > 0) {
    const rate = taxExpense / preTaxIncome;
    if (rate >= 0 && rate <= 0.4) {
      // Sanity check: tax rate should be 0-40%
      return {
        key: 'tax_rate_assumption',
        value: rate,
        source: 'Effective tax rate (historical)',
        confidence: 'high',
        label: 'Tax Rate',
        unit: '%',
      };
    }
  }

  // Fallback: Statutory default (25%)
  return {
    key: 'tax_rate_assumption',
    value: 0.25,
    source: 'Statutory default (25%)',
    confidence: 'medium',
    label: 'Tax Rate',
    unit: '%',
  };
}

/**
 * Auto-estimate all required DCF inputs
 */
export async function estimateDCFInputs(
  ticker: string,
  sector?: string,
  financials?: {
    interestExpense?: number | null;
    avgDebt?: number | null;
    taxExpense?: number | null;
    preTaxIncome?: number | null;
  }
): Promise<EstimatedInput[]> {
  const estimates = await Promise.all([
    estimateRiskFreeRate(),
    Promise.resolve(estimateERP()),
    estimateBeta(ticker, sector),
    estimateCostOfDebt(financials?.interestExpense, financials?.avgDebt),
    estimateTaxRate(financials?.taxExpense, financials?.preTaxIncome),
  ]);

  return estimates;
}

/**
 * Apply auto-estimates to model inputs
 */
export function applyAutoEstimates(
  inputs: Record<string, any>,
  estimates: EstimatedInput[]
): {
  updated: Record<string, any>;
  applied: EstimatedInput[];
} {
  const updated = { ...inputs };
  const applied: EstimatedInput[] = [];

  for (const estimate of estimates) {
    // Only apply if input is missing or null
    if (updated[estimate.key] === null || updated[estimate.key] === undefined) {
      updated[estimate.key] = estimate.value;
      applied.push(estimate);
    }
  }

  return { updated, applied };
}
