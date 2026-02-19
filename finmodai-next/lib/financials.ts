/**
 * Financial Data Utilities
 * Clean and scale financial data
 */

export interface RawFinancials {
  revenue?: number | string;
  ebitda?: number | string;
  netIncome?: number | string;
  totalAssets?: number | string;
  totalLiabilities?: number | string;
  cash?: number | string;
  debt?: number | string;
  [key: string]: number | string | undefined;
}

export interface ScaledFinancials {
  revenue: number;
  ebitda?: number;
  netIncome?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  cash?: number;
  debt?: number;
  scale: 'actual' | 'thousands' | 'millions' | 'billions';
  scaleFactor: number;
  [key: string]: number | string | undefined;
}

/**
 * Detect the scale of financial numbers
 */
export function detectScale(values: number[]): {
  scale: 'actual' | 'thousands' | 'millions' | 'billions';
  scaleFactor: number;
} {
  const nonZeroValues = values.filter(v => v > 0);
  if (nonZeroValues.length === 0) {
    return { scale: 'actual', scaleFactor: 1 };
  }
  
  const avgValue = nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length;
  
  if (avgValue > 1e9) {
    return { scale: 'actual', scaleFactor: 1 };
  } else if (avgValue > 1e6) {
    return { scale: 'thousands', scaleFactor: 1000 };
  } else if (avgValue > 1e3) {
    return { scale: 'millions', scaleFactor: 1000000 };
  } else {
    return { scale: 'billions', scaleFactor: 1000000000 };
  }
}

/**
 * Parse a financial value (handles strings with commas, etc.)
 */
export function parseFinancialValue(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  
  if (typeof value === 'number') {
    return isNaN(value) ? undefined : value;
  }
  
  // Remove commas, dollar signs, and whitespace
  const cleaned = value.toString().replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Clean and scale financial data
 */
export function cleanAndScaleFinancials(raw: RawFinancials): ScaledFinancials {
  // Parse all values
  const parsed: Record<string, number | undefined> = {};
  const numericValues: number[] = [];
  
  for (const [key, value] of Object.entries(raw)) {
    const parsedValue = parseFinancialValue(value);
    parsed[key] = parsedValue;
    if (parsedValue !== undefined && parsedValue > 0) {
      numericValues.push(parsedValue);
    }
  }
  
  // Detect scale
  const { scale, scaleFactor } = detectScale(numericValues);
  
  // Scale all values
  const scaled: ScaledFinancials = {
    revenue: (parsed.revenue || 0) * scaleFactor,
    ebitda: parsed.ebitda ? parsed.ebitda * scaleFactor : undefined,
    netIncome: parsed.netIncome ? parsed.netIncome * scaleFactor : undefined,
    totalAssets: parsed.totalAssets ? parsed.totalAssets * scaleFactor : undefined,
    totalLiabilities: parsed.totalLiabilities ? parsed.totalLiabilities * scaleFactor : undefined,
    cash: parsed.cash ? parsed.cash * scaleFactor : undefined,
    debt: parsed.debt ? parsed.debt * scaleFactor : undefined,
    scale,
    scaleFactor
  };
  
  // Add any additional fields (totalDebt, netDebt, etc.)
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in scaled) && value !== undefined) {
      scaled[key] = value * scaleFactor;
    }
  }

  // Set netDebtM / totalDebtM (millions) so route and DCF can use them
  const totalDebtScaled = typeof scaled.totalDebt === 'number' ? scaled.totalDebt : (scaled as any).totalDebt;
  const netDebtScaled = typeof scaled.netDebt === 'number' ? scaled.netDebt : (scaled as any).netDebt;
  const cashScaled = typeof scaled.cash === 'number' ? scaled.cash : undefined;
  if (typeof totalDebtScaled === 'number') {
    (scaled as any).totalDebtM = normalizeToMillions(totalDebtScaled, scale);
  }
  if (typeof netDebtScaled === 'number') {
    (scaled as any).netDebtM = normalizeToMillions(netDebtScaled, scale);
  } else if ((scaled as any).totalDebtM != null && typeof cashScaled === 'number') {
    (scaled as any).netDebtM = (scaled as any).totalDebtM - normalizeToMillions(cashScaled, scale);
  }
  if (typeof cashScaled === 'number') {
    (scaled as any).cashM = normalizeToMillions(cashScaled, scale);
  }

  return scaled;
}

/**
 * Normalize financials to millions
 */
export function normalizeToMillions(value: number, currentScale: 'actual' | 'thousands' | 'millions' | 'billions'): number {
  switch (currentScale) {
    case 'actual':
      return value / 1000000;
    case 'thousands':
      return value / 1000;
    case 'millions':
      return value;
    case 'billions':
      return value * 1000;
    default:
      return value;
  }
}

/**
 * Format financial number for display
 */
export function formatFinancialNumber(
  value: number,
  options: {
    decimals?: number;
    scale?: 'auto' | 'K' | 'M' | 'B';
    prefix?: string;
    suffix?: string;
  } = {}
): string {
  const { decimals = 1, scale = 'auto', prefix = '', suffix = '' } = options;
  
  let displayValue = value;
  let displayScale = '';
  
  if (scale === 'auto') {
    if (Math.abs(value) >= 1e9) {
      displayValue = value / 1e9;
      displayScale = 'B';
    } else if (Math.abs(value) >= 1e6) {
      displayValue = value / 1e6;
      displayScale = 'M';
    } else if (Math.abs(value) >= 1e3) {
      displayValue = value / 1e3;
      displayScale = 'K';
    }
  } else {
    switch (scale) {
      case 'K':
        displayValue = value / 1e3;
        displayScale = 'K';
        break;
      case 'M':
        displayValue = value / 1e6;
        displayScale = 'M';
        break;
      case 'B':
        displayValue = value / 1e9;
        displayScale = 'B';
        break;
    }
  }
  
  return `${prefix}${displayValue.toFixed(decimals)}${displayScale}${suffix}`;
}

/**
 * Calculate financial ratios
 */
export function calculateRatios(financials: ScaledFinancials): {
  grossMargin?: number;
  ebitdaMargin?: number;
  netMargin?: number;
  debtToEquity?: number;
  currentRatio?: number;
} {
  const ratios: ReturnType<typeof calculateRatios> = {};
  
  if (financials.revenue && financials.revenue > 0) {
    if (financials.ebitda) {
      ratios.ebitdaMargin = financials.ebitda / financials.revenue;
    }
    if (financials.netIncome) {
      ratios.netMargin = financials.netIncome / financials.revenue;
    }
  }
  
  if (financials.totalAssets && financials.totalLiabilities) {
    const equity = financials.totalAssets - financials.totalLiabilities;
    if (equity > 0 && financials.debt) {
      ratios.debtToEquity = financials.debt / equity;
    }
  }
  
  return ratios;
}
