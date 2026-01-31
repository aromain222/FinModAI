/**
 * Macro Data Generator
 * Generates synthetic macro economic data for dashboard
 */

export type TimeRange = '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX';

export interface MacroDataPoint {
  date: string; // ISO date
  value: number;
}

export interface MacroIndicator {
  value: number;
  change1d: number;
  change1w: number;
  timeSeries: MacroDataPoint[];
}

export type RiskRegime = 'risk-on' | 'mixed' | 'risk-off';

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
  riskRegime: RiskRegime;
}

/**
 * Get number of data points for time range
 */
function getPointsForRange(range: TimeRange): number {
  switch (range) {
    case '1W': return 7;
    case '1M': return 30;
    case '3M': return 90;
    case '1Y': return 252; // trading days
    case '5Y': return 1260; // trading days
    case 'MAX': return 2520; // ~10 years
    default: return 30;
  }
}

/**
 * Generate synthetic time series data
 */
function generateTimeSeries(
  baseValue: number,
  points: number,
  volatility: number
): MacroDataPoint[] {
  const data: MacroDataPoint[] = [];
  let current = baseValue;
  
  for (let i = points - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Random walk with mean reversion
    const shock = (Math.random() - 0.5) * volatility;
    const meanReversion = (baseValue - current) * 0.05;
    current = Math.max(0, current + shock + meanReversion);
    
    data.push({
      date: date.toISOString(),
      value: Number(current.toFixed(4))
    });
  }
  
  return data;
}

/**
 * Calculate percent change between two values
 */
function percentChange(from: number, to: number): number {
  if (from === 0) return 0;
  return Number(((to - from) / from).toFixed(4));
}

/**
 * Calculate risk score from macro indicators
 */
function calculateRiskScore(indicators: MacroSnapshot['indicators']): number {
  // VIX contribution (0-40 points)
  const vixScore = Math.min(40, (indicators.vix.value / 40) * 40);
  
  // Fed Funds contribution (0-20 points)
  const fedScore = Math.min(20, (indicators.fedFunds.value / 6) * 20);
  
  // Unemployment contribution (0-20 points)
  const unempScore = Math.min(20, (indicators.unemployment.value / 10) * 20);
  
  // S&P 500 momentum contribution (0-20 points, inverse)
  const sp500Change = indicators.sp500.change1w;
  const momentumScore = sp500Change < 0 ? Math.min(20, Math.abs(sp500Change) * 100) : 0;
  
  return Math.round(vixScore + fedScore + unempScore + momentumScore);
}

/**
 * Determine risk regime from risk score
 */
function getRiskRegime(score: number): RiskRegime {
  if (score < 30) return 'risk-on';
  if (score < 60) return 'mixed';
  return 'risk-off';
}

/**
 * Generate macro snapshot with synthetic data
 */
export function getMacroSnapshot(range: TimeRange = '1M'): MacroSnapshot {
  const points = getPointsForRange(range);
  
  // Current baseline values (realistic as of 2024-2025)
  const fedFundsBase = 5.33;
  const cpiBase = 3.2;
  const treasury10yBase = 4.45;
  const unemploymentBase = 3.9;
  const sp500Base = 4783.45;
  const vixBase = 13.2;
  
  // Generate time series
  const fedFundsSeries = generateTimeSeries(fedFundsBase, points, 0.05);
  const cpiSeries = generateTimeSeries(cpiBase, points, 0.1);
  const treasury10ySeries = generateTimeSeries(treasury10yBase, points, 0.08);
  const unemploymentSeries = generateTimeSeries(unemploymentBase, points, 0.05);
  const sp500Series = generateTimeSeries(sp500Base, points, 50);
  const vixSeries = generateTimeSeries(vixBase, points, 1.5);
  
  // Get current and historical values
  const fedFundsCurrent = fedFundsSeries[fedFundsSeries.length - 1].value;
  const fedFunds1w = fedFundsSeries[Math.max(0, fedFundsSeries.length - 7)]?.value || fedFundsCurrent;
  const fedFunds1d = fedFundsSeries[Math.max(0, fedFundsSeries.length - 2)]?.value || fedFundsCurrent;
  
  const cpiCurrent = cpiSeries[cpiSeries.length - 1].value;
  const cpi1w = cpiSeries[Math.max(0, cpiSeries.length - 7)]?.value || cpiCurrent;
  const cpi1d = cpiSeries[Math.max(0, cpiSeries.length - 2)]?.value || cpiCurrent;
  
  const treasury10yCurrent = treasury10ySeries[treasury10ySeries.length - 1].value;
  const treasury10y1w = treasury10ySeries[Math.max(0, treasury10ySeries.length - 7)]?.value || treasury10yCurrent;
  const treasury10y1d = treasury10ySeries[Math.max(0, treasury10ySeries.length - 2)]?.value || treasury10yCurrent;
  
  const unemploymentCurrent = unemploymentSeries[unemploymentSeries.length - 1].value;
  const unemployment1w = unemploymentSeries[Math.max(0, unemploymentSeries.length - 7)]?.value || unemploymentCurrent;
  const unemployment1d = unemploymentSeries[Math.max(0, unemploymentSeries.length - 2)]?.value || unemploymentCurrent;
  
  const sp500Current = sp500Series[sp500Series.length - 1].value;
  const sp5001w = sp500Series[Math.max(0, sp500Series.length - 7)]?.value || sp500Current;
  const sp5001d = sp500Series[Math.max(0, sp500Series.length - 2)]?.value || sp500Current;
  
  const vixCurrent = vixSeries[vixSeries.length - 1].value;
  const vix1w = vixSeries[Math.max(0, vixSeries.length - 7)]?.value || vixCurrent;
  const vix1d = vixSeries[Math.max(0, vixSeries.length - 2)]?.value || vixCurrent;
  
  const indicators = {
    fedFunds: {
      value: fedFundsCurrent,
      change1d: percentChange(fedFunds1d, fedFundsCurrent),
      change1w: percentChange(fedFunds1w, fedFundsCurrent),
      timeSeries: fedFundsSeries
    },
    cpi: {
      value: cpiCurrent,
      change1d: percentChange(cpi1d, cpiCurrent),
      change1w: percentChange(cpi1w, cpiCurrent),
      timeSeries: cpiSeries
    },
    treasury10y: {
      value: treasury10yCurrent,
      change1d: percentChange(treasury10y1d, treasury10yCurrent),
      change1w: percentChange(treasury10y1w, treasury10yCurrent),
      timeSeries: treasury10ySeries
    },
    unemployment: {
      value: unemploymentCurrent,
      change1d: percentChange(unemployment1d, unemploymentCurrent),
      change1w: percentChange(unemployment1w, unemploymentCurrent),
      timeSeries: unemploymentSeries
    },
    sp500: {
      value: sp500Current,
      change1d: percentChange(sp5001d, sp500Current),
      change1w: percentChange(sp5001w, sp500Current),
      timeSeries: sp500Series
    },
    vix: {
      value: vixCurrent,
      change1d: percentChange(vix1d, vixCurrent),
      change1w: percentChange(vix1w, vixCurrent),
      timeSeries: vixSeries
    }
  };
  
  const riskScore = calculateRiskScore(indicators);
  const riskRegime = getRiskRegime(riskScore);
  
  return {
    timestamp: new Date().toISOString(),
    indicators,
    riskScore,
    riskRegime
  };
}
