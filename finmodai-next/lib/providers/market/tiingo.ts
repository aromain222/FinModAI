// lib/providers/market/tiingo.ts
import { z } from 'zod';

export type MarketPoint = { t: string; close: number };

type Range = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | '5Y';

const TiingoRow = z.object({
  date: z.string(), // ISO string
  close: z.number(),
});

function computeStartEnd(range: Range): { start: string; end: string } {
  const now = new Date();
  const end = now;
  const start = new Date(now);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  switch (range) {
    case '1D':
      start.setDate(now.getDate() - 2); // give it a little buffer
      break;
    case '1W':
      start.setDate(now.getDate() - 10);
      break;
    case '1M':
      start.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(now.getMonth() - 3);
      break;
    case 'YTD':
      return { start: yearStart.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    case '1Y':
      start.setFullYear(now.getFullYear() - 1);
      break;
    case '5Y':
      start.setFullYear(now.getFullYear() - 5);
      break;
  }

  // Tiingo wants YYYY-MM-DD
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function fetchTiingoDaily(
  symbol: string,
  range: Range,
  traceId?: string
): Promise<MarketPoint[]> {
  const token = process.env.TIINGO_API_KEY;
  if (!token) throw new Error('TIINGO_API_KEY missing');

  const { start, end } = computeStartEnd(range);

  // Tiingo IEX daily (free-ish depending on plan). If you have Tiingo "end-of-day" it still works like this.
  const url =
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices` +
    `?startDate=${encodeURIComponent(start)}` +
    `&endDate=${encodeURIComponent(end)}` +
    `&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    headers: traceId ? { 'x-trace-id': traceId } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tiingo failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('Tiingo response not array');

  const out: MarketPoint[] = [];
  for (const row of json) {
    const parsed = TiingoRow.safeParse(row);
    if (!parsed.success) continue;
    out.push({ t: parsed.data.date, close: parsed.data.close });
  }

  // sort asc and drop invalid
  return out
    .filter((p) => Number.isFinite(p.close) && !Number.isNaN(new Date(p.t).getTime()))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
}
