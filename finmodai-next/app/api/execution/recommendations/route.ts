import { NextRequest, NextResponse } from 'next/server';
import { screenUniverse } from '@/lib/execution/universalScreener';
import { scoreMultiple } from '@/lib/ranking/score';
import type { UserIntent } from '@/lib/execution/userIntent';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 60;

const MIN_BUY_SCORE = 6.0;
const MAX_RECS      = 8;

export type Recommendation = {
  ticker: string;
  score: number;
  signal: 'green' | 'yellow' | 'red';
  primaryReason: string;
  mainRisk: string;
  sector: string | null;
};

export type RecommendationsResponse = {
  recommendations: Recommendation[];
  scoredAt: string;
  universeSize: number;
};

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

// Generic top-picks intent — no theme or asset-class constraints
const DEFAULT_INTENT: UserIntent = {
  themes:         [],
  risk_profile:   'balanced',
  position_count: null,
  capital_usd:    null,
  time_horizon:   'medium',
  asset_class:    'common_stock',
  raw_prompt:     '',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const origin = appUrl(req);
    const screen = await screenUniverse(DEFAULT_INTENT, 25);
    const ranked = await scoreMultiple(screen.tickers, origin, 6);

    const recommendations: Recommendation[] = ranked
      .filter(s => s.score >= MIN_BUY_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECS)
      .map(s => ({
        ticker:        s.ticker,
        score:         s.score,
        signal:        s.signal,
        primaryReason: s.primaryReason,
        mainRisk:      s.mainRisk,
        sector:        s.meta.sector ?? null,
      }));

    return NextResponse.json({
      recommendations,
      scoredAt:     new Date().toISOString(),
      universeSize: screen.total,
    } satisfies RecommendationsResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scoring failed' },
      { status: 500 },
    );
  }
}
