/**
 * Data Quality Diagnostics
 * 
 * Tracks failures and data quality issues throughout the model generation pipeline.
 * Helps identify whether failures are from API, normalization, or AI fallback.
 */

export type DiagnosticStage = 'fetch' | 'normalize' | 'ai-fallback' | 'post-process' | 'sanitize';

export type DataSource = 
  | 'FMP' 
  | 'Polygon' 
  | 'Yahoo Finance' 
  | 'Finnhub' 
  | 'Mock' 
  | 'AI-Fallback' 
  | 'User-Input'
  | 'Unknown';

export type ModelType = 'three-statement' | 'dcf' | 'lbo' | 'comps' | 'macro' | 'analysis';

/**
 * Diagnostic entry for a single stage of data processing
 */
export interface DataDiagnostics {
  ticker: string;
  modelType: ModelType;
  dataSource: DataSource;
  stage: DiagnosticStage;
  ok: boolean;                        // false = hard failure, true = success or warnings only
  errors: string[];                   // Hard failures (HTTP error, missing fields, etc.)
  warnings: string[];                 // Suspicious but usable (thin history, weird ratios, etc.)
  rawSample?: unknown;                // Small slice of raw API data for debugging
  usedAiFallback?: boolean;           // True if AI was used to fill missing data
  zeroProtectionTriggered?: boolean;  // True if all values were zero/null
  timestamp: string;                  // ISO timestamp
  durationMs?: number;                // How long this stage took
}

/**
 * Sanity check rules for financial data
 */
export interface SanityCheckRules {
  revenue: { min: number; max: number };
  grossMargin: { min: number; max: number };
  ebitMargin: { min: number; max: number };
  taxRate: { min: number; max: number };
  capexPctRevenue: { min: number; max: number };
}

/**
 * Default sanity check bounds
 */
export const DEFAULT_SANITY_RULES: SanityCheckRules = {
  revenue: { min: 1, max: 10_000_000 },           // $1M to $10T
  grossMargin: { min: -0.20, max: 0.90 },         // -20% to 90%
  ebitMargin: { min: -0.50, max: 0.60 },          // -50% to 60%
  taxRate: { min: 0, max: 0.40 },                 // 0% to 40%
  capexPctRevenue: { min: 0, max: 0.50 },         // 0% to 50%
};

/**
 * Helper to create a diagnostic entry
 */
export function createDiagnostic(
  ticker: string,
  modelType: ModelType,
  dataSource: DataSource,
  stage: DiagnosticStage,
  ok: boolean = true
): DataDiagnostics {
  return {
    ticker,
    modelType,
    dataSource,
    stage,
    ok,
    errors: [],
    warnings: [],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to log diagnostics
 */
export function logDiagnostic(diag: DataDiagnostics): void {
  const prefix = `[DIAGNOSTICS] ${diag.ticker} | ${diag.modelType} | ${diag.stage} | ${diag.dataSource}`;
  
  if (!diag.ok && diag.errors.length > 0) {
    console.error(`${prefix} | ❌ FAILED`);
    diag.errors.forEach(err => console.error(`  - ERROR: ${err}`));
  }
  
  if (diag.warnings.length > 0) {
    console.warn(`${prefix} | ⚠️  WARNINGS`);
    diag.warnings.forEach(warn => console.warn(`  - WARNING: ${warn}`));
  }
  
  if (diag.ok && diag.errors.length === 0 && diag.warnings.length === 0) {
    console.log(`${prefix} | ✅ OK`);
  }
  
  if (diag.usedAiFallback) {
    console.log(`${prefix} | 🤖 AI fallback used`);
  }
  
  if (diag.zeroProtectionTriggered) {
    console.warn(`${prefix} | 🛡️  Zero protection triggered`);
  }
  
  if (diag.durationMs) {
    console.log(`${prefix} | ⏱️  ${diag.durationMs}ms`);
  }
}

/**
 * Helper to check if any diagnostics failed
 */
export function hasFailures(diagnostics: DataDiagnostics[]): boolean {
  return diagnostics.some(d => !d.ok);
}

/**
 * Helper to get summary of diagnostics
 */
export function getDiagnosticsSummary(diagnostics: DataDiagnostics[]): string {
  const failed = diagnostics.filter(d => !d.ok);
  const warnings = diagnostics.filter(d => d.warnings.length > 0);
  
  if (failed.length === 0 && warnings.length === 0) {
    return '✅ All data quality checks passed';
  }
  
  const parts: string[] = [];
  
  if (failed.length > 0) {
    parts.push(`❌ ${failed.length} failure(s)`);
  }
  
  if (warnings.length > 0) {
    parts.push(`⚠️  ${warnings.length} warning(s)`);
  }
  
  return parts.join(', ');
}

