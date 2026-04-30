import { NextRequest, NextResponse } from 'next/server';
import {
  buildEventAdjustedForecast,
  deriveMarketEventAdjustment,
  type EventAdjustmentInput,
  type PriceForecastPayload,
} from '@/lib/forecast/eventAdjustedForecast';
import { marketEventSchema } from '@/lib/news/marketEventsTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type RequestBody = {
  ticker?: string;
  horizon?: number;
  event?: EventAdjustmentInput;
  marketEvents?: unknown[];
};

async function fetchTimesFmPriceForecast(origin: string, ticker: string, horizon: number): Promise<PriceForecastPayload | null> {
  const response = await fetch(
    `${origin}/api/timesfm?type=price&ticker=${encodeURIComponent(ticker)}&horizon=${horizon}`,
    { cache: 'no-store', signal: AbortSignal.timeout(55000) },
  );
  if (!response.ok) return null;
  return (await response.json()) as PriceForecastPayload;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const ticker = body?.ticker?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ ok: false, error: 'ticker is required' }, { status: 400 });
  }

  const horizon = Math.min(90, Math.max(5, Number(body?.horizon ?? 30)));
  const parsedEvents = Array.isArray(body?.marketEvents)
    ? body.marketEvents
        .map((event) => marketEventSchema.safeParse(event))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
  const event = body?.event ?? deriveMarketEventAdjustment(parsedEvents, ticker);
  if (!event) {
    return NextResponse.json({ ok: false, error: 'event or marketEvents are required' }, { status: 400 });
  }

  const priceForecast = await fetchTimesFmPriceForecast(req.nextUrl.origin, ticker, horizon);
  if (!priceForecast) {
    return NextResponse.json({ ok: false, error: 'TimesFM price forecast unavailable' }, { status: 503 });
  }

  const synthesis = buildEventAdjustedForecast(priceForecast, event, body?.event ? 'event_impact' : 'market_events');
  if (!synthesis) {
    return NextResponse.json({ ok: false, error: 'Unable to synthesize adjusted forecast' }, { status: 422 });
  }

  return NextResponse.json(
    { ok: true, synthesis },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
