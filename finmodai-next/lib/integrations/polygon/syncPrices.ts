import { getSupabaseServiceClient } from '@/lib/events/store';
import { fetchJsonWithRetry } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import path from 'node:path';
import { runPythonJson } from '@/lib/integrations/python/runPythonJson';

export type PolygonPriceSyncSummary = {
  ticker: string;
  companyId: string | null;
  rowsUpserted: number;
  latestDate: string | null;
  warnings: string[];
};

type PolygonAgg = {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
};

type PolygonAggResponse = {
  results?: PolygonAgg[];
};

type YfinanceQuoteRow = {
  price?: number | null;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function syncPricesFromPolygon(ticker: string): Promise<PolygonPriceSyncSummary> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) throw new Error('Supabase service client is not configured');

  const apiKey = serverEnv.POLYGON_API_KEY;
  if (!apiKey) throw new Error('POLYGON_API_KEY is not configured');

  const normalizedTicker = ticker.trim().toUpperCase();
  const companyRow = await supabase.from('companies').select('id').eq('ticker', normalizedTicker).maybeSingle();
  if (!companyRow.data?.id) throw new Error(`Company ${normalizedTicker} must exist before syncing prices`);
  const companyId = companyRow.data.id;

  const to = new Date();
  const from = new Date(to.getTime() - 120 * 24 * 60 * 60 * 1000);
  const response = await fetchJsonWithRetry<PolygonAggResponse>({
    provider: 'polygon',
    url: `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(normalizedTicker)}/range/1/day/${formatDate(from)}/${formatDate(to)}?adjusted=true&sort=asc&apiKey=${apiKey}`,
    cacheKey: `polygon:aggs:${normalizedTicker}:${formatDate(from)}:${formatDate(to)}`,
    ttlMs: 15 * 60 * 1000,
  });

  if (!response.ok) {
    const yfinanceScript = path.join(process.cwd(), 'scripts/providers/yfinance_quote.py');
    const fallback = await runPythonJson<YfinanceQuoteRow>(yfinanceScript, [normalizedTicker]);
    const fallbackPrice = toNumber(fallback?.price);
    if (fallbackPrice !== null) {
      const today = formatDate(new Date());
      const row = {
        company_id: companyId,
        date: today,
        open: fallbackPrice,
        high: fallbackPrice,
        low: fallbackPrice,
        close: fallbackPrice,
        volume: null,
        source: 'yfinance',
      };
      const upsert = await (supabase.from('company_prices') as any).upsert(row, {
        onConflict: 'company_id,date',
      });
      if (upsert.error) {
        throw new Error(`Polygon price sync failed for ${normalizedTicker}: ${response.error.message}; yfinance fallback upsert failed: ${upsert.error.message}`);
      }
      return {
        ticker: normalizedTicker,
        companyId,
        rowsUpserted: 1,
        latestDate: today,
        warnings: [`Polygon price sync failed for ${normalizedTicker}: ${response.error.message}; used yfinance fallback.`],
      };
    }
    throw new Error(`Polygon price sync failed for ${normalizedTicker}: ${response.error.message}`);
  }

  const rows = (response.data.results ?? [])
    .map((item) => {
      if (!item.t) return null;
      return {
        company_id: companyId,
        date: new Date(item.t).toISOString().slice(0, 10),
        open: toNumber(item.o),
        high: toNumber(item.h),
        low: toNumber(item.l),
        close: toNumber(item.c),
        volume: toNumber(item.v),
        source: 'polygon',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (rows.length === 0) {
      return {
        ticker: normalizedTicker,
        companyId,
        rowsUpserted: 0,
      latestDate: null,
      warnings: ['Polygon returned no price rows.'],
    };
  }

  const upsert = await (supabase.from('company_prices') as any).upsert(rows, { onConflict: 'company_id,date' });
  if (upsert.error) {
    throw new Error(`Failed to upsert Polygon prices for ${normalizedTicker}: ${upsert.error.message}`);
  }

  return {
    ticker: normalizedTicker,
    companyId,
    rowsUpserted: rows.length,
    latestDate: rows[rows.length - 1]?.date ?? null,
    warnings: [],
  };
}
