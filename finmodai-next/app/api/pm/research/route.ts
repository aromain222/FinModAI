import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listPositions, savePosition } from '@/lib/pm/portfolio/positionStore';
import { listQuantScores } from '@/lib/pm/monitoring/store';
import { runQuantMonitoring } from '@/lib/pm/monitoring/runQuantMonitoring';
import { analyzePosition } from '@/lib/pm/analyzer/positionAnalysis';
import { saveThesis, saveThesisUpdate, getLatestThesis } from '@/lib/pm/thesis/thesisStore';
import type { StockQuote } from '@/app/api/quotes/route';
import {
  buildResearchPacket,
  DEFAULT_RESEARCH_HORIZON_DAYS,
} from '@/lib/pm/research/researchPacket';
import type { ResearchEvidenceSummary } from '@/lib/pm/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
  skipScan: z.boolean().optional(),
});

function summarizeEvidence(packet: Awaited<ReturnType<typeof buildResearchPacket>>): ResearchEvidenceSummary {
  const candidates = [
    ['Price', packet.market.price],
    ['Market cap', packet.market.marketCap],
    ['Revenue LTM', packet.fundamentals.revenueLtm],
    ['Historical revenue growth', packet.fundamentals.historicalRevenueGrowthPct],
    ['EBITDA margin', packet.fundamentals.ebitdaMarginPct],
    ['Consensus revenue', packet.consensus.revenueEstimateNtm],
    ['Consensus EPS', packet.consensus.epsEstimateNtm],
    ['Consensus target', packet.consensus.targetPrice],
    [`${packet.horizon.days}-day forecast`, packet.pricePath.expectedReturnPct],
    ['20-day momentum', packet.pricePath.momentum20dPct],
  ] as const;
  const sources: ResearchEvidenceSummary['sources'] = candidates.flatMap(([label, metric]) => metric.source
    ? [{ label, source: metric.source, asOf: metric.asOf }]
    : []);
  if (packet.earnings.source) {
    sources.push({
      label: 'Latest earnings',
      source: packet.earnings.source,
      asOf: packet.earnings.filedAt ?? packet.earnings.lastFetchedAt,
    });
  }
  for (const catalyst of packet.catalysts.slice(0, 5)) {
    if (catalyst.source) {
      sources.push({ label: catalyst.title, source: catalyst.source, asOf: catalyst.publishedAt });
    }
  }
  const unique = [...new Map(sources.map(item => [
    `${item.label}|${item.source}|${item.asOf ?? ''}`,
    item,
  ])).values()];
  const currentPrice = packet.market.price.value;
  const forecastPrice = (returnPct: number | null): number | null => (
    currentPrice !== null && returnPct !== null
      ? Math.round(currentPrice * (1 + returnPct / 100) * 100) / 100
      : null
  );
  return {
    builtAt: packet.builtAt,
    horizonDays: packet.horizon.days,
    coveragePct: packet.quality.coveragePct,
    degraded: packet.quality.coveragePct < 70 || packet.quality.missing.length > 0 || packet.quality.warnings.length > 0,
    marketRegime: packet.marketState?.regime ?? null,
    available: packet.quality.available,
    missing: packet.quality.missing,
    warnings: packet.quality.warnings,
    sources: unique.slice(0, 16),
    priceForecast: {
      currentPrice,
      baseCasePrice: forecastPrice(packet.pricePath.expectedReturnPct.value),
      bearCasePrice: forecastPrice(packet.pricePath.lowerReturnPct.value),
      bullCasePrice: forecastPrice(packet.pricePath.upperReturnPct.value),
      expectedReturnPct: packet.pricePath.expectedReturnPct.value,
      lowerReturnPct: packet.pricePath.lowerReturnPct.value,
      upperReturnPct: packet.pricePath.upperReturnPct.value,
      horizonDays: packet.horizon.days,
      asOf: packet.pricePath.expectedReturnPct.asOf,
      source: packet.pricePath.expectedReturnPct.source,
      methodology: packet.pricePath.methodology,
    },
  };
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.message }, { status: 400 });
  }
  const ticker = parsed.data.ticker.toUpperCase().trim();
  const origin = new URL(req.url).origin;
  const researchPacketPromise = buildResearchPacket({
    ticker,
    origin,
    horizonDays: DEFAULT_RESEARCH_HORIZON_DAYS,
  });

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
  const researchPacket = await researchPacketPromise;

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
      await runQuantMonitoring({
        ticker,
        origin,
        autoEscalate: false,
        requestHeaders: req.headers,
        researchPacket,
      });
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

  const result = await analyzePosition({
    ticker,
    position,
    snapshots: latestPerAnalyst,
    researchPacket,
  });
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
  const thesisId = existingThesis?.id ?? crypto.randomUUID();
  const thesisStatus = analysis.convictionScore >= 70
    ? 'intact' as const
    : analysis.convictionScore >= 50
      ? 'under_review' as const
      : 'weakening' as const;
  const convictionBefore = existingThesis?.convictionScore ?? null;
  const convictionDelta = convictionBefore === null ? null : analysis.convictionScore - convictionBefore;
  const changedFactors = [
    'research_refresh',
    ...researchPacket.quality.available.filter(key => (
      key === 'company_fundamentals'
      || key === 'historical_growth'
      || key === 'consensus_estimates'
      || key === 'earnings_package'
      || key === 'price_history_and_forecast'
      || key === 'company_catalysts'
    )),
  ];
  const thesisUpdate = await saveThesisUpdate({
    ticker,
    thesisId,
    previousThesis: existingThesis?.currentThesis ?? existingThesis?.thesisSummary ?? null,
    newEvidence: `Research packet refreshed with ${researchPacket.quality.coveragePct}% coverage. Available: ${researchPacket.quality.available.join(', ') || 'none'}. Missing: ${researchPacket.quality.missing.join(', ') || 'none'}.`,
    updatedThesis: analysis.thesisSummary,
    convictionBefore,
    convictionAfter: analysis.convictionScore,
    thesisStatusBefore: existingThesis?.thesisStatus ?? null,
    thesisStatusAfter: thesisStatus,
    changedFactors,
    shouldNotifyPM: thesisStatus === 'weakening' || (convictionDelta !== null && Math.abs(convictionDelta) >= 12),
    explanation: existingThesis
      ? `Research refresh changed conviction ${convictionBefore} -> ${analysis.convictionScore}; prior thesis was preserved and the new evidence was appended.`
      : `Initial sourced research thesis created at ${researchPacket.quality.coveragePct}% evidence coverage.`,
    source: 'agent',
    createdAt: analyzedAt,
  });
  const thesis = await saveThesis({
    id: thesisId,
    ticker,
    originalThesis: existingThesis?.originalThesis ?? existingThesis?.thesisSummary ?? analysis.thesisSummary,
    currentThesis: analysis.thesisSummary,
    thesisSummary: analysis.thesisSummary,
    whyWeOwnIt: analysis.whyWeOwnIt,
    addConditions: existingThesis?.addConditions?.length
      ? existingThesis.addConditions
      : [analysis.confirmation],
    sellConditions: analysis.sellConditions,
    invalidationConditions: analysis.invalidationConditions,
    keyRisks: analysis.keyRisks,
    catalysts: analysis.catalysts,
    convictionScore: analysis.convictionScore,
    thesisStatus,
    status: thesisStatus,
    timeHorizon: researchPacket.horizon.label,
    lastReviewedAt: analyzedAt,
    primaryDriver: analysis.primaryDriver,
    mainRisk: analysis.mainRisk,
    catalystExpected: analysis.nextCatalyst,
    horizon: researchPacket.horizon.label,
    currentScore: analysis.convictionScore,
    entryScore: existingThesis?.entryScore ?? analysis.convictionScore,
    createdAt: existingThesis?.createdAt,
    updatedAt: analyzedAt,
    history: [...(existingThesis?.history ?? []), thesisUpdate].slice(-50),
    researchEvidence: summarizeEvidence(researchPacket),
  });

  return NextResponse.json({
    ok: true,
    ticker,
    quote,
    position: updatedPosition,
    snapshots: latestPerAnalyst,
    researchPacket,
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
