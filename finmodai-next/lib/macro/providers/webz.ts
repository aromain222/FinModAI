import { fetchWebzNews } from '@/lib/providers/news/webz';
import { classifyImpact, classifySentiment, detectRegion, type Region } from '@/lib/macro/sentiment';
import { dedupeItems, filterMacroItems, normalizeDate, type MacroNewsItem } from '@/lib/macro/normalize';

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

export async function fetchWebzMacroNews(params: {
  range: Range;
  region: Region;
  limit: number;
  traceId: string;
}): Promise<MacroNewsItem[]> {
  const query = [baseQuery, regionQuery[params.region]].filter(Boolean).join(' OR ');
  const items = await fetchWebzNews({ query, size: params.limit, traceId: params.traceId });

  const normalized: MacroNewsItem[] = items.map((item) => {
    const summary = item.summary || '';
    const text = `${item.title} ${summary}`;
    const region = detectRegion(text);
    return {
      id: item.id,
      title: item.title,
      source: item.source,
      url: item.url || undefined,
      publishedAt: normalizeDate(item.publishedAt),
      summary,
      tags: item.topics || [],
      region,
      sentiment: classifySentiment(text),
      impact: classifyImpact(text),
    };
  });

  const filtered = filterMacroItems(normalized);
  const fallback = filtered.length >= 3 ? filtered : normalized;
  const windowed = filterByWindow(fallback, params.range);
  const regioned = params.region === 'global' ? windowed : windowed.filter((item) => item.region === params.region);

  return dedupeItems(regioned);
}
