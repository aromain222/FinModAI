/**
 * Output Formatter
 * Format model outputs for display and export
 */

export interface FormattedOutput {
  formatted: Record<string, any>;
  metadata: {
    formattedAt: string;
    version: string;
  };
}

export function formatModelOutput(output: Record<string, any>): FormattedOutput {
  const formatted = {
    ...output,
    // Format numbers
    enterpriseValue: output.enterpriseValue ? formatCurrency(output.enterpriseValue) : undefined,
    equityValue: output.equityValue ? formatCurrency(output.equityValue) : undefined,
    pricePerShare: output.pricePerShare ? formatPrice(output.pricePerShare) : undefined,
    // Format percentages
    revenueGrowth: output.revenueGrowth ? formatPercent(output.revenueGrowth) : undefined,
    ebitdaMargin: output.ebitdaMargin ? formatPercent(output.ebitdaMargin) : undefined,
    wacc: output.wacc ? formatPercent(output.wacc) : undefined
  };
  
  return {
    formatted,
    metadata: {
      formattedAt: new Date().toISOString(),
      version: '1.0.0'
    }
  };
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// Stub functions for compatibility
export function formatDCFOutput(
  ticker: string,
  scenario: string,
  inputs: any,
  results: any,
  waccSource?: string,
  scenarioNotes?: string
): Record<string, any> {
  return {
    ticker,
    scenario,
    enterpriseValue: results?.enterpriseValue || 0,
    equityValue: results?.equityValue || 0,
    pricePerShare: results?.pricePerShare || 0,
    wacc: inputs?.wacc || 0.10,
    terminalGrowth: inputs?.terminalGrowth || 0.025,
    waccSource: waccSource || 'inferred',
    scenarioNotes: scenarioNotes || '',
    valuationResults: results,
  };
}

export function logFormattedOutput(output: Record<string, any>): void {
  console.log('[DCF Output]', JSON.stringify(output, null, 2));
}

export function createJSONSummary(output: Record<string, any>): Record<string, any> {
  return output; // Return the object directly, not a string
}
