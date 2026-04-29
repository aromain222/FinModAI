import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ProviderKeyCheck = {
  provider: 'perigon' | 'polygon' | 'alphavantage' | 'benzinga' | 'eodhd' | 'newsapi' | 'finnhub';
  envNames: string[];
  hasKey: boolean;
};

type ProviderProbeResult = {
  provider: ProviderKeyCheck['provider'];
  status: 'ok' | 'missing_key' | 'http_error' | 'provider_error' | 'empty';
  httpStatus?: number;
  count?: number;
  message?: string;
};

const PROVIDERS: Array<{
  provider: ProviderKeyCheck['provider'];
  envNames: string[];
  buildUrl: (key: string) => string;
  parseCount: (payload: unknown) => number;
  parseErrorMessage?: (payload: unknown) => string | undefined;
}> = [
  {
    provider: 'perigon',
    envNames: ['PERIGON_API_KEY'],
    buildUrl: (key) =>
      `https://api.goperigon.com/v1/all?apiKey=${encodeURIComponent(key)}&q=${encodeURIComponent('Federal Reserve OR CPI OR inflation OR Treasury yields')}&sortBy=date&size=3`,
    parseCount: (payload) => {
      if (!payload || typeof payload !== 'object') return 0;
      const rows = (payload as { articles?: unknown[] }).articles;
      return Array.isArray(rows) ? rows.length : 0;
    },
  },
  {
    provider: 'benzinga',
    envNames: ['BENZINGA_API_KEY', 'BENZINGA_KEY'],
    buildUrl: (key) =>
      `https://api.benzinga.com/api/v2/news?token=${encodeURIComponent(key)}&channels=economics,markets,general&pageSize=3&displayOutput=full`,
    parseCount: (payload) => {
      if (!payload || typeof payload !== 'object') return 0;
      const obj = payload as { data?: unknown[]; articles?: unknown[] };
      if (Array.isArray(obj.data)) return obj.data.length;
      return Array.isArray(obj.articles) ? obj.articles.length : 0;
    },
  },
  {
    provider: 'eodhd',
    envNames: ['EODHD_API_KEY', 'EODHD_API', 'EOD_HISTORICAL_DATA_API_KEY'],
    buildUrl: (key) =>
      `https://eodhd.com/api/news?api_token=${encodeURIComponent(key)}&fmt=json&t=market&limit=3&offset=0`,
    parseCount: (payload) => (Array.isArray(payload) ? payload.length : 0),
    parseErrorMessage: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
      const maybeError = (payload as { error?: unknown }).error;
      return typeof maybeError === 'string' ? maybeError : undefined;
    },
  },
  {
    provider: 'newsapi',
    envNames: ['NEWS_API_KEY', 'NEWSAPI_KEY'],
    buildUrl: (key) =>
      `https://newsapi.org/v2/everything?apiKey=${encodeURIComponent(key)}&q=${encodeURIComponent('Federal Reserve OR CPI OR inflation OR Treasury yields')}&language=en&sortBy=publishedAt&pageSize=3`,
    parseCount: (payload) => {
      if (!payload || typeof payload !== 'object') return 0;
      const rows = (payload as { articles?: unknown[] }).articles;
      return Array.isArray(rows) ? rows.length : 0;
    },
    parseErrorMessage: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
      const maybeMessage = (payload as { message?: unknown }).message;
      return typeof maybeMessage === 'string' ? maybeMessage : undefined;
    },
  },
  {
    provider: 'polygon',
    envNames: ['POLYGON_API_KEY'],
    buildUrl: (key) =>
      `https://api.polygon.io/v2/reference/news?apiKey=${encodeURIComponent(key)}&limit=3&order=desc&sort=published_utc`,
    parseCount: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
      const rows = (payload as { results?: unknown[] }).results;
      return Array.isArray(rows) ? rows.length : 0;
    },
    parseErrorMessage: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
      const maybeError = (payload as { error?: unknown }).error;
      return typeof maybeError === 'string' ? maybeError : undefined;
    },
  },
  {
    provider: 'alphavantage',
    envNames: ['ALPHA_VANTAGE_API_KEY', 'ALPHAVANTAGE_API_KEY', 'ALPHA_VANTAGE'],
    buildUrl: (key) =>
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&limit=3&sort=LATEST&apikey=${encodeURIComponent(key)}`,
    parseCount: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
      const feed = (payload as { feed?: unknown[] }).feed;
      return Array.isArray(feed) ? feed.length : 0;
    },
    parseErrorMessage: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
      const p = payload as { Information?: unknown; Note?: unknown };
      if (typeof p.Information === 'string') return p.Information;
      if (typeof p.Note === 'string') return p.Note;
      return undefined;
    },
  },
  {
    provider: 'finnhub',
    envNames: ['FINNHUB_API_KEY'],
    buildUrl: (key) =>
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${encodeURIComponent(key)}`,
    parseCount: (payload) => (Array.isArray(payload) ? Math.min(payload.length, 99) : 0),
    parseErrorMessage: (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
      const maybeError = (payload as { error?: unknown }).error;
      return typeof maybeError === 'string' ? maybeError : undefined;
    },
  },
];

function readKey(envNames: string[]): string | undefined {
  for (const name of envNames) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

async function probeProvider(config: (typeof PROVIDERS)[number]): Promise<ProviderProbeResult> {
  const key = readKey(config.envNames);
  if (!key) {
    return { provider: config.provider, status: 'missing_key', message: `Missing ${config.envNames.join(' or ')}` };
  }

  try {
    const response = await fetch(config.buildUrl(key), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const raw = await response.text();
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const providerMessage = config.parseErrorMessage?.(parsed);

    if (!response.ok) {
      return {
        provider: config.provider,
        status: 'http_error',
        httpStatus: response.status,
        message: providerMessage ?? `HTTP ${response.status}`,
      };
    }

    if (providerMessage) {
      return {
        provider: config.provider,
        status: 'provider_error',
        httpStatus: response.status,
        message: providerMessage,
      };
    }

    const count = config.parseCount(parsed);
    if (count <= 0) {
      return {
        provider: config.provider,
        status: 'empty',
        httpStatus: response.status,
        count,
        message: 'Provider returned zero items for probe query',
      };
    }

    return { provider: config.provider, status: 'ok', httpStatus: response.status, count };
  } catch (error) {
    return {
      provider: config.provider,
      status: 'provider_error',
      message: error instanceof Error ? error.message : 'Unknown provider probe error',
    };
  }
}

export async function GET() {
  const keyChecks: ProviderKeyCheck[] = PROVIDERS.map((provider) => ({
    provider: provider.provider,
    envNames: provider.envNames,
    hasKey: Boolean(readKey(provider.envNames)),
  }));

  const probes = await Promise.all(PROVIDERS.map((provider) => probeProvider(provider)));
  const failing = probes.filter((probe) => probe.status !== 'ok');

  return NextResponse.json(
    {
      ok: true,
      keyChecks,
      probes,
      summary: {
        failingCount: failing.length,
        failingProviders: failing.map((item) => item.provider),
      },
      note: 'This endpoint never returns key values, only presence and probe outcomes.',
    },
    { status: 200 }
  );
}
