import 'server-only';

import { getLTMFinancials } from '@/lib/getLTMFinancials';
import { getSector } from '@/lib/sectorMapping';

export interface CompanyProfile {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  subIndustry?: string;
  description?: string;
  marketCap?: number;
  revenueGrowth?: number;
  ebitdaMargin?: number;
  country?: string;
  isSubscription?: boolean;
  isMarketplace?: boolean;
  isMediaOrStreaming?: boolean;
  isFinancial?: boolean;
  isEnergyOrMaterials?: boolean;
  isRetail?: boolean;
}

type PolygonProfile = {
  name?: string;
  description?: string;
  sector?: string;
  industry?: string;
  subIndustry?: string;
  marketCap?: number;
  country?: string;
};

type FinnhubProfile = {
  name?: string;
  sector?: string;
  industry?: string;
  description?: string;
  marketCap?: number;
  country?: string;
};

const polygonProfileCache = new Map<string, Promise<PolygonProfile | null>>();
const finnhubProfileCache = new Map<string, Promise<FinnhubProfile | null>>();

export async function getCompanyProfile(
  ticker: string,
  options?: { lightweight?: boolean }
): Promise<CompanyProfile | null> {
  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    return null;
  }

  const polygonPromise = loadPolygonProfile(cleanTicker);
  const finnhubPromise = loadFinnhubProfile(cleanTicker);
  const ltmPromise = options?.lightweight
    ? Promise.resolve(null)
    : getLTMFinancials(cleanTicker).catch(() => null);

  const [polygon, finnhub, ltm] = await Promise.all([polygonPromise, finnhubPromise, ltmPromise]);

  if (!polygon && !finnhub && !ltm) {
    return null;
  }

  const fallbackSector = ltm ? getSector(cleanTicker, ltm.companyName) : undefined;

  const profile: CompanyProfile = {
    ticker: cleanTicker,
    name:
      polygon?.name ??
      finnhub?.name ??
      ltm?.companyName ??
      cleanTicker,
    sector: polygon?.sector ?? finnhub?.sector ?? fallbackSector,
    industry: polygon?.industry ?? finnhub?.industry,
    subIndustry: polygon?.subIndustry,
    description: polygon?.description ?? finnhub?.description,
    marketCap:
      polygon?.marketCap ??
      finnhub?.marketCap ??
      ltm?.marketCap,
    revenueGrowth: undefined,
    ebitdaMargin:
      ltm && ltm.revenue > 0 ? ltm.ebitda / ltm.revenue : undefined,
    country: polygon?.country ?? finnhub?.country,
  };

  const flags = detectBusinessFlags(profile);
  return { ...profile, ...flags };
}

async function loadPolygonProfile(ticker: string): Promise<PolygonProfile | null> {
  if (polygonProfileCache.has(ticker)) {
    return polygonProfileCache.get(ticker)!;
  }
  const promise = fetchPolygonProfile(ticker);
  polygonProfileCache.set(ticker, promise);
  return promise;
}

async function loadFinnhubProfile(ticker: string): Promise<FinnhubProfile | null> {
  if (finnhubProfileCache.has(ticker)) {
    return finnhubProfileCache.get(ticker)!;
  }
  const promise = fetchFinnhubProfile(ticker);
  finnhubProfileCache.set(ticker, promise);
  return promise;
}

async function fetchPolygonProfile(ticker: string): Promise<PolygonProfile | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const res = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const result = data?.results;
    if (!result) {
      return null;
    }
    const sector =
      typeof result.sic_description === 'string'
        ? result.sic_description.split('-')[0]?.trim()
        : result.sector;
    const locale =
      typeof result.locale === 'string' ? result.locale.toUpperCase() : undefined;
    return {
      name: result.name,
      description: result.description ?? result.short_description ?? undefined,
      sector,
      industry: result.industry ?? result.sic_description ?? undefined,
      subIndustry: result.sic_description ?? undefined,
      marketCap:
        typeof result.market_cap === 'number'
          ? result.market_cap / 1_000_000
          : undefined,
      country: locale,
    };
  } catch (error) {
    console.warn('[companyProfile] Polygon profile fetch failed', error);
    return null;
  }
}

async function fetchFinnhubProfile(ticker: string): Promise<FinnhubProfile | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return {
      name: data.name,
      sector: data.finnhubIndustry ?? data.industry,
      industry: data.finnhubIndustry ?? data.industry,
      description: data.description,
      marketCap:
        typeof data.marketCapitalization === 'number'
          ? data.marketCapitalization * 1_000
          : undefined,
      country: data.country,
    };
  } catch (error) {
    console.warn('[companyProfile] Finnhub profile fetch failed', error);
    return null;
  }
}

function detectBusinessFlags(
  profile: CompanyProfile
): Pick<
  CompanyProfile,
  | 'isSubscription'
  | 'isMarketplace'
  | 'isMediaOrStreaming'
  | 'isFinancial'
  | 'isEnergyOrMaterials'
  | 'isRetail'
> {
  const text = `${profile.description || ''} ${profile.industry || ''} ${profile.subIndustry || ''}`.toLowerCase();
  const sector = (profile.sector || '').toLowerCase();

  const has = (...patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

  const isMediaOrStreaming =
    has(/stream/, /media/, /music/, /audio/, /content/, /podcast/, /platform/, /video/) ||
    sector.includes('communication');

  const isSubscription =
    has(/subscription/, /recurring/, /saas/, /software as a service/, /cloud/) ||
    sector.includes('software');

  const isMarketplace = has(/marketplace/, /platform/, /booking/, /rideshare/, /delivery/);

  const isRetail =
    sector.includes('retail') ||
    has(/retail/, /store/, /apparel/, /wholesale/, /consumer staples/);

  const isEnergyOrMaterials =
    sector.includes('energy') ||
    sector.includes('materials') ||
    has(/oil/, /gas/, /chemical/, /mining/, /metals/);

  const isFinancial =
    sector.includes('financial') ||
    has(/bank/, /insurance/, /lending/, /fintech/, /broker/);

  return {
    isMediaOrStreaming,
    isSubscription,
    isMarketplace,
    isRetail,
    isEnergyOrMaterials,
    isFinancial,
  };
}
