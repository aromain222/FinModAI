import { NextRequest, NextResponse } from 'next/server';
import { fetchMacroNewsLive, fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';

export const runtime = 'nodejs';

const clampRangeMacro = (value: string) => {
  const upper = value.toUpperCase();
  if (upper === '1D' || upper === '1W' || upper === '1M') return upper as '1D' | '1W' | '1M';
  return '1W';
};

const clampRangeMarket = (value: string) => {
  const upper = value.toUpperCase();
  if (upper === '1D' || upper === '1W' || upper === '1M' || upper === '1Y' || upper === '5Y') {
    return upper as '1D' | '1W' | '1M' | '1Y' | '5Y';
  }
  return '1W';
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const searchParams = request.nextUrl.searchParams;

  const rangeParam = searchParams.get('range') || '1W';
  const rangeMarket = clampRangeMarket(rangeParam);
  const rangeMacro = clampRangeMacro(rangeParam);
  const ticker = (searchParams.get('ticker') || 'SPY').trim().toUpperCase();
  const limit = Math.max(1, Math.min(10, Number(searchParams.get('limit') || 5)));

  const baseMarketQuery = 'stocks OR equities OR S&P 500 OR Nasdaq';
  const tickerQuery = ticker ? `${ticker} OR ${ticker.toUpperCase()}` : '';
  const marketQuery = [tickerQuery, baseMarketQuery].filter(Boolean).join(' OR ');

  const macroOverride = searchParams.get('q') || '';
  const baseMacroQuery = 'Federal Reserve OR inflation OR CPI OR unemployment OR rates OR tariffs OR war';
  const macroQuery = [macroOverride, baseMacroQuery].filter(Boolean).join(' OR ');

  const [market, macro] = await Promise.all([
    fetchMarketHeadlinesLive({ range: rangeMarket, ticker, query: marketQuery, limit, traceId }),
    fetchMacroNewsLive({ range: rangeMacro, query: macroQuery, limit, traceId }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      market: { source: market.source, providers: market.providers, counts: market.counts },
      macro: { source: macro.source, providers: macro.providers, counts: macro.counts },
    },
    meta: { fetchedAt: new Date().toISOString(), traceId },
  });
}
