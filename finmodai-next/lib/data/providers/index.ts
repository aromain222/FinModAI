import { featureFlags, serverEnv } from '@/lib/env/server';

export interface DataProvider {
  name: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  endpoints: string[];
}

export function getDataProviders(): DataProvider[] {
  return [
    { name: 'Polygon', enabled: featureFlags.ENABLE_POLYGON, apiKeyConfigured: !!serverEnv.POLYGON_API_KEY, endpoints: ['quote'] },
    { name: 'Finnhub', enabled: featureFlags.ENABLE_FINNHUB, apiKeyConfigured: !!serverEnv.FINNHUB_API_KEY, endpoints: ['quote', 'fundamentals'] },
    { name: 'TwelveData', enabled: featureFlags.ENABLE_TWELVEDATA, apiKeyConfigured: !!(serverEnv.TWELVEDATA_API_KEY || serverEnv.TWELVE_DATA_API_KEY), endpoints: ['quote'] },
    { name: 'Marketstack', enabled: featureFlags.ENABLE_MARKETSTACK, apiKeyConfigured: !!serverEnv.MARKETSTACK_API_KEY, endpoints: ['quote'] },
    { name: 'Tiingo', enabled: featureFlags.ENABLE_TIINGO, apiKeyConfigured: !!serverEnv.TIINGO_API_KEY, endpoints: ['quote', 'fundamentals'] },
    { name: 'NasdaqDataLink', enabled: featureFlags.ENABLE_NASDAQ_DATALINK, apiKeyConfigured: !!serverEnv.NASDAQ_DATA_LINK_API_KEY, endpoints: ['quote'] },
    { name: 'SEC EDGAR', enabled: featureFlags.ENABLE_SEC, apiKeyConfigured: !!serverEnv.SEC_UA_EMAIL, endpoints: ['companyfacts'] },
    { name: 'FRED', enabled: featureFlags.ENABLE_FRED, apiKeyConfigured: !!serverEnv.FRED_API_KEY, endpoints: ['series'] },
    { name: 'FastTrack', enabled: featureFlags.ENABLE_FASTTRACK, apiKeyConfigured: !!serverEnv.FASTRACK_API_KEY, endpoints: ['quote'] },
    { name: 'Webz', enabled: featureFlags.ENABLE_WEBZ, apiKeyConfigured: !!serverEnv.WEBZ_API_KEY, endpoints: ['news'] },
    { name: 'Massive', enabled: featureFlags.ENABLE_MASSIVE, apiKeyConfigured: !!serverEnv.MASSIVE_API_KEY, endpoints: ['unknown'] },
    { name: 'Databento', enabled: featureFlags.ENABLE_DATABENTO, apiKeyConfigured: !!serverEnv.DATABENTO_API_KEY, endpoints: ['market-data'] },
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
