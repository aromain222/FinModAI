import type { NormalizedQuote, NormalizedFundamentals, NormalizedComps } from './types';
import type { ProviderResult } from './providers/types';
import { fetchPolygonQuote } from './providers/polygon';
import { fetchFinnhubFundamentals, fetchFinnhubQuote } from './providers/finnhub';
import { fetchTwelveDataQuote } from './providers/twelvedata';
import { fetchMarketstackQuote } from './providers/marketstack';
import { fetchTiingoQuote, fetchTiingoFundamentals } from './providers/tiingo';
import { fetchNasdaqDatalinkQuote, fetchNasdaqDatalinkFundamentals } from './providers/nasdaqDatalink';
import { fetchSecEdgarFundamentals } from './providers/secEdgar';
import { identifyPeers } from '@/lib/identifyPeers';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { getDemoFundamentals, getDemoQuote, getDemoTickers } from '@/lib/data/providers/demoProvider';

type FieldResolution<T> = {
  value: T | null;
  provider: string | null;
};

function applyProvider<T>(
  result: ProviderResult<any>,
  provider: string,
  picker: (data: any) => T | null,
  warnings: string[]
): FieldResolution<T> {
  if (!result.ok) {
    warnings.push(`${provider}: ${result.error.message}`);
    return { value: null, provider: null };
  }
  const value = picker(result.data);
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return { value: null, provider: null };
  }
  return { value, provider };
}

export async function fetchNormalizedQuote(ticker: string): Promise<{ quote: NormalizedQuote; missingFields: string[]; warnings: string[] }> {
  if (isDemoMode()) {
    const quote = await getDemoQuote(ticker);
    const resolvedQuote: NormalizedQuote = quote ?? {
      ticker,
      price: null,
      asOf: null,
      currency: 'USD',
      marketCap: null,
      sharesOutstanding: null,
      provenance: {},
      source: 'demo_snapshots',
    };
    const missingFields: string[] = [];
    if (resolvedQuote.price === null) missingFields.push('price');
    if (resolvedQuote.marketCap === null) missingFields.push('marketCap');
    if (resolvedQuote.sharesOutstanding === null) missingFields.push('sharesOutstanding');
    return { quote: resolvedQuote, missingFields, warnings: [] };
  }

  throw new Error('Demo mode is required; live quote providers are disabled.');

  const warnings: string[] = [];
  const provenance: Record<string, string> = {};

  const polygonQuote = await fetchPolygonQuote(ticker);
  const finnhubQuote = await fetchFinnhubQuote(ticker);
  const twelveQuote = await fetchTwelveDataQuote(ticker);
  const marketstackQuote = await fetchMarketstackQuote(ticker);
  const tiingoQuote = await fetchTiingoQuote(ticker);
  const nasdaqQuote = await fetchNasdaqDatalinkQuote(ticker);

  const priceCandidates: Array<{ provider: string; result: ProviderResult<any>; pick: (data: any) => number | null; asOfPick: (data: any) => string | null }> = [
    { provider: 'polygon', result: polygonQuote, pick: (d) => d?.price ?? null, asOfPick: (d) => d?.asOf ?? null },
    { provider: 'finnhub', result: finnhubQuote, pick: (d) => d?.price ?? null, asOfPick: (d) => d?.asOf ?? null },
    { provider: 'twelvedata', result: twelveQuote, pick: (d) => d?.price ?? null, asOfPick: (d) => d?.asOf ?? null },
    { provider: 'marketstack', result: marketstackQuote, pick: (d) => d?.price ?? null, asOfPick: (d) => d?.asOf ?? null },
    { provider: 'tiingo', result: tiingoQuote, pick: (d) => d?.price ?? null, asOfPick: (d) => d?.asOf ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqQuote, pick: (d) => d?.price ?? null, asOfPick: (d) => d?.asOf ?? null },
  ];

  let price: number | null = null;
  let asOf: string | null = null;
  for (const candidate of priceCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      price = resolved.value;
      provenance.price = candidate.provider;
      asOf = candidate.asOfPick(candidate.result.ok ? (candidate.result as any).data : null);
      break;
    }
  }

  const finnhubFundamentals = await fetchFinnhubFundamentals(ticker);
  const tiingoFundamentals = await fetchTiingoFundamentals(ticker);
  const nasdaqFundamentals = await fetchNasdaqDatalinkFundamentals(ticker);

  let sharesOutstanding: number | null = null;
  let marketCap: number | null = null;

  const sharesCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.sharesOutstanding ?? null },
    { provider: 'polygon', result: polygonQuote, pick: (_: any) => null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.sharesOutstanding ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.sharesOutstanding ?? null },
  ];

  for (const candidate of sharesCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      sharesOutstanding = resolved.value;
      provenance.sharesOutstanding = candidate.provider;
      break;
    }
  }

  const marketCapCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.marketCap ?? null },
    { provider: 'polygon', result: polygonQuote, pick: (_: any) => null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.marketCap ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.marketCap ?? null },
  ];

  for (const candidate of marketCapCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      marketCap = resolved.value;
      provenance.marketCap = candidate.provider;
      break;
    }
  }

  if (marketCap === null && price !== null && sharesOutstanding !== null) {
    marketCap = price! * sharesOutstanding!;
    provenance.marketCap = provenance.price || 'derived';
  }

  const missingFields = [];
  if (price === null) missingFields.push('price');
  if (marketCap === null) missingFields.push('marketCap');
  if (sharesOutstanding === null) missingFields.push('sharesOutstanding');

  return {
    quote: {
      ticker,
      price,
      asOf,
      currency: 'USD',
      marketCap,
      sharesOutstanding,
      provenance,
    },
    missingFields,
    warnings,
  };
}

export async function fetchNormalizedFundamentals(
  ticker: string
): Promise<{ fundamentals: NormalizedFundamentals; missingFields: string[]; warnings: string[] }> {
  if (isDemoMode()) {
    const fundamentals = await getDemoFundamentals(ticker);
    const resolvedFundamentals: NormalizedFundamentals = fundamentals ?? {
      ticker,
      revenueLTM: null,
      ebitdaLTM: null,
      netIncomeLTM: null,
      cash: null,
      totalDebt: null,
      provenance: {},
      source: 'demo_snapshots',
    };
    const missingFields: string[] = [];
    if (resolvedFundamentals.revenueLTM === null) missingFields.push('revenueLTM');
    if (resolvedFundamentals.ebitdaLTM === null) missingFields.push('ebitdaLTM');
    if (resolvedFundamentals.netIncomeLTM === null) missingFields.push('netIncomeLTM');
    if (resolvedFundamentals.cash === null) missingFields.push('cash');
    if (resolvedFundamentals.totalDebt === null) missingFields.push('totalDebt');
    return { fundamentals: resolvedFundamentals, missingFields, warnings: [] };
  }

  throw new Error('Demo mode is required; live fundamentals providers are disabled.');

  const warnings: string[] = [];
  const provenance: Record<string, string> = {};

  const finnhubFundamentals = await fetchFinnhubFundamentals(ticker);
  const tiingoFundamentals = await fetchTiingoFundamentals(ticker);
  const nasdaqFundamentals = await fetchNasdaqDatalinkFundamentals(ticker);
  const secFundamentals = await fetchSecEdgarFundamentals(ticker);

  const revenueCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.revenueLTM ?? null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.revenueLTM ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.revenueLTM ?? null },
    { provider: 'sec_edgar', result: secFundamentals, pick: (d: any) => d?.revenueLTM ?? null },
  ];
  let revenueLTM: number | null = null;
  for (const candidate of revenueCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      revenueLTM = resolved.value;
      provenance.revenueLTM = candidate.provider;
      break;
    }
  }

  const ebitdaCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.ebitdaLTM ?? null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.ebitdaLTM ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.ebitdaLTM ?? null },
  ];
  let ebitdaLTM: number | null = null;
  for (const candidate of ebitdaCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      ebitdaLTM = resolved.value;
      provenance.ebitdaLTM = candidate.provider;
      break;
    }
  }

  const netIncomeCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.netIncomeLTM ?? null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.netIncomeLTM ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.netIncomeLTM ?? null },
    { provider: 'sec_edgar', result: secFundamentals, pick: (d: any) => d?.netIncomeLTM ?? null },
  ];
  let netIncomeLTM: number | null = null;
  for (const candidate of netIncomeCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      netIncomeLTM = resolved.value;
      provenance.netIncomeLTM = candidate.provider;
      break;
    }
  }

  const cashCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.cash ?? null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.cash ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.cash ?? null },
    { provider: 'sec_edgar', result: secFundamentals, pick: (d: any) => d?.cash ?? null },
  ];
  let cash: number | null = null;
  for (const candidate of cashCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      cash = resolved.value;
      provenance.cash = candidate.provider;
      break;
    }
  }

  const debtCandidates = [
    { provider: 'finnhub', result: finnhubFundamentals, pick: (d: any) => d?.totalDebt ?? null },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (d: any) => d?.totalDebt ?? null },
    { provider: 'nasdaq_datalink', result: nasdaqFundamentals, pick: (d: any) => d?.totalDebt ?? null },
    { provider: 'sec_edgar', result: secFundamentals, pick: (d: any) => d?.totalDebt ?? null },
  ];
  let totalDebt: number | null = null;
  for (const candidate of debtCandidates) {
    const resolved = applyProvider<number>(candidate.result, candidate.provider, candidate.pick, warnings);
    if (resolved.value !== null) {
      totalDebt = resolved.value;
      provenance.totalDebt = candidate.provider;
      break;
    }
  }

  const missingFields = [];
  if (revenueLTM === null) missingFields.push('revenueLTM');
  if (ebitdaLTM === null) missingFields.push('ebitdaLTM');
  if (netIncomeLTM === null) missingFields.push('netIncomeLTM');
  if (cash === null) missingFields.push('cash');
  if (totalDebt === null) missingFields.push('totalDebt');

  return {
    fundamentals: {
      ticker,
      revenueLTM,
      ebitdaLTM,
      netIncomeLTM,
      cash,
      totalDebt,
      provenance,
    },
    missingFields,
    warnings,
  };
}

export async function fetchNormalizedComps(ticker: string): Promise<{ comps: NormalizedComps; warnings: string[] }> {
  const warnings: string[] = [];
  let peers: string[] = [];
  try {
    if (isDemoMode()) {
      const demoTickers = await getDemoTickers();
      const clean = ticker.toUpperCase();
      peers = demoTickers.filter((item) => item !== clean);
    } else {
      const peerResult = await identifyPeers(ticker);
      peers = peerResult?.peers || [];
    }
  } catch (err: any) {
    warnings.push(`peer_selection_failed: ${err?.message || 'unknown error'}`);
  }

  const peerRows = await Promise.all(
    peers.map(async (peer) => {
      const [quoteRes, fundamentalsRes] = await Promise.all([
        fetchNormalizedQuote(peer),
        fetchNormalizedFundamentals(peer),
      ]);

      const marketCap = quoteRes.quote.marketCap ?? null;
      const cash = fundamentalsRes.fundamentals.cash ?? null;
      const totalDebt = fundamentalsRes.fundamentals.totalDebt ?? null;
      const enterpriseValue =
        marketCap !== null && cash !== null && totalDebt !== null
          ? marketCap + totalDebt - cash
          : null;

      const revenueLTM = fundamentalsRes.fundamentals.revenueLTM ?? null;
      const ebitdaLTM = fundamentalsRes.fundamentals.ebitdaLTM ?? null;
      const netIncomeLTM = fundamentalsRes.fundamentals.netIncomeLTM ?? null;

      const multiples = {
        evToRevenue: enterpriseValue !== null && revenueLTM && revenueLTM > 0 ? enterpriseValue / revenueLTM : null,
        evToEbitda: enterpriseValue !== null && ebitdaLTM && ebitdaLTM > 0 ? enterpriseValue / ebitdaLTM : null,
        pe: marketCap !== null && netIncomeLTM && netIncomeLTM > 0 ? marketCap / netIncomeLTM : null,
      };

      return {
        ticker: peer,
        companyName: null,
        marketCap,
        enterpriseValue,
        revenueLTM,
        ebitdaLTM,
        netIncomeLTM,
        multiples,
        provenance: {
          ...quoteRes.quote.provenance,
          ...fundamentalsRes.fundamentals.provenance,
          enterpriseValue: enterpriseValue !== null ? 'derived' : 'missing',
        },
      };
    })
  );

  return {
    comps: {
      ticker,
      peers: peerRows,
    },
    warnings,
  };
}
