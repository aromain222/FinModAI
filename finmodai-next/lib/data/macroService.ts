import { getCache, setCache } from '@/lib/cache/memory';
import { MacroEvent, MacroSnapshot, MacroSummary } from '@/lib/schemas/macro';
import { fetchFredLatest, fetchFredSeries } from '@/lib/providers/macro/fred';
import { fetchGdeltHeadlines } from '@/lib/providers/news/gdelt';
import { ProviderError } from '@/lib/providers/errors';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const impactFromTitle = (title: string): 'low' | 'med' | 'high' => {
  const lower = title.toLowerCase();
  if (lower.includes('crisis') || lower.includes('war') || lower.includes('recession')) return 'high';
  if (lower.includes('inflation') || lower.includes('jobs') || lower.includes('rate')) return 'med';
  return 'low';
};

export async function getMacroSnapshot(params: { traceId: string }) {
  const cacheKey = 'macro:snapshot';
  const cached = getCache<{ data: MacroSnapshot; providerUsed: string }>(cacheKey);

  try {
    const [cpiSeries, unemployment, fedFunds, gdp, yield10y, yield2y, dxy] = await Promise.all([
      fetchFredSeries('CPIAUCSL', 25).catch(() => []),
      fetchFredLatest('UNRATE'),
      fetchFredLatest('FEDFUNDS'),
      fetchFredLatest('GDP'),
      fetchFredLatest('DGS10'),
      fetchFredLatest('DGS2'),
      fetchFredLatest('DTWEXBGS'),
    ]);

    const latestCpi = cpiSeries[0]?.value;
    const yearAgoCpi = cpiSeries[12]?.value;
    const inflationYoY =
      typeof latestCpi === 'number' &&
      Number.isFinite(latestCpi) &&
      typeof yearAgoCpi === 'number' &&
      Number.isFinite(yearAgoCpi) &&
      yearAgoCpi !== 0
        ? ((latestCpi / yearAgoCpi) - 1) * 100
        : undefined;

    const data: MacroSnapshot = {
      asOf: new Date().toISOString(),
      inflation: typeof inflationYoY === 'number' && Number.isFinite(inflationYoY) ? inflationYoY : latestCpi,
      unemployment: unemployment?.value,
      fedFunds: fedFunds?.value,
      gdp: gdp?.value,
      yield10y: yield10y?.value,
      yield2y: yield2y?.value,
      dxy: dxy?.value,
    };

    setCache(cacheKey, { data, providerUsed: 'fred' }, 60 * 60 * 1000);
    return { data, meta: { asOf: data.asOf, providerUsed: 'fred', stale: false, traceId: params.traceId } };
  } catch (err) {
    if (cached) {
      return {
        data: cached.value.data,
        meta: { asOf: cached.value.data.asOf, providerUsed: cached.value.providerUsed, stale: true, traceId: params.traceId },
      };
    }
    if (err instanceof ProviderError && err.code === 'NOT_CONFIGURED') {
      return { data: { asOf: new Date().toISOString() }, meta: { asOf: new Date().toISOString(), providerUsed: err.provider, stale: true, traceId: params.traceId } };
    }
    throw err;
  }
}

export async function getMacroEvents(params: { traceId: string; limit: number }) {
  const cacheKey = `macro:events:${params.limit}`;
  const cached = getCache<{ data: MacroEvent[]; providerUsed: string }>(cacheKey);

  try {
    const query = 'inflation OR unemployment OR central bank OR interest rates OR GDP OR recession';
    const headlines = await fetchGdeltHeadlines({ query, limit: params.limit, traceId: params.traceId });
    const data: MacroEvent[] = headlines.map((h) => ({
      title: h.title,
      country: 'US',
      date: h.publishedAt,
      impact: impactFromTitle(h.title),
      sourceUrl: h.url || 'https://api.gdeltproject.org',
      description: h.summary,
    }));
    setCache(cacheKey, { data, providerUsed: 'gdelt' }, 6 * 60 * 60 * 1000);
    return { data, meta: { asOf: new Date().toISOString(), providerUsed: 'gdelt', stale: false, traceId: params.traceId } };
  } catch (err) {
    if (cached) {
      return { data: cached.value.data, meta: { asOf: new Date().toISOString(), providerUsed: cached.value.providerUsed, stale: true, traceId: params.traceId } };
    }
    throw err;
  }
}

export async function getMacroSummary(params: { traceId: string; snapshot: MacroSnapshot; sources: { name: string; url: string }[] }) {
  const asOf = new Date().toISOString();
  if (!openai) {
    const inflationText =
      typeof params.snapshot.inflation === 'number'
        ? params.snapshot.inflation > 50
          ? `CPI index ${params.snapshot.inflation.toFixed(2)}`
          : `inflation ${params.snapshot.inflation.toFixed(2)}%`
        : null;
    const unemploymentText =
      typeof params.snapshot.unemployment === 'number' ? `unemployment ${params.snapshot.unemployment.toFixed(2)}%` : null;
    const fedFundsText =
      typeof params.snapshot.fedFunds === 'number' ? `fed funds ${params.snapshot.fedFunds.toFixed(2)}%` : null;
    const yieldText = typeof params.snapshot.yield10y === 'number' ? `10Y ${params.snapshot.yield10y.toFixed(2)}%` : null;

    const bullet1 = [inflationText, unemploymentText].filter(Boolean).join('; ') || 'Macro snapshot unavailable.';
    const bullet2 = [fedFundsText, yieldText].filter(Boolean).join('; ') || 'Rates snapshot unavailable.';

    return {
      data: {
        bullets: [
          bullet1,
          bullet2,
        ],
        risks:
          typeof params.snapshot.inflation === 'number' ||
          typeof params.snapshot.unemployment === 'number' ||
          typeof params.snapshot.fedFunds === 'number'
            ? []
            : ['Macro data coverage incomplete.'],
        opportunities: [],
        asOf,
        sources: params.sources,
      } as MacroSummary,
      meta: { asOf, providerUsed: 'deterministic', stale: false, traceId: params.traceId },
    };
  }

  const prompt = `Summarize macro snapshot for an institutional reader.
Inflation: ${typeof params.snapshot.inflation === 'number' ? params.snapshot.inflation.toFixed(2) : 'unavailable'}
Unemployment: ${typeof params.snapshot.unemployment === 'number' ? params.snapshot.unemployment.toFixed(2) : 'unavailable'}
Fed Funds: ${typeof params.snapshot.fedFunds === 'number' ? params.snapshot.fedFunds.toFixed(2) : 'unavailable'}
10Y: ${typeof params.snapshot.yield10y === 'number' ? params.snapshot.yield10y.toFixed(2) : 'unavailable'}
2Y: ${typeof params.snapshot.yield2y === 'number' ? params.snapshot.yield2y.toFixed(2) : 'unavailable'}
DXY: ${typeof params.snapshot.dxy === 'number' ? params.snapshot.dxy.toFixed(2) : 'unavailable'}
Return JSON with bullets[], risks[], opportunities[] (max 3 each).`;

  try {
    const resp = await openai.responses.create({
      model: 'gpt-5.2-mini',
      temperature: 0,
      text: { format: { type: 'json_object' } },
      input: [{ role: 'user', content: prompt }],
    });
    const parsed = JSON.parse(resp.output_text ?? '{}');
    const data: MacroSummary = {
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      asOf,
      sources: params.sources,
    };
    return { data, meta: { asOf, providerUsed: 'openai', stale: false, traceId: params.traceId } };
  } catch {
    const data: MacroSummary = {
      bullets: ['Macro summary unavailable; fallback to snapshot values.'],
      risks: [],
      opportunities: [],
      asOf,
      sources: params.sources,
    };
    return { data, meta: { asOf, providerUsed: 'fallback', stale: false, traceId: params.traceId } };
  }
}
