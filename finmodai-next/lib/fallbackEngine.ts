/**
 * Fallback Engine
 * Provides fallback calculations when primary data sources fail
 */

export interface FallbackResult {
  usedFallback: boolean;
  data: Record<string, any>;
  reason?: string;
}

export async function runFallbackEngine(
  ticker: string,
  modelType: string
): Promise<FallbackResult> {
  console.log(`[fallbackEngine] Running fallback for ${ticker} (${modelType})`);
  
  return {
    usedFallback: true,
    data: {
      ticker,
      modelType,
      revenue: 1000000000,
      revenueGrowth: 0.08,
      ebitdaMargin: 0.25,
      wacc: 0.10,
      terminalGrowth: 0.025
    },
    reason: 'Primary data sources unavailable'
  };
}
