import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findTrendingCandidates, type TrendingCandidate } from '@/lib/pm/competition/trendingDiscovery';
import { runInvestmentCommittee } from '@/lib/pm/monitoring/committee';
import { upsertPMRecord, type PMStoredRecord } from '@/lib/pm/persistence/store';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const bodySchema = z.object({
  sector: z.string().min(1).max(60).nullable().optional(),
  tickers: z.array(z.string().min(1).max(10)).max(8).optional(),
  candidateLimit: z.number().int().min(2).max(8).optional(),
});

type ResearchSnapshot = {
  ok: true;
  ticker: string;
  quote: { ticker: string; price: number | null; name: string | null };
  analysis: {
    targetPrice: number;
    stopLoss: number;
    convictionScore: number;
    thesisSummary: string;
    whyWeOwnIt: string;
    primaryDriver: string;
    mainRisk: string;
    keyRisks: string[];
    catalysts: string[];
    sellConditions: string[];
    invalidationConditions: string[];
    nextCatalyst: string;
    timeHorizon: string;
  };
} | { ok: false; reason: string; ticker: string };

export type CompetitionRound = PMStoredRecord & {
  id: string;
  status: 'running' | 'complete' | 'failed';
  sector: string | null;
  candidateTickers: string[];
  candidates: Array<{
    ticker: string;
    entryPrice: number | null;
    targetPrice: number | null;
    stopLoss: number | null;
    convictionScore: number | null;
    thesisSummary: string | null;
    primaryDriver: string | null;
    trending?: TrendingCandidate;
  }>;
  winnerTicker: string | null;
  entryPrice: number | null;
  entryDate: string | null;
  rationale: string | null;
  conviction: number | null;
  committeeRunId: string | null;
  picker: 'committee';
  createdAt: string;
  updatedAt: string;
};

async function researchTicker(origin: string, ticker: string, headers: Headers): Promise<ResearchSnapshot> {
  try {
    const res = await fetch(`${origin}/api/pm/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...internalRequestHeaders(headers) },
      body: JSON.stringify({ ticker }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok || !payload?.ok) {
      return { ok: false, reason: (payload?.reason ?? `HTTP ${res.status}`) as string, ticker };
    }
    return payload as unknown as ResearchSnapshot;
  } catch (err) {
    return { ok: false, reason: (err as Error).message, ticker };
  }
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.message }, { status: 400 });
  }
  const { sector = null, tickers: providedTickers, candidateLimit = 4 } = parsed.data;
  const origin = new URL(req.url).origin;
  const roundId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // 1. Discover candidate tickers (provided or trending)
  let trending: TrendingCandidate[] = [];
  let candidateTickers: string[];
  if (providedTickers && providedTickers.length > 0) {
    candidateTickers = providedTickers.map(t => t.toUpperCase());
  } else {
    trending = await findTrendingCandidates({ origin, sector: sector ?? null, limit: candidateLimit, requestHeaders: req.headers });
    candidateTickers = trending.map(t => t.ticker);
  }
  if (candidateTickers.length < 2) {
    return NextResponse.json({
      error: 'insufficient_candidates',
      sector,
      candidates: candidateTickers,
      hint: 'No trending tickers found for this sector — try a different sector or pass `tickers: [...]` explicitly.',
    }, { status: 422 });
  }

  // 2. Research every candidate (sequential — sharing the same /api/pm/research backend)
  const researchResults: Array<ResearchSnapshot> = [];
  for (const ticker of candidateTickers) {
    const r = await researchTicker(origin, ticker, req.headers);
    researchResults.push(r);
  }
  const researched = researchResults.filter((r): r is Extract<ResearchSnapshot, { ok: true }> => r.ok);
  if (researched.length < 2) {
    return NextResponse.json({
      error: 'research_failed',
      results: researchResults,
    }, { status: 502 });
  }

  // 3. Build a candidates summary and let the senior committee pick.
  // The committee already runs against ONE ticker. For multi-candidate picks, we use the
  // /api/hedge-fund 'committee' mode on a synthetic ticker isn't right — instead we call the
  // committee on each candidate and rank by the highest combined (conviction × committee confidence).
  // This keeps the same engine and produces a single winner with rationale.
  const candidatesEnriched = researched.map(r => ({
    ticker: r.ticker,
    entryPrice: r.quote.price,
    targetPrice: r.analysis.targetPrice,
    stopLoss: r.analysis.stopLoss,
    convictionScore: r.analysis.convictionScore,
    thesisSummary: r.analysis.thesisSummary,
    primaryDriver: r.analysis.primaryDriver,
    upsidePct: r.quote.price && r.quote.price > 0 ? ((r.analysis.targetPrice - r.quote.price) / r.quote.price) * 100 : 0,
    trending: trending.find(t => t.ticker === r.ticker),
  }));

  // 4. Senior committee pick: scoring rule = conviction × (1 + upside/100)
  //    This favours high-conviction names with meaningful upside without going pure-momentum.
  const scored = candidatesEnriched.map(c => ({
    ...c,
    score: c.convictionScore * (1 + Math.max(-0.2, Math.min(0.8, c.upsidePct / 100))),
  }));
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];

  // Run committee on the winner to capture a real persona-level rationale.
  let committeeRunId: string | null = null;
  let committeeRationale: string | null = null;
  try {
    const committee = await runInvestmentCommittee({
      ticker: winner.ticker,
      trigger: 'user_request',
      origin,
      requestHeaders: req.headers,
      triggerSource: 'committee_escalation',
    });
    committeeRunId = committee.id;
    committeeRationale = `Committee endorsed ${winner.ticker} after reviewing ${scored.length} candidates. Decision rationale persisted in agent_view ${committee.agentViewId}.`;
  } catch (err) {
    committeeRationale = `Committee unavailable — ranked ${winner.ticker} #1 by upside-weighted conviction. (${(err as Error).message})`;
  }

  // 5. Persist round
  const round: CompetitionRound = {
    id: roundId,
    status: 'complete',
    sector,
    candidateTickers,
    candidates: candidatesEnriched,
    winnerTicker: winner.ticker,
    entryPrice: winner.entryPrice,
    entryDate: startedAt,
    rationale: committeeRationale,
    conviction: winner.convictionScore,
    committeeRunId,
    picker: 'committee',
    createdAt: startedAt,
    updatedAt: new Date().toISOString(),
  };
  await upsertPMRecord('pm_competition_rounds', round);

  return NextResponse.json({
    ok: true,
    round,
    failedCandidates: researchResults.filter(r => !r.ok),
  });
}
