/**
 * POST /api/backtest/run
 *
 * Pulls recent market events from Supabase, reconstructs an event sequence,
 * applies the deterministic probability model to each, builds a synthetic
 * price series (no real market data required), and runs the backtesting engine.
 *
 * Synthetic prices are deterministic — same event sequence always produces
 * the same price series and therefore the same backtest result.
 *
 * Real-world use: replace buildSyntheticPriceSeries() with actual OHLC data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/events/store';
import {
  runBacktest,
  buildSyntheticPriceSeries,
  type BacktestEvent,
  type SyntheticPriceEvent,
  type BacktestHorizon,
} from '@/lib/backtestEngine';

export const dynamic = 'force-dynamic';

// ── Schemas ───────────────────────────────────────────────────────────────────

const requestSchema = z.object({
  horizon:     z.enum(['1d', '3d', '5d']).default('3d'),
  days:        z.number().int().min(7).max(180).default(30),
  min_severity: z.number().int().min(0).max(100).default(50),
});

// ── Supabase row type ─────────────────────────────────────────────────────────

type MarketEventRow = {
  id:              string;
  title:           string;
  severity:        number;
  confidence:      number;
  bias:            'RiskOn' | 'RiskOff' | 'Mixed';
  horizon:         string;
  first_seen_at:   string;
  drivers:         unknown;
  market_impact:   unknown;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const HALF_LIFE_HOURS = 6;
const LAMBDA = Math.log(2) / HALF_LIFE_HOURS;

function decayWeight(timestampMs: number): number {
  const hoursElapsed = (Date.now() - timestampMs) / 3_600_000;
  return Math.exp(-LAMBDA * hoursElapsed);
}

/**
 * Convert a Supabase market_event row into backtest event inputs.
 * Since we don't have actual valuation gap data in market_events,
 * we derive proxy values from severity and bias.
 */
function rowToBacktestEvent(
  row: MarketEventRow,
  idx: number,
  allRows: MarketEventRow[]
): BacktestEvent {
  const ts = new Date(row.first_seen_at).getTime();

  // Proxy valuation gap: RiskOn → positive, RiskOff → negative
  const direction =
    row.bias === 'RiskOn'  ? 1 :
    row.bias === 'RiskOff' ? -1 : 0;
  const valuation_gap = direction * (row.severity / 100) * 0.15; // max ±15%

  // Event scores: use this event + up to 3 prior events, each decay-weighted
  const lookback = allRows.slice(Math.max(0, idx - 3), idx + 1);
  const event_scores = lookback.map((r) => {
    const rTs  = new Date(r.first_seen_at).getTime();
    const rDir = r.bias === 'RiskOn' ? 1 : r.bias === 'RiskOff' ? -1 : 0;
    const score = (r.severity / 100) * rDir * 5; // scale to event_scores range
    return score * decayWeight(rTs);
  });

  // Scenario skew: RiskOn events have upside skew, RiskOff have downside
  const scenario_skew = direction * (row.severity / 100) * 2;

  // Volatility proxy: higher severity = higher vol
  const volatility = row.severity / 100;

  return {
    timestamp:     ts,
    valuation_gap,
    event_scores,
    scenario_skew,
    volatility,
    headline:      row.title,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { horizon, days, min_severity } = parsed.data;

  // ── Fetch events from Supabase ────────────────────────────────────────────
  const supabase = getSupabaseServiceClient();

  let rows: MarketEventRow[] = [];

  if (supabase) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await (
      supabase
        .from('market_events')
        .select('id,title,severity,confidence,bias,horizon,first_seen_at,drivers,market_impact')
        .gte('first_seen_at', since)
        .gte('severity', min_severity)
        .order('first_seen_at', { ascending: true })
        .limit(120) as unknown as Promise<{ data: MarketEventRow[] | null; error: unknown }>
    );

    if (!error && Array.isArray(data)) {
      rows = data;
    }
  }

  // Fallback: generate synthetic events for demo when Supabase is unavailable
  if (rows.length === 0) {
    rows = buildDemoEvents(days);
  }

  if (rows.length < 5) {
    return NextResponse.json(
      { error: 'Insufficient event history for backtest (need ≥ 5 events)' },
      { status: 422 }
    );
  }

  // ── Build backtest inputs ─────────────────────────────────────────────────
  const backtestEvents: BacktestEvent[] = rows.map((row, i, all) =>
    rowToBacktestEvent(row, i, all)
  );

  const priceInputs: SyntheticPriceEvent[] = rows.map((row) => ({
    severity:  row.severity,
    bias:      row.bias,
    timestamp: new Date(row.first_seen_at).getTime(),
  }));

  const priceSeries = buildSyntheticPriceSeries(priceInputs);

  // ── Run backtest ──────────────────────────────────────────────────────────
  const result = runBacktest(backtestEvents, priceSeries, horizon as BacktestHorizon);

  return NextResponse.json({
    result,
    meta: {
      event_count:    rows.length,
      horizon,
      days_lookback:  days,
      min_severity,
      price_source:   supabase && rows.length > 0 ? 'supabase_synthetic' : 'demo_synthetic',
    },
  });
}

// ── Demo events (used when Supabase is not configured) ────────────────────────

function buildDemoEvents(days: number): MarketEventRow[] {
  const now   = Date.now();
  const count = Math.min(40, Math.floor(days * 1.2));

  const biases: Array<'RiskOn' | 'RiskOff' | 'Mixed'> = ['RiskOn', 'RiskOff', 'Mixed'];
  const titles = [
    'Fed signals pause in rate hike cycle',
    'China manufacturing PMI contracts sharply',
    'NVIDIA beats earnings, raises guidance',
    'Oil prices surge on OPEC production cut',
    'Treasury yields hit multi-year highs',
    'Bank of Japan abandons yield curve control',
    'US jobs data beats expectations',
    'Tech sector under pressure from AI regulation',
    'ECB delivers hawkish surprise',
    'Commodity prices rally on supply disruption',
    'Meta reports strong ad revenue growth',
    'Dollar strengthens on safe-haven demand',
    'Credit spreads widen on recession fears',
    'Emerging market capital outflows accelerate',
    'Microsoft Azure revenue growth exceeds consensus',
  ];

  return Array.from({ length: count }, (_, i) => {
    // Deterministic seed per event
    const seed = (i * 1013904223 + 1664525) >>> 0;
    const biasIdx = seed % 3;
    const titleIdx = seed % titles.length;
    const severity = 50 + (seed % 45);
    const confidence = 60 + (seed % 35);

    return {
      id:            `demo-${i}`,
      title:         titles[titleIdx],
      severity,
      confidence,
      bias:          biases[biasIdx],
      horizon:       'NearTerm',
      first_seen_at: new Date(now - (count - i) * (days / count) * 86_400_000).toISOString(),
      drivers:       [],
      market_impact: {},
    };
  });
}
