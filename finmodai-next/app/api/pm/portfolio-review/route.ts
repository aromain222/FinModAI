import { NextRequest, NextResponse } from 'next/server';
import { listPositions, savePosition } from '@/lib/pm/portfolio/positionStore';
import { listQuantScores } from '@/lib/pm/monitoring/store';
import { runQuantMonitoring } from '@/lib/pm/monitoring/runQuantMonitoring';
import { analyzePosition } from '@/lib/pm/analyzer/positionAnalysis';
import { findTrendingCandidates } from '@/lib/pm/competition/trendingDiscovery';
import { saveThesis, getLatestThesis } from '@/lib/pm/thesis/thesisStore';
import type { StockQuote } from '@/app/api/quotes/route';
import type { PortfolioPosition } from '@/lib/pm/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export type ReviewVerdict = 'keep' | 'trim' | 'replace' | 'add';

export type PositionReview = {
  ticker: string;
  position: PortfolioPosition;
  currentPrice: number | null;
  entryPrice: number | null;
  pnlPct: number | null;
  priorConviction: number | null;
  freshConviction: number;
  convictionDelta: number | null;
  targetPrice: number;
  stopLoss: number;
  thesisSummary: string;
  primaryDriver: string;
  mainRisk: string;
  nextCatalyst: string;
  verdict: ReviewVerdict;
  verdictReason: string;
  suggestedAlternative: {
    ticker: string;
    mentionCount: number;
    netDirection: 'up' | 'down' | 'flat';
    sampleHeadline: string | null;
  } | null;
};

/**
 * Verdict logic — pure rules over the fresh analyzer output and price action.
 *  - keep:    fresh conviction >= 65 and either P&L >= 0 or stop intact
 *  - trim:    fresh conviction 50-64 OR P&L >= +20% (lock some gains)
 *  - replace: fresh conviction < 50 OR conviction dropped >= 15 OR price below stop
 *  - add:     fresh conviction >= 80 AND P&L >= 0 (rare, strong signal)
 */
function deriveVerdict(input: {
  freshConviction: number;
  priorConviction: number | null;
  pnlPct: number | null;
  currentPrice: number | null;
  stopLoss: number;
}): { verdict: ReviewVerdict; reason: string } {
  const drop = input.priorConviction != null ? input.priorConviction - input.freshConviction : 0;

  if (input.currentPrice != null && input.currentPrice <= input.stopLoss) {
    return { verdict: 'replace', reason: `Price ${input.currentPrice.toFixed(2)} hit stop ${input.stopLoss.toFixed(2)} — thesis invalidated by tape.` };
  }
  if (input.freshConviction >= 80 && (input.pnlPct ?? 0) >= 0) {
    return { verdict: 'add', reason: `High conviction ${input.freshConviction} on a working position — agent suggests adding.` };
  }
  if (input.freshConviction < 50) {
    return { verdict: 'replace', reason: `Fresh PM conviction ${input.freshConviction} is below the keep bar (50) — thesis is weakening.` };
  }
  if (drop >= 15) {
    return { verdict: 'replace', reason: `Conviction dropped ${drop.toFixed(0)} points (${input.priorConviction} → ${input.freshConviction}) — material thesis erosion.` };
  }
  if (input.freshConviction < 65 || (input.pnlPct ?? 0) >= 20) {
    return { verdict: 'trim', reason: input.freshConviction < 65
      ? `Conviction ${input.freshConviction} is in trim zone (50-64).`
      : `P&L +${input.pnlPct?.toFixed(1)}% — harvest some risk while thesis stays intact.` };
  }
  return { verdict: 'keep', reason: `Fresh PM conviction ${input.freshConviction} — thesis holds.` };
}

async function fetchLiveQuote(origin: string, ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`${origin}/api/quotes?symbols=${encodeURIComponent(ticker)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { quotes?: StockQuote[] };
    return data.quotes?.[0]?.price ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const positions = await listPositions({ limit: 200 });
  const held = positions.filter(p => p.status === 'active' || p.status === 'trimmed');

  if (held.length === 0) {
    return NextResponse.json({ error: 'no_held_positions', hint: 'Sync from Ledger first.' }, { status: 422 });
  }

  const trendingPool = await findTrendingCandidates({ origin, sector: null, limit: 12, requestHeaders: req.headers });

  const reviews: PositionReview[] = [];
  for (const position of held) {
    const ticker = position.ticker.toUpperCase();
    const priorConviction = position.convictionScore ?? null;

    const livePrice = await fetchLiveQuote(origin, ticker);
    const refreshedPos = livePrice != null
      ? await savePosition({ ...position, currentPrice: livePrice, updatedAt: new Date().toISOString() })
      : position;

    // Re-scan scouts so the analyzer has fresh context, then run analyzer.
    try {
      await runQuantMonitoring({ ticker, origin, autoEscalate: false, requestHeaders: req.headers });
    } catch { /* tolerate scan failure — analyzer can still run on stale snapshots */ }

    const snapshots = await listQuantScores({ ticker, limit: 12 });
    const seen = new Set<string>();
    const latestPerAnalyst = snapshots.filter(s => {
      if (seen.has(s.analystKey)) return false;
      seen.add(s.analystKey);
      return true;
    });

    const result = await analyzePosition({ ticker, position: refreshedPos, snapshots: latestPerAnalyst });
    if (!result.ok) {
      reviews.push({
        ticker,
        position: refreshedPos,
        currentPrice: refreshedPos.currentPrice ?? null,
        entryPrice: refreshedPos.entryPrice ?? (refreshedPos.costBasis && refreshedPos.shares ? refreshedPos.costBasis / refreshedPos.shares : null),
        pnlPct: null,
        priorConviction,
        freshConviction: priorConviction ?? 50,
        convictionDelta: null,
        targetPrice: refreshedPos.targetPrice ?? 0,
        stopLoss: refreshedPos.stopLoss ?? 0,
        thesisSummary: 'Analyzer failed — using prior thesis.',
        primaryDriver: '—',
        mainRisk: result.reason,
        nextCatalyst: '—',
        verdict: 'keep',
        verdictReason: `Analyzer failed (${result.reason}); defaulting to keep.`,
        suggestedAlternative: null,
      });
      continue;
    }
    const { analysis } = result;
    const entryPrice = refreshedPos.entryPrice
      ?? (refreshedPos.costBasis && refreshedPos.shares ? refreshedPos.costBasis / refreshedPos.shares : null);
    const pnlPct = entryPrice != null && refreshedPos.currentPrice != null && entryPrice > 0
      ? ((refreshedPos.currentPrice - entryPrice) / entryPrice) * 100
      : null;

    const { verdict, reason } = deriveVerdict({
      freshConviction: analysis.convictionScore,
      priorConviction,
      pnlPct,
      currentPrice: refreshedPos.currentPrice ?? null,
      stopLoss: analysis.stopLoss,
    });

    // Persist fresh artifacts
    const now = new Date().toISOString();
    const finalPosition = await savePosition({
      ...refreshedPos,
      targetPrice: analysis.targetPrice,
      stopLoss: analysis.stopLoss,
      convictionScore: analysis.convictionScore,
      lastPmAnalysisAt: now,
      updatedAt: now,
    });
    const existingThesis = await getLatestThesis(ticker);
    await saveThesis({
      id: existingThesis?.id,
      ticker,
      thesisSummary: analysis.thesisSummary,
      whyWeOwnIt: analysis.whyWeOwnIt,
      addConditions: [],
      sellConditions: analysis.sellConditions,
      invalidationConditions: analysis.invalidationConditions,
      keyRisks: analysis.keyRisks,
      catalysts: analysis.catalysts,
      convictionScore: analysis.convictionScore,
      thesisStatus: analysis.convictionScore >= 70 ? 'intact' : analysis.convictionScore >= 50 ? 'under_review' : 'weakening',
      timeHorizon: analysis.timeHorizon,
      lastReviewedAt: now,
      primaryDriver: analysis.primaryDriver,
      mainRisk: analysis.mainRisk,
      catalystExpected: analysis.nextCatalyst,
      currentScore: analysis.convictionScore,
      entryScore: existingThesis?.entryScore ?? analysis.convictionScore,
      createdAt: existingThesis?.createdAt,
      updatedAt: now,
    });

    let suggestedAlternative: PositionReview['suggestedAlternative'] = null;
    if (verdict === 'replace' && trendingPool.length > 0) {
      const alt = trendingPool.find(c => c.ticker !== ticker) ?? trendingPool[0];
      suggestedAlternative = {
        ticker: alt.ticker,
        mentionCount: alt.mentionCount,
        netDirection: alt.netDirection,
        sampleHeadline: alt.sampleHeadlines[0] ?? null,
      };
    }

    reviews.push({
      ticker,
      position: finalPosition,
      currentPrice: finalPosition.currentPrice ?? null,
      entryPrice,
      pnlPct,
      priorConviction,
      freshConviction: analysis.convictionScore,
      convictionDelta: priorConviction != null ? analysis.convictionScore - priorConviction : null,
      targetPrice: analysis.targetPrice,
      stopLoss: analysis.stopLoss,
      thesisSummary: analysis.thesisSummary,
      primaryDriver: analysis.primaryDriver,
      mainRisk: analysis.mainRisk,
      nextCatalyst: analysis.nextCatalyst,
      verdict,
      verdictReason: reason,
      suggestedAlternative,
    });
  }

  const summary = {
    keep: reviews.filter(r => r.verdict === 'keep').length,
    trim: reviews.filter(r => r.verdict === 'trim').length,
    replace: reviews.filter(r => r.verdict === 'replace').length,
    add: reviews.filter(r => r.verdict === 'add').length,
  };

  return NextResponse.json({
    reviewedAt: new Date().toISOString(),
    total: reviews.length,
    summary,
    reviews,
  });
}
