import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listPositions, savePosition } from '@/lib/pm/portfolio/positionStore';
import { listQuantScores } from '@/lib/pm/monitoring/store';
import { runQuantMonitoring } from '@/lib/pm/monitoring/runQuantMonitoring';
import { analyzePosition } from '@/lib/pm/analyzer/positionAnalysis';
import { saveThesis, getLatestThesis } from '@/lib/pm/thesis/thesisStore';
import type { StockQuote } from '@/app/api/quotes/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
  skipScan: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.message }, { status: 400 });
  }
  const ticker = parsed.data.ticker.toUpperCase().trim();
  const origin = new URL(req.url).origin;

  // 1. Quote — current price anchors the analyzer.
  const quoteRes = await fetch(`${origin}/api/quotes?symbols=${encodeURIComponent(ticker)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  let quote: StockQuote | null = null;
  if (quoteRes?.ok) {
    const data = await quoteRes.json().catch(() => null) as { quotes?: StockQuote[] } | null;
    quote = data?.quotes?.[0] ?? null;
  }
  if (!quote || quote.price == null) {
    return NextResponse.json({ error: 'quote_unavailable', ticker }, { status: 502 });
  }

  // 2. Upsert pm_positions as a watchlist entry. Keep id stable across re-research.
  const existingPositions = await listPositions({ ticker, limit: 1 });
  const existing = existingPositions[0];
  const positionId = existing?.id ?? `research:${ticker}`;
  const isAlreadyHeld = existing?.status === 'active' || existing?.status === 'trimmed';
  const now = new Date().toISOString();

  const position = await savePosition({
    ...existing,
    id: positionId,
    ticker,
    companyName: quote.name ?? existing?.companyName ?? null,
    currentPrice: quote.price,
    shares: existing?.shares ?? null,
    notionalExposure: existing?.notionalExposure ?? null,
    costBasis: existing?.costBasis ?? null,
    currentAllocation: existing?.currentAllocation ?? null,
    targetAllocation: existing?.targetAllocation ?? null,
    portfolioTheme: existing?.portfolioTheme ?? null,
    portfolioRole: existing?.portfolioRole ?? null,
    timeHorizon: existing?.timeHorizon ?? null,
    status: existing?.status ?? 'watch',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  // 3. Scout scan (unless caller asks to skip) — 6 scouts give the PM analyzer context.
  let scanError: string | null = null;
  if (!parsed.data.skipScan) {
    try {
      await runQuantMonitoring({ ticker, origin, autoEscalate: false, requestHeaders: req.headers });
    } catch (err) {
      scanError = (err as Error).message;
    }
  }

  // 4. Pull latest scout snapshots (one per analyst) and run the PM analyzer.
  const snapshots = await listQuantScores({ ticker, limit: 12 });
  const seen = new Set<string>();
  const latestPerAnalyst = snapshots.filter(s => {
    if (seen.has(s.analystKey)) return false;
    seen.add(s.analystKey);
    return true;
  });

  const result = await analyzePosition({ ticker, position, snapshots: latestPerAnalyst });
  if (!result.ok) {
    return NextResponse.json({
      error: 'analyzer_failed',
      reason: result.reason,
      ticker,
      position,
      scanError,
    }, { status: 502 });
  }
  const { analysis, provider, model } = result;
  const analyzedAt = new Date().toISOString();

  // 5. Persist target/stop/conviction on the position.
  const updatedPosition = await savePosition({
    ...position,
    targetPrice: analysis.targetPrice,
    stopLoss: analysis.stopLoss,
    convictionScore: analysis.convictionScore,
    lastPmAnalysisAt: analyzedAt,
    updatedAt: analyzedAt,
  });

  // 6. Persist the thesis.
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
    lastReviewedAt: analyzedAt,
    primaryDriver: analysis.primaryDriver,
    mainRisk: analysis.mainRisk,
    catalystExpected: analysis.nextCatalyst,
    horizon: analysis.timeHorizon,
    currentScore: analysis.convictionScore,
    entryScore: existingThesis?.entryScore ?? analysis.convictionScore,
    createdAt: existingThesis?.createdAt,
    updatedAt: analyzedAt,
  });

  return NextResponse.json({
    ok: true,
    ticker,
    quote,
    position: updatedPosition,
    snapshots: latestPerAnalyst,
    thesis,
    analysis,
    isAlreadyHeld,
    scanError,
    provider,
    model,
  });
}

export async function GET() {
  // List everything researched so the page can show a sidebar.
  const positions = await listPositions({ limit: 200 });
  const researchable = positions.filter(p => p.status !== 'exited' && p.status !== 'closed');
  return NextResponse.json({ items: researchable });
}
