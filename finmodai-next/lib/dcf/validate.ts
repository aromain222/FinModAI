import type { DcfAssumptions, DcfResults, DcfValidation, QualityTier } from '@/types/dcfContracts';

/**
 * Validate DCF assumptions and results
 * 
 * Tiered validation system:
 * - FATAL ERRORS (reasons[]): Block model generation
 * - WARNINGS (warnings[]): Flag unusual outcomes but allow model
 * 
 * Scale-aware checks that work across all company sizes and sectors.
 */
export function validateDcfAssumptions(
  assumptions: DcfAssumptions,
  results: DcfResults,
  tier: QualityTier
): DcfValidation {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ========================================
  // TIER 1: FATAL ERRORS (BLOCK MODEL)
  // ========================================

  // Projection horizon: Must have at least 5 years
  if (assumptions.years.length < 5) {
    reasons.push('Projection horizon must span at least 5 years');
  }

  // Revenue: Must be positive (no minimum threshold - scale-agnostic)
  if (!assumptions.revenueByYear || assumptions.revenueByYear.length === 0 || assumptions.revenueByYear[0] <= 0) {
    reasons.push('Base-year revenue must be positive');
  }

  // WACC vs terminal growth: WACC must exceed terminal growth by at least 100bps
  if (assumptions.wacc <= assumptions.terminalGrowth + 0.01) {
    reasons.push('WACC must exceed terminal growth by at least 100bps');
  }

  // Shares outstanding: Optional - only needed for per-share outputs
  // Don't add to validation errors if missing

  // Enterprise value: Must be finite and positive
  if (!Number.isFinite(results.enterpriseValue) || results.enterpriseValue <= 0) {
    reasons.push('Enterprise value must be positive');
  }

  // ========================================
  // TIER 2: WARNINGS (ALLOW MODEL)
  // ========================================

  // Only run warning checks if no fatal errors
  if (reasons.length === 0) {
    // Small revenue warning (not fatal - many small-caps are valid)
    if (assumptions.revenueByYear[0] < 100) {
      warnings.push(`Base-year revenue is $${assumptions.revenueByYear[0].toFixed(1)}M (below $100M) - verify this is a small-cap company`);
    }

    // Low share count warning (not fatal - some companies like BRK.A have very low counts)
    if (assumptions.sharesOutstandingMillions < 10) {
      warnings.push(`Shares outstanding is ${assumptions.sharesOutstandingMillions.toFixed(1)}M (very low) - verify share count is correct`);
    }

    // High share count warning (possible unit error)
    if (assumptions.sharesOutstandingMillions > 100_000) {
      warnings.push(`Shares outstanding is ${assumptions.sharesOutstandingMillions.toFixed(0)}M (very high) - verify units are in millions`);
    }

    // Net debt sanity checks
    const netDebtAbs = Math.abs(assumptions.netDebtMillions);
    
    // Fatal: Net debt > 10x EV (extreme leverage = broken model)
    if (results.enterpriseValue > 0 && netDebtAbs > results.enterpriseValue * 10) {
      reasons.push(`Net debt (${assumptions.netDebtMillions.toFixed(1)}M) exceeds 10x EV (${results.enterpriseValue.toFixed(1)}M) - likely data error`);
    }
    // Warning: Net debt between 5x-10x EV (aggressive but not impossible)
    else if (results.enterpriseValue > 0 && netDebtAbs > results.enterpriseValue * 5) {
      const message = `Net debt (${assumptions.netDebtMillions.toFixed(1)}M) exceeds 5x EV (${results.enterpriseValue.toFixed(1)}M) - verify this is a distressed or highly leveraged company`;
      
      // Institutional tier: stricter standards
      if (tier === 'institutional') {
        warnings.push(message + ' (institutional tier requires review)');
      } else {
        warnings.push(message);
      }
    }

    // Mega-cap EV warning (not fatal - AAPL, MSFT, GOOGL are valid)
    if (results.enterpriseValue > 1_000_000) {
      warnings.push(`Enterprise value is $${(results.enterpriseValue / 1000).toFixed(1)}B (>$1T) - verify this is a mega-cap company`);
    }

    // WACC reasonableness (not fatal but flag extremes)
    if (assumptions.wacc < 0.03) {
      warnings.push(`WACC is ${(assumptions.wacc * 100).toFixed(2)}% (very low) - verify cost of capital assumptions`);
    }
    if (assumptions.wacc > 0.30) {
      warnings.push(`WACC is ${(assumptions.wacc * 100).toFixed(2)}% (very high) - typical for high-risk companies but verify assumptions`);
    }

    // Terminal growth reasonableness (not fatal but flag extremes)
    if (assumptions.terminalGrowth < 0) {
      warnings.push(`Terminal growth is ${(assumptions.terminalGrowth * 100).toFixed(2)}% (negative) - implies perpetual decline`);
    }
    if (assumptions.terminalGrowth > 0.05) {
      warnings.push(`Terminal growth is ${(assumptions.terminalGrowth * 100).toFixed(2)}% (>5%) - exceeds typical long-term GDP growth`);
    }

    // EV/Revenue multiple check (scale-aware)
    if (assumptions.revenueByYear[0] > 0) {
      const evRevenueMultiple = results.enterpriseValue / assumptions.revenueByYear[0];
      if (evRevenueMultiple > 50) {
        warnings.push(`EV/Revenue multiple is ${evRevenueMultiple.toFixed(1)}x (very high) - typical for high-growth tech but verify assumptions`);
      }
      if (evRevenueMultiple < 0.1) {
        warnings.push(`EV/Revenue multiple is ${evRevenueMultiple.toFixed(2)}x (very low) - typical for distressed companies but verify assumptions`);
      }
    }
  }

  // ========================================
  // FINAL VALIDATION RESULT
  // ========================================

  const isValid = reasons.length === 0;
  
  // Institutional tier: warnings can optionally block (but isValid stays true)
  const blocking = tier === 'institutional' && !isValid;

  return {
    tier,
    isValid,
    blocking,
    reasons,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
