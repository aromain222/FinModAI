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
