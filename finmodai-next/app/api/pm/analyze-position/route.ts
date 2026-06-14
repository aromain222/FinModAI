import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzePosition } from '@/lib/pm/analyzer/positionAnalysis';
import { listPositions, savePosition } from '@/lib/pm/portfolio/positionStore';
import { saveThesis, getLatestThesis } from '@/lib/pm/thesis/thesisStore';
import { listQuantScores } from '@/lib/pm/monitoring/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.message }, { status: 400 });
  }
  const ticker = parsed.data.ticker.toUpperCase();

  const positions = await listPositions({ ticker, limit: 1 });
  const position = positions[0];
  if (!position) {
    return NextResponse.json({ error: 'position_not_found', ticker }, { status: 404 });
  }

  const snapshots = await listQuantScores({ ticker, limit: 12 });
  // Keep only the most recent snapshot per analyst (one row per scout).
  const seen = new Set<string>();
  const latestPerAnalyst = snapshots.filter(s => {
    if (seen.has(s.analystKey)) return false;
    seen.add(s.analystKey);
    return true;
  });

  const result = await analyzePosition({ ticker, position, snapshots: latestPerAnalyst });
  if (!result.ok) {
    return NextResponse.json({ error: 'analyzer_failed', reason: result.reason, ticker }, { status: 502 });
  }
  const { analysis, provider, model } = result;
  const now = new Date().toISOString();

  // 1) Update pm_positions with target/stop/last-analysis.
  const updatedPosition = await savePosition({
    ...position,
    targetPrice: analysis.targetPrice,
    stopLoss: analysis.stopLoss,
    lastPmAnalysisAt: now,
    convictionScore: analysis.convictionScore,
    updatedAt: now,
  });

  // 2) Save / update the PositionThesis row.
  const existingThesis = await getLatestThesis(ticker);
  const thesis = await saveThesis({
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
    horizon: analysis.timeHorizon,
    currentScore: analysis.convictionScore,
    entryScore: existingThesis?.entryScore ?? analysis.convictionScore,
    createdAt: existingThesis?.createdAt,
    updatedAt: now,
  });

  return NextResponse.json({
    ok: true,
    ticker,
    analysis,
    position: updatedPosition,
    thesis,
    provider,
    model,
  });
}
