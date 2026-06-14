import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords } from '@/lib/pm/persistence/store';
import type { CompetitionRound } from '@/app/api/pm/competition/run/route';
import type { StockQuote } from '@/app/api/quotes/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function ageDays(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 86_400_000;
}

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const rounds = await listPMRecords<CompetitionRound>('pm_competition_rounds', { limit: 100 });

  // Pull live quotes for every winner to compute current return.
  const tickers = [...new Set(rounds.flatMap(r => r.winnerTicker ? [r.winnerTicker] : []))];
  const quotes = new Map<string, StockQuote>();
  if (tickers.length > 0) {
    try {
      const res = await fetch(`${origin}/api/quotes?symbols=${encodeURIComponent(tickers.join(','))}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json() as { quotes?: StockQuote[] };
        for (const q of data.quotes ?? []) quotes.set(q.ticker.toUpperCase(), q);
      }
    } catch { /* silent */ }
  }

  const enriched = rounds.map(round => {
    const currentPrice = round.winnerTicker ? quotes.get(round.winnerTicker.toUpperCase())?.price ?? null : null;
    const entry = round.entryPrice;
    const returnPct = currentPrice != null && entry != null && entry > 0
      ? ((currentPrice - entry) / entry) * 100
      : null;
    return {
      ...round,
      currentPrice,
      returnPct,
      ageDays: round.entryDate ? ageDays(round.entryDate) : null,
    };
  });

  // Aggregate leaderboard stats
  const completed = enriched.filter(r => r.returnPct != null);
  const wins = completed.filter(r => (r.returnPct ?? 0) > 0).length;
  const totalReturn = completed.reduce((sum, r) => sum + (r.returnPct ?? 0), 0);
  const avgReturn = completed.length > 0 ? totalReturn / completed.length : 0;
  const bestPick = [...completed].sort((a, b) => (b.returnPct ?? 0) - (a.returnPct ?? 0))[0] ?? null;
  const worstPick = [...completed].sort((a, b) => (a.returnPct ?? 0) - (b.returnPct ?? 0))[0] ?? null;

  return NextResponse.json({
    rounds: enriched,
    stats: {
      totalRounds: enriched.length,
      completedRounds: completed.length,
      hitRate: completed.length > 0 ? (wins / completed.length) * 100 : null,
      avgReturnPct: avgReturn,
      bestPick: bestPick ? { ticker: bestPick.winnerTicker, returnPct: bestPick.returnPct } : null,
      worstPick: worstPick ? { ticker: worstPick.winnerTicker, returnPct: worstPick.returnPct } : null,
    },
  });
}
