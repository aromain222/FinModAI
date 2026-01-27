import { fetchWebzNews } from '@/lib/providers/news/webz';
import { keysPresent } from '@/lib/env/server';
import { classifySentiment, detectRegion, type Region } from '@/lib/macro/sentiment';
import { dedupeItems, filterMacroItems, normalizeDate, type MacroNewsItem } from '@/lib/macro/normalize';
import type { HeadlinesResult } from '@/lib/providers/types';
import { toErrorText } from '@/lib/providers/utils';

type Range = '1D' | '1W' | '1M';

const rangeDays: Record<Range, number> = { '1D': 1, '1W': 7, '1M': 30 };

const regionQuery: Record<Region, string> = {
  global: '',
  us: 'US OR United States OR Fed OR Treasury',
  europe: 'Eurozone OR ECB OR Europe OR UK OR BoE',
  asia: 'China OR Japan OR Asia OR BoJ OR RBI',
};

const baseQuery =
  'inflation OR CPI OR unemployment OR central bank OR interest rates OR GDP OR recession OR yields OR oil OR credit';

const filterByWindow = (items: MacroNewsItem[], range: Range) => {
  const cutoff = Date.now() - rangeDays[range] * 24 * 60 * 60 * 1000;
  return items.filter((item) => Date.parse(item.publishedAt) >= cutoff);
};

export async function getHeadlines(params: {
  range: Range;
  region: string;
  sentiment?: 'all' | 'bullish' | 'neutral' | 'bearish';
  traceId: string;
}): Promise<HeadlinesResult> {
  if (!keysPresent.webz) {
    return {
      status: 'missing_key',
      source: 'Webz.io',
      asOf: new Date().toISOString(),
      data: { items: [] },
      errors: ['WEBZIO_API_KEY / WEBZ_API_KEY missing'],
    };
  }

  const region = (params.region || 'global').toLowerCase() as Region;
  const query = [baseQuery, regionQuery[region] || ''].filter(Boolean).join(' OR ');

  try {
    const items = await fetchWebzNews({ query, size: 25, traceId: params.traceId });
    const normalized: MacroNewsItem[] = items.map((item) => {
      const summary = item.summary || '';
      const text = `${item.title} ${summary}`;
      return {
        id: item.id,
        title: item.title,
        source: item.source || 'Webz.io',
        url: item.url || undefined,
        publishedAt: normalizeDate(item.publishedAt),
        summary,
        tags: item.topics || [],
        region: detectRegion(text),
        sentiment: classifySentiment(text),
      };
    });

    const filtered = filterMacroItems(normalized);
    const fallback = filtered.length >= 3 ? filtered : normalized;
    const windowed = filterByWindow(fallback, params.range);
    const regioned = region === 'global' ? windowed : windowed.filter((item) => item.region === region);
    const deduped = dedupeItems(regioned);

    if (!deduped.length) {
      return {
        status: 'error',
        source: 'Webz.io',
        asOf: new Date().toISOString(),
        data: { items: [] },
        errors: ['Webz.io returned no headlines'],
      };
    }

    const sentiment = params.sentiment && params.sentiment !== 'all' ? params.sentiment : null;
    const filteredSentiment = sentiment ? deduped.filter((item) => item.sentiment === sentiment) : deduped;

    return {
      status: 'ok',
      source: 'Webz.io',
      asOf: filteredSentiment[0]?.publishedAt ?? new Date().toISOString(),
      data: { items: filteredSentiment },
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'Webz.io',
      asOf: new Date().toISOString(),
      data: { items: [] },
      errors: [toErrorText(error)],
    };
  }
}
