/**
 * Canonical DCF Preview Data Mapper
 * 
 * Maps raw DCF API response to a consistent preview data structure.
 * Handles various response shapes and field name variations.
 */

export type DcfPreviewData = {
  impliedValuePerShare: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  netDebt: number | null;
  pvOfFcf: number | null;
  pvOfTerminalValue: number | null;

  wacc: number | null;
  terminalMethod: "gordon" | "exitMultiple" | null;
  terminalGrowth: number | null;
  exitMultiple: number | null;
  forecastYears: number | null;
  taxRate: number | null;

  projections: {
    years: string[]; // FY+1..FY+3 labels
    revenue: (number | null)[];
    ebitda: (number | null)[];
    fcf: (number | null)[];
  };

  currentPrice: number | null;
  upsidePct: number | null;
};

/**
 * Safely extract number from various formats
 */
function extractNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'N/A' || trimmed === '—') return null;
    const parsed = parseFloat(trimmed.replace(/[$,%]/g, ''));
    if (isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Extract array of numbers (or nulls) from various formats
 */
function extractNumberArray(arr: any, length: number = 3): (number | null)[] {
  if (!Array.isArray(arr)) return Array(length).fill(null);
  return arr.slice(0, length).map(val => extractNumber(val));
}

/**
 * Map raw DCF output to canonical preview data
 * 
 * Handles multiple response shapes:
 * - dcfSummary.valuation.pricePerShare (PRIMARY)
 * - dcfSummary.results.pvExplicitFCF (PRIMARY)
 * - dcfSummary.assumptions.wacc (PRIMARY)
 * - Legacy/alternate shapes as fallback
 */
export function mapDcfOutputToPreview(raw: any): DcfPreviewData {
  // Debug logging in dev
  if (process.env.NODE_ENV === 'development') {
    console.log('[DCF MAPPER] Raw input:', JSON.stringify(raw, null, 2));
  }

  // Try multiple paths to find the DCF data (PRIMARY: raw.dcfSummary)
  const dcf = raw?.dcfSummary ?? raw?.dcf ?? raw?.outputs?.dcf ?? raw ?? {};
  
  // Extract nested objects with fallbacks
  // PRIMARY SHAPE: dcfSummary.valuation.*, dcfSummary.results.*, dcfSummary.assumptions.*
  const valuation = dcf?.valuation ?? dcf?.valuationResults ?? dcf?.results?.valuation ?? {};
  const results = dcf?.results ?? dcf?.dcfResults ?? {};
  const assumptions = dcf?.assumptions ?? dcf?.keyAssumptions ?? dcf?.inputs ?? {};
  
  // Also check top-level if dcfSummary structure is flat
  const topLevel = dcf;

  // Extract valuation metrics - PRIMARY: dcfSummary.valuation.pricePerShare
  const impliedValuePerShare = extractNumber(
    valuation.pricePerShare ??
    valuation.valuePerShare ??
    results.pricePerShare ??
    valuation.impliedValuePerShare ??
    valuation.implied_value_per_share ??
    valuation.priceTarget ??
    results.impliedPrice ??
    results.implied_price ??
    topLevel.pricePerShare
  );

  const enterpriseValue = extractNumber(
    valuation.enterpriseValue ??
    results.enterpriseValue ??
    results.ev ??
    valuation.enterprise_value ??
    valuation.ev ??
    results.enterprise_value ??
    topLevel.enterpriseValue ??
    topLevel.ev
  );

  const equityValue = extractNumber(
    valuation.equityValue ??
    results.equityValue ??
    valuation.equity_value ??
    valuation.equity ??
    results.equity_value ??
    results.equity ??
    topLevel.equityValue ??
    topLevel.equity
  );

  // PV of FCF - PRIMARY: dcfSummary.results.pvExplicitFCF
  const pvOfFcf = extractNumber(
    results.pvExplicitFCF ??
    results.pvOfFcf ??
    results.pv_of_fcf ??
    results.pvFCF ??
    topLevel.pvExplicitFCF ??
    topLevel.pvOfFCF ??
    topLevel.pv_of_fcf
  );

  // PV of Terminal Value - PRIMARY: dcfSummary.results.pvTerminalValue
  const pvOfTerminalValue = extractNumber(
    results.pvTerminalValue ??
    results.pvOfTerminalValue ??
    results.pv_of_terminal_value ??
    results.terminalValue ??
    topLevel.pvTerminalValue ??
    topLevel.pvOfTerminalValue ??
    topLevel.pv_of_terminal_value ??
    topLevel.terminalValue ??
    topLevel.terminal_value
  );

  // Net debt - PRIMARY: dcfSummary.results.netDebt
  let netDebt = extractNumber(
    results.netDebt ??
    results.net_debt ??
    topLevel.netDebt ??
    topLevel.net_debt
  );

  // If net debt not found, try computing from components
  if (netDebt === null) {
    const totalDebt = extractNumber(results.totalDebt ?? results.total_debt ?? topLevel.totalDebt);
    const cash = extractNumber(results.cash ?? topLevel.cash);
    if (totalDebt !== null && cash !== null) {
      netDebt = totalDebt - cash;
    }
  }
  
  // If still null, try normalizedInputs (from API)
  if (netDebt === null && results.netDebtMillions !== undefined) {
    netDebt = extractNumber(results.netDebtMillions);
  }

  // Assumptions - PRIMARY: dcfSummary.assumptions.wacc, terminalGrowth, etc.
  const wacc = extractNumber(
    assumptions.wacc ??
    assumptions.discountRate ??
    results.wacc ??
    topLevel.wacc
  );

  const terminalGrowth = extractNumber(
    assumptions.terminalGrowth ??
    assumptions.terminal_growth ??
    results.terminalGrowth ??
    results.terminal_growth ??
    topLevel.terminalGrowth
  );

  const exitMultiple = extractNumber(
    assumptions.exitMultiple ??
    assumptions.exit_multiple ??
    results.exitMultiple ??
    topLevel.exitMultiple
  );

  const terminalMethod: "gordon" | "exitMultiple" | null = 
    exitMultiple !== null ? "exitMultiple" :
    terminalGrowth !== null ? "gordon" :
    null;

  const forecastYears = extractNumber(
    assumptions.projectionHorizon ??
    assumptions.forecastYears ??
    assumptions.forecast_years ??
    results.forecastYears ??
    topLevel.projectionHorizon ??
    topLevel.forecastYears
  ) ?? 5; // Default to 5 if missing

  const taxRate = extractNumber(
    assumptions.taxRate ??
    assumptions.tax_rate ??
    results.taxRate ??
    topLevel.taxRate
  );

  // Projections - PRIMARY: dcfSummary.results.revenueProjections, etc.
  const revenueProjections = 
    results.revenueProjections ??
    results.revenueByYear ??
    results.revenue_projects ??
    results.revenue ??
    topLevel.revenueProjections ??
    topLevel.revenue ??
    null;

  // EBITDA projections - PRIMARY: dcfSummary.results.ebitdaProjections
  let ebitdaProjections = 
    results.ebitdaProjections ??
    results.ebitda_projects ??
    results.ebitda ??
    topLevel.ebitdaProjections ??
    topLevel.ebitda ??
    null;
  
  // If we have EBIT and D&A, compute EBITDA
  if (ebitdaProjections === null && Array.isArray(results.ebitByYear) && Array.isArray(results.daByYear)) {
    ebitdaProjections = results.ebitByYear.slice(0, 3).map((ebit, i) => 
      ebit + (results.daByYear[i] || 0)
    );
  }

  // FCF projections - PRIMARY: dcfSummary.results.fcfProjections
  const fcfProjections = 
    results.fcfProjections ??
    results.ufcfByYear ??
    results.fcf_projects ??
    results.fcf ??
    results.freeCashFlow ??
    topLevel.fcfProjections ??
    topLevel.fcf ??
    topLevel.freeCashFlow ??
    null;

  // Current price and upside
  const currentPrice = extractNumber(
    results.currentPrice ??
    results.current_price ??
    valuation.currentPrice ??
    topLevel.currentPrice ??
    topLevel.current_price
  );

  const upsidePct = extractNumber(
    results.upsideDownside ??
    results.upside_downside ??
    results.upsidePct ??
    results.upside_pct ??
    valuation.upsideDownside ??
    topLevel.upsideDownside ??
    topLevel.upsidePct
  );

  // Build projections array - handle null arrays properly
  const buildProjectionArray = (arr: any): (number | null)[] => {
    if (arr === null || arr === undefined) return [null, null, null];
    if (!Array.isArray(arr)) return [null, null, null];
    return extractNumberArray(arr, 3);
  };

  const mapped: DcfPreviewData = {
    impliedValuePerShare,
    enterpriseValue,
    equityValue,
    netDebt,
    pvOfFcf,
    pvOfTerminalValue,
    wacc,
    terminalMethod,
    terminalGrowth,
    exitMultiple,
    forecastYears,
    taxRate,
    projections: {
      years: ['FY+1', 'FY+2', 'FY+3'],
      revenue: buildProjectionArray(revenueProjections),
      ebitda: buildProjectionArray(ebitdaProjections),
      fcf: buildProjectionArray(fcfProjections),
    },
    currentPrice,
    upsidePct,
  };

  // Debug logging in dev
  if (process.env.NODE_ENV === 'development') {
    console.log('[DCF MAPPER] Mapped output:', JSON.stringify(mapped, null, 2));
  }

  return mapped;
}
