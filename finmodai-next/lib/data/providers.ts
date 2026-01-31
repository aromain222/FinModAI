/**
 * Data Providers
 * Configuration and status for external data providers
 */

export interface DataProvider {
  name: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  endpoints: string[];
}

export function getDataProviders(): DataProvider[] {
  return [
    {
      name: 'FMP',
      enabled: true,
      apiKeyConfigured: !!process.env.FMP_API_KEY,
      endpoints: ['financials', 'quote', 'profile']
    },
    {
      name: 'Alpha Vantage',
      enabled: true,
      apiKeyConfigured: !!(process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY),
      endpoints: ['quote', 'fundamentals']
    },
    {
      name: 'Polygon',
      enabled: true,
      apiKeyConfigured: !!process.env.POLYGON_API_KEY,
      endpoints: ['financials', 'quote', 'aggregates']
    },
    {
      name: 'Finnhub',
      enabled: true,
      apiKeyConfigured: !!process.env.FINNHUB_API_KEY,
      endpoints: ['quote', 'news']
    },
    {
      name: 'FRED',
      enabled: true,
      apiKeyConfigured: !!process.env.FRED_API_KEY,
      endpoints: ['economic-data']
    }
  ];
}

export function checkProviderHealth(): Record<string, boolean> {
  const providers = getDataProviders();
  const health: Record<string, boolean> = {};
  
  for (const provider of providers) {
    health[provider.name] = provider.enabled && provider.apiKeyConfigured;
  }
  
  return health;
}
