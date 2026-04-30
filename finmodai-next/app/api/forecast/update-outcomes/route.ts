import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { computeDirectionalAccuracy } from '@/lib/forecasting/accuracy';
import {
  getForecastHistory,
  updateForecastOutcome,
  type ForecastDirection,
  type ForecastRecord,
} from '@/lib/forecasting/history';
import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';

const requestSchema = z.object({
  ticker: z.string().min(1),
});

type ActualCandidate = {
  source: 'price' | 'revenue';
  value: number;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function directionFromValues(reference: number, actual: number): ForecastDirection {
  return actual >= reference ? 'up' : 'down';
}

function referenceValue(record: ForecastRecord): number | null {
  const first = record.forecast.find((value) => Number.isFinite(value));
  return typeof first === 'number' ? first : null;
}

function relativeDistance(reference: number, value: number): number {
  if (!Number.isFinite(reference) || !Number.isFinite(value) || reference === 0 || value === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(Math.log(Math.abs(value / reference)));
}

async function fetchLatestPrice(ticker: string): Promise<ActualCandidate | null> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 21);

  const series = await fetchDailySeries({
    symbol: ticker,
    rangePoints: 10,
    start: isoDate(start),
    end: isoDate(end),
  }).catch(() => null);
  const latest = series?.candles.at(-1)?.value;
  return typeof latest === 'number' && Number.isFinite(latest) && latest > 0
    ? { source: 'price', value: latest }
    : null;
}

async function fetchLatestRevenue(ticker: string): Promise<ActualCandidate | null> {
  const historical = await fetchHistoricalFinancials(ticker, 3).catch(() => null);
  const latest = historical?.revenue
    .filter((value) => Number.isFinite(value) && value > 0)
    .at(0);
  return typeof latest === 'number' && Number.isFinite(latest) && latest > 0
    ? { source: 'revenue', value: latest }
    : null;
}

async function fetchBestActual(ticker: string, reference: number): Promise<ActualCandidate | null> {
  const [priceResult, revenueResult] = await Promise.allSettled([
    fetchLatestPrice(ticker),
    fetchLatestRevenue(ticker),
  ]);
  const candidates = [priceResult, revenueResult]
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((candidate): candidate is ActualCandidate => candidate !== null);
  if (candidates.length === 0) return null;
  return candidates.sort(
    (left, right) =>
      relativeDistance(reference, left.value) - relativeDistance(reference, right.value),
  )[0] ?? null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }

  const ticker = parsed.data.ticker.trim().toUpperCase();
  const records = await getForecastHistory(ticker).catch(() => []);
  const unresolved = records.filter((record) => !record.actualDirection);
  let updated = 0;
  let skipped = 0;

  for (const record of unresolved) {
    const reference = referenceValue(record);
    if (reference === null) {
      skipped += 1;
      continue;
    }

    const actual = await fetchBestActual(ticker, reference);
    if (!actual) {
      skipped += 1;
      continue;
    }

    await updateForecastOutcome(record.id, directionFromValues(reference, actual.value));
    updated += 1;
  }

  const refreshed = await getForecastHistory(ticker).catch(() => records);
  const accuracy = computeDirectionalAccuracy(refreshed);

  return NextResponse.json({
    ticker,
    updated,
    skipped,
    accuracy: accuracy.accuracy,
    sampleSize: accuracy.sampleSize,
  });
}
