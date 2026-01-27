/**
 * Auto-default utilities for input metadata (min/max/step/unit)
 * Intelligently determines slider bounds and steps based on input characteristics
 */

export type InputMetadata = {
  min: number;
  max: number;
  step: number;
  unit: string;
  isPercentage: boolean;
  isCurrency: boolean;
  isCount: boolean;
};

/**
 * Detect if a value/unit pair represents a percentage
 */
function isPercentageType(key: string, unit?: string): boolean {
  const keyLower = key.toLowerCase();
  const unitLower = (unit || '').toLowerCase();
  return (
    unitLower.includes('%') ||
    keyLower.includes('pct') ||
    keyLower.includes('percent') ||
    keyLower.includes('rate') ||
    keyLower.includes('margin') ||
    keyLower.includes('growth') ||
    keyLower.includes('wacc') ||
    keyLower.includes('discount') ||
    keyLower.includes('churn') ||
    keyLower.includes('retention')
  );
}

/**
 * Detect if a value/unit pair represents currency
 */
function isCurrencyType(key: string, unit?: string): boolean {
  const unitLower = (unit || '').toLowerCase();
  const keyLower = key.toLowerCase();
  return (
    unitLower.includes('$') ||
    unitLower.includes('usd') ||
    keyLower.includes('revenue') ||
    keyLower.includes('price') ||
    keyLower.includes('value') ||
    keyLower.includes('debt') ||
    keyLower.includes('cash') ||
    keyLower.includes('capex') ||
    keyLower.includes('opex') ||
    keyLower.includes('ebitda') ||
    keyLower.includes('fcf')
  );
}

/**
 * Detect if a value/unit pair represents a count (integers only)
 */
function isCountType(key: string, unit?: string): boolean {
  const keyLower = key.toLowerCase();
  const unitLower = (unit || '').toLowerCase();
  return (
    keyLower.includes('shares') ||
    keyLower.includes('count') ||
    keyLower.includes('units') ||
    keyLower.includes('employees') ||
    keyLower.includes('customers') ||
    unitLower === 'units' ||
    unitLower === 'count'
  );
}

/**
 * Normalize percentage value to 0-1 scale
 */
function normalizePercentage(value: number): number {
  return Math.abs(value) > 1 ? value / 100 : value;
}

/**
 * Get percentage scale (0-1 or 0-100)
 */
function getPercentageScale(key: string, unit?: string, defaultValue?: number): 'decimal' | 'percent' {
  const unitLower = (unit || '').toLowerCase();
  
  // If unit is explicitly '%', use 0-100 scale
  if (unitLower === '%') {
    return 'percent';
  }
  
  // If default value is > 1, assume 0-100 scale
  if (defaultValue !== undefined && Math.abs(defaultValue) > 1) {
    return 'percent';
  }
  
  // Default to 0-1 scale for financial calculations
  return 'decimal';
}

/**
 * Calculate default bounds as +/- 30% of default value
 */
function calculateDefaultBounds(defaultValue: number, isNonNegative: boolean): { min: number; max: number } {
  const range = defaultValue * 0.3;
  let min = defaultValue - range;
  let max = defaultValue + range;
  
  // Clamp to >= 0 for non-negative values
  if (isNonNegative && min < 0) {
    min = 0;
    // Adjust max to maintain symmetry if possible
    if (defaultValue > 0) {
      max = defaultValue + (defaultValue - min);
    }
  }
  
  return { min, max };
}

/**
 * Get step size for currency based on magnitude
 */
function getCurrencyStep(value: number): number {
  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    return 1_000_000_000; // Billions
  }
  if (absValue >= 1_000_000) {
    return 1_000_000; // Millions
  }
  if (absValue >= 1_000) {
    return 1_000; // Thousands
  }
  if (absValue >= 100) {
    return 100;
  }
  if (absValue >= 10) {
    return 10;
  }
  return 1;
}

/**
 * Get intelligent bounds for specific input keys
 */
function getSpecificBounds(key: string, defaultValue?: number): { min?: number; max?: number; isNonNegative?: boolean } {
  const keyLower = key.toLowerCase();
  
  // Growth rates: can be negative
  if (keyLower.includes('growth')) {
    return { min: -0.5, max: 0.5, isNonNegative: false };
  }
  
  // Margins: typically 0-100%
  if (keyLower.includes('margin')) {
    const scale = defaultValue !== undefined && Math.abs(defaultValue) > 1 ? 'percent' : 'decimal';
    return scale === 'percent' 
      ? { min: -50, max: 100, isNonNegative: false }
      : { min: -0.5, max: 0.95, isNonNegative: false };
  }
  
  // WACC/Discount rates: 5-20%
  if (keyLower.includes('wacc') || keyLower.includes('discount')) {
    const scale = defaultValue !== undefined && Math.abs(defaultValue) > 1 ? 'percent' : 'decimal';
    return scale === 'percent'
      ? { min: 5, max: 25, isNonNegative: true }
      : { min: 0.05, max: 0.25, isNonNegative: true };
  }
  
  // Terminal growth: 0-5%
  if (keyLower.includes('terminal')) {
    const scale = defaultValue !== undefined && Math.abs(defaultValue) > 1 ? 'percent' : 'decimal';
    return scale === 'percent'
      ? { min: -2, max: 6, isNonNegative: false }
      : { min: -0.02, max: 0.06, isNonNegative: false };
  }
  
  // Tax rate: 0-50%
  if (keyLower.includes('tax')) {
    const scale = defaultValue !== undefined && Math.abs(defaultValue) > 1 ? 'percent' : 'decimal';
    return scale === 'percent'
      ? { min: 0, max: 50, isNonNegative: true }
      : { min: 0, max: 0.5, isNonNegative: true };
  }
  
  // Revenue/financial values: typically non-negative
  if (keyLower.includes('revenue') || keyLower.includes('price') || keyLower.includes('value')) {
    return { min: 0, max: undefined, isNonNegative: true };
  }
  
  // Shares/debt: non-negative
  if (keyLower.includes('shares') || keyLower.includes('debt')) {
    return { min: 0, max: undefined, isNonNegative: true };
  }
  
  // Generic percentage: -100% to 100%
  if (keyLower.includes('rate') || keyLower.includes('pct')) {
    const scale = defaultValue !== undefined && Math.abs(defaultValue) > 1 ? 'percent' : 'decimal';
    return scale === 'percent'
      ? { min: -100, max: 100, isNonNegative: false }
      : { min: -1, max: 1, isNonNegative: false };
  }
  
  return { isNonNegative: false };
}

/**
 * Generate input metadata with intelligent defaults
 */
export function getInputMetadata(
  key: string,
  unit?: string,
  defaultValue?: number
): InputMetadata {
  const isPercentage = isPercentageType(key, unit);
  const isCurrency = isCurrencyType(key, unit);
  const isCount = isCountType(key, unit);
  
  // Get specific bounds if available
  const specificBounds = getSpecificBounds(key, defaultValue);
  let min: number;
  let max: number;
  let step: number;
  
  if (isPercentage) {
    const scale = getPercentageScale(key, unit, defaultValue);
    
    if (scale === 'percent') {
      // 0-100 scale
      if (specificBounds.min !== undefined) {
        min = specificBounds.min;
      } else if (defaultValue !== undefined) {
        const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? false);
        min = Math.max(-100, Math.floor(bounds.min));
      } else {
        min = -100;
      }
      
      if (specificBounds.max !== undefined) {
        max = specificBounds.max;
      } else if (defaultValue !== undefined) {
        const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? false);
        max = Math.min(100, Math.ceil(bounds.max));
      } else {
        max = 100;
      }
      
      step = 1; // 1% steps
    } else {
      // 0-1 scale
      if (specificBounds.min !== undefined) {
        min = specificBounds.min;
      } else if (defaultValue !== undefined) {
        const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? false);
        min = Math.max(-1, bounds.min);
      } else {
        min = -1;
      }
      
      if (specificBounds.max !== undefined) {
        max = specificBounds.max;
      } else if (defaultValue !== undefined) {
        const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? false);
        max = Math.min(1, bounds.max);
      } else {
        max = 1;
      }
      
      step = 0.01; // 0.01 steps (1 percentage point)
    }
    
    // Ensure min/max are reasonable
    if (specificBounds.isNonNegative) {
      min = Math.max(0, min);
    }
    
    return {
      min,
      max,
      step,
      unit: unit || (scale === 'percent' ? '%' : ''),
      isPercentage: true,
      isCurrency: false,
      isCount: false,
    };
  }
  
  if (isCurrency) {
    if (specificBounds.min !== undefined) {
      min = specificBounds.min;
    } else if (defaultValue !== undefined) {
      const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? true);
      min = Math.max(0, bounds.min);
    } else {
      min = 0;
    }
    
    if (specificBounds.max !== undefined) {
      max = specificBounds.max;
    } else if (defaultValue !== undefined) {
      const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? true);
      max = Math.ceil(bounds.max);
    } else {
      max = defaultValue ? defaultValue * 2 : 1000;
    }
    
    step = defaultValue !== undefined ? getCurrencyStep(defaultValue) : 100;
    
    return {
      min,
      max,
      step,
      unit: unit || '$M',
      isPercentage: false,
      isCurrency: true,
      isCount: false,
    };
  }
  
  if (isCount) {
    if (specificBounds.min !== undefined) {
      min = specificBounds.min;
    } else if (defaultValue !== undefined) {
      const bounds = calculateDefaultBounds(defaultValue, true);
      min = Math.max(0, Math.floor(bounds.min));
    } else {
      min = 0;
    }
    
    if (specificBounds.max !== undefined) {
      max = specificBounds.max;
    } else if (defaultValue !== undefined) {
      const bounds = calculateDefaultBounds(defaultValue, true);
      max = Math.ceil(bounds.max);
    } else {
      max = defaultValue ? Math.ceil(defaultValue * 2) : 1000;
    }
    
    step = 1; // Integer steps
    
    return {
      min,
      max,
      step,
      unit: unit || '',
      isPercentage: false,
      isCurrency: false,
      isCount: true,
    };
  }
  
  // Generic numeric input
  if (defaultValue !== undefined) {
    const bounds = calculateDefaultBounds(defaultValue, specificBounds.isNonNegative ?? false);
    min = bounds.min;
    max = bounds.max;
    
    // Smart step based on range
    const range = max - min;
    if (range > 1000) {
      step = 100;
    } else if (range > 100) {
      step = 10;
    } else if (range > 10) {
      step = 1;
    } else {
      step = 0.1;
    }
  } else {
    min = -1000;
    max = 1000;
    step = 1;
  }
  
  if (specificBounds.isNonNegative) {
    min = Math.max(0, min);
  }
  
  return {
    min,
    max,
    step,
    unit: unit || '',
    isPercentage: false,
    isCurrency: false,
    isCount: false,
  };
}

/**
 * Format a number with K/M/B abbreviations
 */
export function formatNumberWithAbbreviation(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(decimals)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(decimals)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(decimals)}K`;
  }
  
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

