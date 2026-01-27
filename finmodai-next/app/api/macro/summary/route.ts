import { NextResponse } from 'next/server';
import { fetchFredLatest, fetchFredSeries } from '@/lib/providers/macro/fred';
import { ProviderError } from '@/lib/providers/errors';
import { cached } from '@/lib/cache';

export const runtime = 'nodejs';

type MacroPoint = { value: number | null; date: string | null; series: string };
type MacroPointWithUnit = MacroPoint & { unit: string };

const seriesMap = {
  inflation: 'CPIAUCSL',
  unemployment: 'UNRATE',
  fedFunds: 'FEDFUNDS',
} as const;

const toPoint = (series: string, value: number | null, date: string | null, unit = '%'): MacroPointWithUnit => ({
  value,
  date,
  series,
  unit,
});

const latestDate = (points: MacroPoint[]) => {
  const timestamps = points
    .map((point) => (point.date ? Date.parse(point.date) : NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
};

export async function GET() {
  if (process.env.NODE_ENV !== 'production' || process.env.MACRO_DEBUG_KEYS === '1') {
    console.log('[MACRO_KEYS]', {
      FRED: !!process.env.FRED_API_KEY,
      DATABENTO: !!process.env.DATABENTO_API_KEY,
      WEBZ: !!process.env.WEBZ_API_KEY,
      WEBZIO: !!process.env.WEBZIO_API_KEY,
      OPENAI: !!process.env.OPENAI_API_KEY,
      FINNHUB: !!process.env.FINNHUB_API_KEY,
      POLYGON: !!process.env.POLYGON_API_KEY,
    });
  }

  const cacheKey = 'macro:summary';
  const ttlMs = 15 * 60 * 1000;

  try {
    const { value, stale } = await cached(
      cacheKey,
      ttlMs,
      async (): Promise<{ source: string; updatedAt: string; data: any; warnings: string[] }> => {
        const warnings: string[] = [];
        const results = await Promise.allSettled([
          fetchFredSeries(seriesMap.inflation, 25),
          fetchFredLatest(seriesMap.unemployment),
          fetchFredLatest(seriesMap.fedFunds),
        ]);

        const [inflationResult, unemploymentResult, fedFundsResult] = results;

        const inflation =
          inflationResult.status === 'fulfilled' && Array.isArray(inflationResult.value) && inflationResult.value.length
            ? (() => {
                const latest = inflationResult.value[0];
                const yearAgo = inflationResult.value[12];
                if (
                  latest?.value != null &&
                  yearAgo?.value != null &&
                  Number.isFinite(latest.value) &&
                  Number.isFinite(yearAgo.value) &&
                  yearAgo.value !== 0
                ) {
                  const yoy = ((latest.value / yearAgo.value) - 1) * 100;
                  return toPoint(seriesMap.inflation, Number.isFinite(yoy) ? yoy : null, latest.date, '%');
                }
                if (latest?.value != null) {
                  warnings.push('cpi_yoy_unavailable');
                  return toPoint(seriesMap.inflation, latest.value, latest.date, 'index');
                }
                return toPoint(seriesMap.inflation, null, null, '%');
              })()
            : toPoint(seriesMap.inflation, null, null, '%');
        if (inflation.value == null) warnings.push('inflation_unavailable');

        const unemployment =
          unemploymentResult.status === 'fulfilled' && unemploymentResult.value
            ? toPoint(seriesMap.unemployment, unemploymentResult.value.value, unemploymentResult.value.date, '%')
            : toPoint(seriesMap.unemployment, null, null, '%');
        if (unemployment.value == null) warnings.push('unemployment_unavailable');

        const fedFunds =
          fedFundsResult.status === 'fulfilled' && fedFundsResult.value
            ? toPoint(seriesMap.fedFunds, fedFundsResult.value.value, fedFundsResult.value.date, '%')
            : toPoint(seriesMap.fedFunds, null, null, '%');
        if (fedFunds.value == null) warnings.push('fed_funds_unavailable');

        if (results.some((res) => res.status === 'rejected' && res.reason instanceof ProviderError)) {
          warnings.push('fred_unavailable');
        }

        const data = { inflation, unemployment, fedFunds };
        const updatedAt = latestDate([inflation, unemployment, fedFunds]);
        const source = warnings.length >= 3 ? 'fallback' : 'fred';
        return { source, updatedAt, data, warnings };
      }
    );

    const warnings = Array.isArray(value?.warnings) ? [...value.warnings] : [];
    if (stale) warnings.push('stale_cache');
    return NextResponse.json({ ...value, warnings: Array.from(new Set(warnings)) });
  } catch {
    return NextResponse.json({
      source: 'fallback',
      updatedAt: new Date().toISOString(),
      data: {
        inflation: toPoint(seriesMap.inflation, null, null, '%'),
        unemployment: toPoint(seriesMap.unemployment, null, null, '%'),
        fedFunds: toPoint(seriesMap.fedFunds, null, null, '%'),
      },
      warnings: ['summary_unavailable'],
    });
  }
}
