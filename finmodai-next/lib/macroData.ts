/**
 * Macro Data System for CapitalBase
 * 
 * Provides macro indicators, risk scoring, and time series data
 * for the Macro Dashboard.
 */

export interface MacroIndicator {
  name: string;
  ticker: string;
  value: number;
  unit: string;
  change1d: number;
  change1w: number;
  timeSeries: TimeSeriesPoint[];
  category: 'rates' | 'inflation' | 'equity' | 'volatility' | 'employment';
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface MacroSnapshot {
  timestamp: string;
  indicators: {
    fedFunds: MacroIndicator;
    cpi: MacroIndicator;
    treasury10y: MacroIndicator;
    unemployment: MacroIndicator;
    sp500: MacroIndicator;
    vix: MacroIndicator;
  };
  riskScore: number; // 0-100
  riskRegime: 'risk-on' | 'mixed' | 'risk-off';
}

/**
 * Get number of data points for a time range
 */
function getPointsForRange(range: string): number {
  switch (range) {
    case '1W': return 7;
    case '1M': return 30;
    case '3M': return 90;
    case '1Y': return 252; // Trading days
    case '5Y': return 1260; // Trading days
    case 'MAX': return 2520; // ~10 years
    default: return 30;
  }
}

/**
 * Generate mock time series data
 */
function generateTimeSeries(
  baseValue: number,
  volatility: number,
  trend: number,
  points: number = 30
): TimeSeriesPoint[] {
  const series: TimeSeriesPoint[] = [];
  const today = new Date();
  let value = baseValue;

  for (let i = points - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Add trend and random walk
    value = value + trend + (Math.random() - 0.5) * volatility;
    
    series.push({
      date: date.toISOString().split('T')[0],
      value: parseFloat(value.toFixed(2)),
    });
  }

  return series;
}

/**
 * Calculate risk score (0-100) based on macro indicators
 */
function calculateRiskScore(indicators: MacroSnapshot['indicators']): number {
  let score = 0;

  // VIX contribution (0-40 points)
  // VIX > 30 = high risk
  const vixScore = Math.min((indicators.vix.value / 30) * 40, 40);
  score += vixScore;

  // Fed Funds contribution (0-20 points)
  // Higher rates = higher risk
  const fedScore = Math.min((indicators.fedFunds.value / 6) * 20, 20);
  score += fedScore;

  // Unemployment contribution (0-20 points)
  // Higher unemployment = higher risk
  const unempScore = Math.min((indicators.unemployment.value / 8) * 20, 20);
  score += unempScore;

  // S&P 500 momentum contribution (0-20 points)
  // Negative momentum = higher risk
  const sp500Momentum = indicators.sp500.change1w;
  const momentumScore = sp500Momentum < 0 ? Math.min(Math.abs(sp500Momentum) * 2, 20) : 0;
  score += momentumScore;

  return Math.min(Math.round(score), 100);
}

/**
 * Classify risk regime based on risk score
 */
function classifyRiskRegime(riskScore: number): 'risk-on' | 'mixed' | 'risk-off' {
  if (riskScore < 30) return 'risk-on';
  if (riskScore < 60) return 'mixed';
  return 'risk-off';
}

/**
 * Get current macro snapshot
 */
export function getMacroSnapshot(range: string = '1M'): MacroSnapshot {
  const timestamp = new Date().toISOString();
  const points = getPointsForRange(range);

  // Fed Funds Rate (%)
  const fedFunds: MacroIndicator = {
    name: 'Fed Funds Rate',
    ticker: 'FEDFUNDS',
    value: 5.33,
    unit: '%',
    change1d: 0.00,
    change1w: 0.00,
    timeSeries: generateTimeSeries(5.33, 0.05, 0, points),
    category: 'rates',
  };

  // CPI Year-over-Year (%)
  const cpi: MacroIndicator = {
    name: 'CPI (YoY)',
    ticker: 'CPI',
    value: 3.2,
    unit: '%',
    change1d: 0.0,
    change1w: -0.1,
    timeSeries: generateTimeSeries(3.2, 0.15, -0.01, points),
    category: 'inflation',
  };

  // 10-Year Treasury Yield (%)
  const treasury10y: MacroIndicator = {
    name: '10Y Treasury',
    ticker: 'TNX',
    value: 4.45,
    unit: '%',
    change1d: 0.02,
    change1w: -0.08,
    timeSeries: generateTimeSeries(4.45, 0.08, -0.002, points),
    category: 'rates',
  };

  // Unemployment Rate (%)
  const unemployment: MacroIndicator = {
    name: 'Unemployment',
    ticker: 'UNRATE',
    value: 3.9,
    unit: '%',
    change1d: 0.0,
    change1w: 0.1,
    timeSeries: generateTimeSeries(3.9, 0.05, 0.002, points),
    category: 'employment',
  };

  // S&P 500 Index
  const sp500: MacroIndicator = {
    name: 'S&P 500',
    ticker: 'SPX',
    value: 4783.45,
    unit: '',
    change1d: 1.2,
    change1w: 2.8,
    timeSeries: generateTimeSeries(4783.45, 45, 5, points),
    category: 'equity',
  };

  // VIX Volatility Index
  const vix: MacroIndicator = {
    name: 'VIX',
    ticker: 'VIX',
    value: 13.2,
    unit: '',
    change1d: -0.5,
    change1w: -1.8,
    timeSeries: generateTimeSeries(13.2, 1.2, -0.05, points),
    category: 'volatility',
  };

  const indicators = {
    fedFunds,
    cpi,
    treasury10y,
    unemployment,
    sp500,
    vix,
  };

  const riskScore = calculateRiskScore(indicators);
  const riskRegime = classifyRiskRegime(riskScore);

  return {
    timestamp,
    indicators,
    riskScore,
    riskRegime,
  };
}

/**
 * Get risk regime color
 */
export function getRiskRegimeColor(regime: 'risk-on' | 'mixed' | 'risk-off'): string {
  switch (regime) {
    case 'risk-on':
      return '#10b981'; // green
    case 'mixed':
      return '#f59e0b'; // amber
    case 'risk-off':
      return '#ef4444'; // red
  }
}

/**
 * Get risk regime description
 */
export function getRiskRegimeDescription(regime: 'risk-on' | 'mixed' | 'risk-off'): string {
  switch (regime) {
    case 'risk-on':
      return 'Favorable conditions for risk assets. Low volatility, stable rates, strong equity momentum.';
    case 'mixed':
      return 'Mixed signals across macro indicators. Moderate volatility and uncertainty.';
    case 'risk-off':
      return 'Elevated risk environment. High volatility, rising rates, or weakening fundamentals.';
  }
}
