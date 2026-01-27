/**
 * DCF Validation and Abort Logic
 * 
 * Tiered validation system:
 * - FATAL ERRORS: Logical impossibilities that block model generation
 * - WARNINGS: Unusual but mathematically valid outcomes
 * 
 * Scale-aware checks that work across small-cap, mid-cap, and mega-cap companies.
 */

import type { DCFInputs, DCFResults } from '../dcfGenerator';
import { formatMillions } from '../unitConversion';

export interface APIAttempt {
  provider: 'polygon' | 'finnhub' | 'fmp' | 'alpha-vantage' | 'web-scraping';
  status: 'success' | 'failed' | 'incomplete' | 'not-attempted';
  error?: string;
  dataRetrieved?: string[];
}

export interface ValidationError {
  field: string;
  issue: string;
  severity: 'critical' | 'warning';
}

export interface DCFValidationResult {
  isValid: boolean;
  reason: string | null;
  errors: ValidationError[];
  warnings: ValidationError[];
  apiAttempts: APIAttempt[];
  missingCriticalFields: string[];
  canProceed: boolean;
}

/**
 * Validate DCF inputs before computation
 * 
 * FATAL ERRORS (isValid=false):
 * - Missing or zero/negative required inputs (revenue, shares, years)
 * - WACC <= terminal growth (perpetuity formula breaks)
 * - NaN/Infinity in outputs
 * - Mathematically impossible debt ratios
 * 
 * WARNINGS (isValid=true):
 * - Extreme valuations (very high PPS, EV)
 * - Unusual scale (low share count, small revenue)
 * - High terminal value contribution
 * - Aggressive multiples
 */
export function validateDCFInputs(
  inputs: DCFInputs,
  results: DCFResults,
  apiAttempts: APIAttempt[]
): DCFValidationResult {
  const fatalErrors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const missingCriticalFields: string[] = [];
  let reason: string | null = null;

  // Helper to record fatal errors
  const recordFatal = (field: string, issue: string, reasonText: string) => {
    fatalErrors.push({ field, issue, severity: 'critical' });
    if (!missingCriticalFields.includes(field)) {
      missingCriticalFields.push(field);
    }
    if (!reason) {
      reason = reasonText;
    }
  };

  // Helper to record warnings
  const recordWarning = (field: string, issue: string) => {
    warnings.push({ field, issue, severity: 'warning' });
  };

  // ========================================
  // TIER 1: FATAL ERRORS (BLOCK MODEL)
  // ========================================

  // Revenue: Must be positive (no minimum threshold - scale-agnostic)
  if (!inputs.revenueByYear || inputs.revenueByYear.length === 0 || inputs.revenueByYear[0] <= 0) {
    recordFatal(
      'revenue',
      'Revenue must be positive',
      'Revenue is missing or non-positive'
    );
  }

  // Shares outstanding: Optional - only needed for per-share outputs
  if (!inputs.sharesOutstandingMillions || inputs.sharesOutstandingMillions <= 0) {
    recordWarning(
      'sharesOutstanding',
      'Shares outstanding unavailable',
      'Per-share metrics will not be calculated. Enterprise and equity values will still be computed.'
    );
  }

  // Projection horizon: Must have at least 5 years for credible DCF
  if (!inputs.years || inputs.years.length < 5) {
    recordFatal(
      'years',
      'Projection horizon must span at least 5 years',
      'Projection horizon is too short for reliable DCF'
    );
  }

  // WACC vs terminal growth: WACC must exceed terminal growth (perpetuity formula requirement)
  if (inputs.wacc <= inputs.terminalGrowth) {
    recordFatal(
      'terminalGrowth',
      `Terminal growth (${(inputs.terminalGrowth * 100).toFixed(2)}%) must be lower than WACC (${(inputs.wacc * 100).toFixed(2)}%)`,
      'Terminal growth must be lower than WACC for perpetuity formula'
    );
  }

  // Enterprise value: Must be finite and positive
  if (!isFinite(results.enterpriseValue) || results.enterpriseValue <= 0) {
    recordFatal(
      'enterpriseValue',
      'Enterprise value must be positive and finite',
      'Enterprise value calculation failed'
    );
  }

  // Net debt sanity: Debt cannot exceed 10x EV (extreme leverage = broken model)
  if (results.enterpriseValue > 0 && Math.abs(inputs.netDebtMillions) > results.enterpriseValue * 10) {
    recordFatal(
      'netDebt',
      `Net debt (${formatMillions(inputs.netDebtMillions)}) exceeds 10x EV (${formatMillions(results.enterpriseValue)}) - likely data error`,
      'Net debt exceeds ten times enterprise value'
    );
  }

  // Check for NaN/Infinity in key outputs
  const keyOutputs = [
    { name: 'equityValue', value: results.equityValue },
    { name: 'pricePerShare', value: results.pricePerShare },
    { name: 'terminalValue', value: results.terminalValue },
    { name: 'pvTerminalValue', value: results.pvTerminalValue },
  ];

  for (const output of keyOutputs) {
    if (!isFinite(output.value)) {
      recordFatal(
        output.name,
        `${output.name} is NaN or Infinity`,
        `${output.name} calculation produced invalid result`
      );
    }
  }

  // ========================================
  // TIER 2: WARNINGS (ALLOW MODEL)
  // ========================================

  // Only run warning checks if no fatal errors
  if (fatalErrors.length === 0) {
    // Small revenue warning (not fatal - many small-caps are valid)
    if (inputs.revenueByYear[0] < 100) {
      recordWarning(
        'revenue',
        `Revenue is ${formatMillions(inputs.revenueByYear[0])} (below $100M) - verify this is a small-cap company`
      );
    }

    // Low share count warning (not fatal - some companies like BRK.A have very low counts)
    if (inputs.sharesOutstandingMillions < 10) {
      recordWarning(
        'sharesOutstanding',
        `Shares outstanding is ${inputs.sharesOutstandingMillions.toFixed(1)}M (very low) - verify share count is correct`
      );
    }

    // High share count warning (possible unit error)
    if (inputs.sharesOutstandingMillions > 100_000) {
      recordWarning(
        'sharesOutstanding',
        `Shares outstanding is ${inputs.sharesOutstandingMillions.toFixed(0)}M (very high) - verify units are in millions`
      );
    }

    // Very high price per share (possible scale issue but not fatal)
    if (results.pricePerShare !== null && results.pricePerShare > 5000) {
      recordWarning(
        'pricePerShare',
        `Implied price per share is $${results.pricePerShare.toFixed(2)} (very high) - verify assumptions and share count`
      );
    }

    // Very low price per share (possible penny stock or unit error)
    if (results.pricePerShare !== null && results.pricePerShare < 0.01) {
      recordWarning(
        'pricePerShare',
        `Implied price per share is $${results.pricePerShare.toFixed(4)} (very low) - verify this is a penny stock or check units`
      );
    }

    // Mega-cap EV warning (not fatal - AAPL, MSFT, GOOGL are valid)
    if (results.enterpriseValue > 1_000_000) {
      recordWarning(
        'enterpriseValue',
        `Enterprise value is ${formatMillions(results.enterpriseValue)} (>$1T) - verify this is a mega-cap company`
      );
    }

    // Terminal value dominance warning (not fatal but flag for review)
    if (results.pvTerminalValue > 0 && results.pvExplicitFCF > 0) {
      const tvPercent = (results.pvTerminalValue / (results.pvTerminalValue + results.pvExplicitFCF)) * 100;
      if (tvPercent > 85) {
        recordWarning(
          'terminalValue',
          `Terminal value represents ${tvPercent.toFixed(1)}% of total value (high) - model is very sensitive to terminal assumptions`
        );
      }
    }

    // Net debt between 5x-10x EV (aggressive but not impossible)
    if (results.enterpriseValue > 0 && Math.abs(inputs.netDebtMillions) > results.enterpriseValue * 5) {
      recordWarning(
        'netDebt',
        `Net debt (${formatMillions(inputs.netDebtMillions)}) exceeds 5x EV (${formatMillions(results.enterpriseValue)}) - verify this is a distressed or highly leveraged company`
      );
    }

    // EV/Revenue multiple check (scale-aware)
    if (inputs.revenueByYear[0] > 0) {
      const evRevenueMultiple = results.enterpriseValue / inputs.revenueByYear[0];
      if (evRevenueMultiple > 50) {
        recordWarning(
          'enterpriseValue',
          `EV/Revenue multiple is ${evRevenueMultiple.toFixed(1)}x (very high) - typical for high-growth tech but verify assumptions`
        );
      }
      if (evRevenueMultiple < 0.1) {
        recordWarning(
          'enterpriseValue',
          `EV/Revenue multiple is ${evRevenueMultiple.toFixed(2)}x (very low) - typical for distressed companies but verify assumptions`
        );
      }
    }

    // WACC reasonableness (not fatal but flag extremes)
    if (inputs.wacc < 0.03) {
      recordWarning(
        'wacc',
        `WACC is ${(inputs.wacc * 100).toFixed(2)}% (very low) - verify cost of capital assumptions`
      );
    }
    if (inputs.wacc > 0.30) {
      recordWarning(
        'wacc',
        `WACC is ${(inputs.wacc * 100).toFixed(2)}% (very high) - typical for high-risk companies but verify assumptions`
      );
    }

    // Terminal growth reasonableness (not fatal but flag extremes)
    if (inputs.terminalGrowth < 0) {
      recordWarning(
        'terminalGrowth',
        `Terminal growth is ${(inputs.terminalGrowth * 100).toFixed(2)}% (negative) - implies perpetual decline`
      );
    }
    if (inputs.terminalGrowth > 0.05) {
      recordWarning(
        'terminalGrowth',
        `Terminal growth is ${(inputs.terminalGrowth * 100).toFixed(2)}% (>5%) - exceeds typical long-term GDP growth`
      );
    }
  }

  // ========================================
  // FINAL VALIDATION RESULT
  // ========================================

  const isValid = fatalErrors.length === 0;

  return {
    isValid,
    reason,
    errors: fatalErrors,
    warnings,
    apiAttempts,
    missingCriticalFields,
    canProceed: isValid,
  };
}

/**
 * Format validation result as error report
 */
export function formatValidationError(result: DCFValidationResult, ticker: string): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('❌ DCF ANALYSIS FAILED');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Ticker: ${ticker}`);
  lines.push('');
  
  // Missing critical fields
  if (result.missingCriticalFields.length > 0) {
    lines.push('MISSING CRITICAL DATA:');
    result.missingCriticalFields.forEach(field => {
      lines.push(`  ❌ ${field}`);
    });
    lines.push('');
  }
  
  // Critical errors
  if (result.errors.length > 0) {
    lines.push('CRITICAL ERRORS:');
    result.errors.forEach(error => {
      lines.push(`  ❌ ${error.field}: ${error.issue}`);
    });
    lines.push('');
  }
  
  // Warnings
  if (result.warnings.length > 0) {
    lines.push('WARNINGS:');
    result.warnings.forEach(warning => {
      lines.push(`  ⚠️  ${warning.field}: ${warning.issue}`);
    });
    lines.push('');
  }
  
  // API attempts
  lines.push('API ATTEMPTS:');
  result.apiAttempts.forEach(attempt => {
    const statusIcon = attempt.status === 'success' ? '✅' : 
                       attempt.status === 'incomplete' ? '⚠️' : 
                       attempt.status === 'not-attempted' ? '⊘' : '❌';
    
    lines.push(`  ${statusIcon} ${attempt.provider}: ${attempt.status}`);
    
    if (attempt.error) {
      lines.push(`      Error: ${attempt.error}`);
    }
    
    if (attempt.dataRetrieved && attempt.dataRetrieved.length > 0) {
      lines.push(`      Retrieved: ${attempt.dataRetrieved.join(', ')}`);
    }
  });
  lines.push('');
  if (result.reason) {
    lines.push('PRIMARY CAUSE:');
    lines.push(`  ${result.reason}`);
    lines.push('');
  }

  // Conclusion
  lines.push('RESULT:');
  lines.push(`  Cannot produce DCF model for ${ticker} due to invalid inputs.`);
  lines.push('  Please review the inputs and resolve the highlighted issues.');
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

/**
 * Create API attempt record
 */
export function createAPIAttempt(
  provider: APIAttempt['provider'],
  status: APIAttempt['status'],
  error?: string,
  dataRetrieved?: string[]
): APIAttempt {
  return {
    provider,
    status,
    error,
    dataRetrieved,
  };
}

/**
 * Log validation result
 */
export function logValidationResult(result: DCFValidationResult, ticker: string): void {
  if (result.canProceed) {
    console.log(`[DCF Validation] ✅ ${ticker} - All critical inputs validated`);
    
    if (result.warnings.length > 0) {
      console.log(`[DCF Validation] ⚠️  ${result.warnings.length} warning(s):`);
      result.warnings.forEach(w => {
        console.log(`  - ${w.field}: ${w.issue}`);
      });
    }
  } else {
    console.log(
      `[DCF Validation] ❌ ${ticker} - Validation failed${result.reason ? `: ${result.reason}` : ''}`
    );
    console.log(formatValidationError(result, ticker));
  }
}
