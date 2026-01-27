import type { CompanyFinancials } from '@/types/compsModel';
import type { MacroNewsArticle } from '@/types/macro';
import type { EventItem } from '@/lib/market_data/providers/types';
import type { MarketSeries } from '@/lib/market/provider';
import type { SharesResult } from '@/lib/data/sharesOutstanding';
import type { GetModelDataParams, ModelDataRange, ModelDataResult } from '@/lib/data/modelDataTypes';

const RANGE: ModelDataRange = {
  start: '2024-01-01',
  end: '2025-01-01',
  marketRange: '1Y',
};

const FINANCIAL_FIXTURE: Record<string, CompanyFinancials> = {
  'SMOKE-LBO': {
    name: 'Smoke LBO Holdings',
    ticker: 'SMOKE-LBO',
    marketCap: 500,
    enterpriseValue: 720,
    cash: 90,
    revenue: 180,
    ebitda: 60,
    ebit: 50,
    netIncome: 35,
    shares: 30,
    price: 16.6,
    netDebt: 210,
    evToRevenue: 4,
    evToEbitda: 12,
    evToEbit: 14.4,
    pe: 14.3,
    source: 'custom',
  },
  'SMOKE-COMP': {
    name: 'Smoke Comparable Target',
    ticker: 'SMOKE-COMP',
    marketCap: 840,
    enterpriseValue: 950,
    cash: 70,
    revenue: 330,
    ebitda: 110,
    ebit: 90,
    netIncome: 75,
    shares: 45,
    price: 18.7,
    netDebt: 120,
    evToRevenue: 2.9,
    evToEbitda: 8.6,
    evToEbit: 10.6,
    pe: 11.2,
    source: 'custom',
  },
  'SMOKE-PEER1': {
    name: 'Smoke Peer Alpha',
    ticker: 'SMOKE-PEER1',
    marketCap: 610,
    enterpriseValue: 760,
    cash: 40,
    revenue: 200,
    ebitda: 80,
    ebit: 65,
    netIncome: 55,
    shares: 37,
    price: 16.5,
    netDebt: 150,
    evToRevenue: 3.8,
    evToEbitda: 9.5,
    evToEbit: 11.7,
    pe: 11.1,
    source: 'custom',
  },
  'SMOKE-PEER2': {
    name: 'Smoke Peer Beta',
    ticker: 'SMOKE-PEER2',
    marketCap: 720,
    enterpriseValue: 880,
    cash: 65,
    revenue: 260,
    ebitda: 95,
    ebit: 78,
    netIncome: 62,
    shares: 41,
    price: 17.6,
    netDebt: 105,
    evToRevenue: 3.4,
    evToEbitda: 9.3,
    evToEbit: 11.3,
    pe: 11.6,
    source: 'custom',
  },
  'SMOKE-MERGER-BUYER': {
    name: 'Smoke Buyer Plc',
    ticker: 'SMOKE-MERGER-BUYER',
    marketCap: 1250,
    enterpriseValue: 1380,
    cash: 200,
    revenue: 420,
    ebitda: 150,
    ebit: 130,
    netIncome: 110,
    shares: 55,
    price: 22.7,
    netDebt: 180,
    evToRevenue: 3.3,
    evToEbitda: 9.2,
    evToEbit: 10.6,
    pe: 11.4,
    source: 'custom',
  },
  'SMOKE-MERGER-TARGET': {
    name: 'Smoke Target Inc',
    ticker: 'SMOKE-MERGER-TARGET',
    marketCap: 540,
    enterpriseValue: 640,
    cash: 40,
    revenue: 190,
    ebitda: 70,
    ebit: 58,
    netIncome: 48,
    shares: 28,
    price: 19.3,
    netDebt: 110,
    evToRevenue: 3.4,
    evToEbitda: 9.1,
    evToEbit: 11.0,
    pe: 11.25,
    source: 'custom',
  },
};

const SHARES_FIXTURE: Record<string, SharesResult> = {
  'SMOKE-LBO': { success: true, sharesOutstandingMm: 30, source: 'smoke', confidence: 'high', warnings: [] },
  'SMOKE-COMP': { success: true, sharesOutstandingMm: 45, source: 'smoke', confidence: 'high', warnings: [] },
  'SMOKE-PEER1': { success: true, sharesOutstandingMm: 37, source: 'smoke', confidence: 'high', warnings: [] },
  'SMOKE-PEER2': { success: true, sharesOutstandingMm: 41, source: 'smoke', confidence: 'high', warnings: [] },
  'SMOKE-MERGER-BUYER': { success: true, sharesOutstandingMm: 55, source: 'smoke', confidence: 'high', warnings: [] },
  'SMOKE-MERGER-TARGET': { success: true, sharesOutstandingMm: 28, source: 'smoke', confidence: 'high', warnings: [] },
  DEFAULT: { success: true, sharesOutstandingMm: 32, source: 'smoke', confidence: 'medium', warnings: [] },
};

const PRICE_SERIES_POINTS = [
  { t: '2024-01-01T00:00:00Z', close: 100 },
  { t: '2024-06-01T00:00:00Z', close: 105 },
  { t: '2024-12-31T00:00:00Z', close: 110 },
];

const NEWS_FIXTURE: MacroNewsArticle[] = [
  {
    id: 'smoke-article-1',
    title: 'Smoke model baseline data initialized',
    source: 'Smoke Labs',
    publishedAt: new Date().toISOString(),
    url: 'https://example.com/smoke-news',
    summary: 'Deterministic fixture for model smoke tests.',
    aiInsight: 'Inputs align with validation guardrails.',
    sentiment: 'neutral',
  },
];

function buildSeries(ticker: string): MarketSeries {
  const points = PRICE_SERIES_POINTS.map((point, idx) => ({
    ...point,
    close: Math.round(point.close + ticker.length * idx),
  }));
  const startClose = points[0].close;
  const endClose = points[points.length - 1].close;
  const pctChange = Number.isFinite(startClose) && startClose !== 0 ? ((endClose - startClose) / startClose) * 100 : null;

  return {
    ticker,
    source: 'fallback',
    lastUpdatedISO: new Date().toISOString(),
    points,
    stats: {
      startClose,
      endClose,
      pctChange: Number.isFinite(pctChange) ? pctChange : null,
    },
  };
}

export function getSmokeModelData(params: GetModelDataParams): ModelDataResult {
  const normalizedPrimary = params.primaryTicker.trim().toUpperCase();
  const resolved = new Set<string>([normalizedPrimary]);
  const customPeers = Array.isArray(params.peerOptions?.customPeers)
    ? params.peerOptions.customPeers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)
    : [];

  customPeers.forEach((peer) => resolved.add(peer));
  (params.tickers ?? []).forEach((ticker) => {
    const normalized = ticker.trim().toUpperCase();
    if (normalized) resolved.add(normalized);
  });

  const finalTickers = Array.from(resolved);
  const prices: Record<string, MarketSeries> = {};
  const financials: Record<string, CompanyFinancials> = {};
  const shares: Record<string, SharesResult> = {};
  const filings: Record<string, EventItem[]> = {};

  finalTickers.forEach((ticker) => {
    prices[ticker] = buildSeries(ticker);
    financials[ticker] = FINANCIAL_FIXTURE[ticker] ?? FINANCIAL_FIXTURE['SMOKE-LBO'];
    shares[ticker] = SHARES_FIXTURE[ticker] ?? SHARES_FIXTURE.DEFAULT;
    filings[ticker] = [];
  });

  const peerList = customPeers.filter((peer) => peer !== normalizedPrimary);

  return {
    resolvedTickers: finalTickers,
    range: RANGE,
    prices,
    financials,
    shares,
    filings,
    peers: peerList.length > 0 ? { list: peerList, diagnostics: null } : undefined,
    news: NEWS_FIXTURE,
  };
}
