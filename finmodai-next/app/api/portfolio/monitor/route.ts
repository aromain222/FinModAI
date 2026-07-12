import { NextRequest, NextResponse } from 'next/server';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import { notifyScoreDrop } from '@/lib/pm/notifications/notifier';
import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock, Signal } from '@/lib/ranking/types';
import type {
  ActivePosition,
  PositionMonitorAgentRead,
  PositionMonitorNewsRead,
  PositionMonitorResult,
  ThesisDrift,
} from '@/lib/portfolio/types';
import type { ClassifiedNewsItem } from '@/lib/portfolio/newsClassify';
import type { StockQuote } from '@/app/api/quotes/route';
import { positionEconomics } from '@/lib/portfolio/positionMath';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

type MonitorPayload = {
  position?: ActivePosition;
  quote?: StockQuote | null;
  news?: ClassifiedNewsItem[];
  horizonWeeks?: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function signalFromScore(score: number): Signal {
  if (score >= 7) return 'green';
  if (score >= 4) return 'yellow';
  return 'red';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parsePosition(value: unknown): ActivePosition | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ActivePosition>;
  if (!readString(row.id) || !readString(row.ticker)) return null;
  if (typeof row.entryPrice !== 'number' || !Number.isFinite(row.entryPrice) || row.entryPrice <= 0) return null;
  if (typeof row.currentPrice !== 'number' || !Number.isFinite(row.currentPrice)) return null;
  if (typeof row.entryScore !== 'number' || typeof row.currentScore !== 'number') return null;
  return row as ActivePosition;
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function fetchRank(ticker: string, origin: string, horizonWeeks: number): Promise<RankedStock | null> {
  try {
    const rows = await scoreMultiple([ticker], origin, horizonWeeks);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function quantScoutRead(raw: unknown): PositionMonitorAgentRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as {
    snapshots?: Array<{
      analystName?: string;
      score?: number;
      confidence?: number;
    }>;
    events?: Array<{ summary?: string }>;
  };
  const snapshots = Array.isArray(data.snapshots)
    ? data.snapshots.filter(snapshot => typeof snapshot.score === 'number')
    : [];
  if (snapshots.length === 0) return null;
  const averageScore = snapshots.reduce((sum, snapshot) => sum + (snapshot.score ?? 50), 0) / snapshots.length;
  const averageConfidence = snapshots.reduce((sum, snapshot) => sum + (snapshot.confidence ?? 50), 0) / snapshots.length;
  const stance = averageScore >= 60 ? 'BULLISH' : averageScore <= 40 ? 'BEARISH' : 'NEUTRAL';
  const changed = data.events?.[0]?.summary;
  return {
    source: 'hedge_fund',
    stance,
    read: `Quant scouts average ${averageScore.toFixed(0)}/100 across ${snapshots.length} monitoring domains.${changed ? ` Latest event: ${changed}` : ' No material score event fired.'}`,
    confidence: Math.round(averageConfidence),
  };
}

function newsSentimentAgentRead(raw: unknown): PositionMonitorNewsRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as {
    snapshots?: Array<{
      analystKey?: string;
      signal?: string;
      confidence?: number;
      reasoning?: string;
      watch?: string;
    }>;
  };
  const snapshot = Array.isArray(data.snapshots)
    ? data.snapshots.find(item => item.analystKey === 'news_sentiment')
    : null;
  if (!snapshot || typeof snapshot.reasoning !== 'string' || !snapshot.reasoning.trim()) return null;
  const signal = snapshot.signal === 'bullish' || snapshot.signal === 'bearish'
    ? snapshot.signal
    : 'neutral';
  return {
    signal,
    confidence: clamp(
      typeof snapshot.confidence === 'number' ? Math.round(snapshot.confidence) : 50,
      0,
      100,
    ),
    reasoning: snapshot.reasoning.trim(),
    watch: typeof snapshot.watch === 'string' && snapshot.watch.trim()
      ? snapshot.watch.trim()
      : 'Watch for a quantified estimate revision, guidance change, or confirmed operating impact.',
  };
}

function tradingAgentsRead(raw: unknown): PositionMonitorAgentRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { decision?: string; summary?: string | null; thesis?: string | null };
  if (!data.decision && !data.summary && !data.thesis) return null;
  return {
    source: 'tradingagents',
    stance: data.decision ?? 'Check',
    read: [data.summary, data.thesis].filter(Boolean).join(' '),
    confidence: null,
  };
}

function dexterRead(raw: unknown): PositionMonitorAgentRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as {
    metrics?: unknown[];
    filings?: unknown[];
    insider?: unknown[];
    errors?: Array<{ source?: string; error?: string }>;
  };
  const metrics = Array.isArray(data.metrics) ? data.metrics.length : 0;
  const filings = Array.isArray(data.filings) ? data.filings.length : 0;
  const insider = Array.isArray(data.insider) ? data.insider.length : 0;
  const errors = Array.isArray(data.errors) ? data.errors.length : 0;
  if (metrics + filings + insider === 0 && errors === 0) return null;
  return {
    source: 'dexter',
    stance: errors > 0 ? 'Partial data' : 'Data loaded',
    read: `Dexter check loaded ${metrics} metric rows, ${filings} filings, and ${insider} insider items${errors > 0 ? `; ${errors} source issue${errors === 1 ? '' : 's'}.` : '.'}`,
    confidence: null,
  };
}

function agentBias(reads: PositionMonitorAgentRead[]): number {
  return reads.reduce((sum, read) => {
    const text = `${read.stance} ${read.read}`.toLowerCase();
    if (/\b(buy|bull|bullish|overweight|add|positive)\b/.test(text)) return sum + 1;
    if (/\b(sell|bear|bearish|underweight|short|exit|negative)\b/.test(text)) return sum - 1;
    return sum;
  }, 0);
}

function stanceDirection(read: PositionMonitorAgentRead | undefined): 'positive' | 'negative' | 'neutral' {
  if (!read) return 'neutral';
  const text = `${read.stance} ${read.read}`.toLowerCase();
  if (/\b(buy|bull|bullish|overweight|add|positive)\b/.test(text)) return 'positive';
  if (/\b(sell|bear|bearish|underweight|short|exit|negative)\b/.test(text)) return 'negative';
  return 'neutral';
}

function newsRead(
  news: ClassifiedNewsItem[],
  agentRead: PositionMonitorNewsRead | null,
): { read: string; riskCount: number; estimateCount: number; positioningCount: number } {
  const riskCount = news.filter(item => item.label === 'Risk').length;
  const estimateCount = news.filter(item => item.label === 'Estimate').length;
  const positioningCount = news.filter(item => item.label === 'Positioning').length;
  if (agentRead) {
    return {
      read: agentRead.reasoning,
      riskCount,
      estimateCount,
      positioningCount,
    };
  }
  if (riskCount >= 2) {
    return { read: `${riskCount} risk headlines loaded; treat this as exit-risk until the tape confirms otherwise.`, riskCount, estimateCount, positioningCount };
  }
  if (estimateCount > 0) {
    return { read: `${estimateCount} estimate-sensitive headline${estimateCount === 1 ? '' : 's'} loaded; monitor whether numbers or guidance move.`, riskCount, estimateCount, positioningCount };
  }
  if (positioningCount > 0) {
    return { read: `${positioningCount} positioning headline${positioningCount === 1 ? '' : 's'} loaded; watch crowding, flows, and analyst revisions.`, riskCount, estimateCount, positioningCount };
  }
  if (news.length > 0) {
    return { read: 'News tape is mostly watch-list items; no hard thesis break yet.', riskCount, estimateCount, positioningCount };
  }
  return { read: 'No fresh portfolio headline loaded; rely on price, score, and catalyst checks for now.', riskCount, estimateCount, positioningCount };
}

function buildMonitor(params: {
  position: ActivePosition;
  quote: StockQuote | null;
  news: ClassifiedNewsItem[];
  rank: RankedStock | null;
  agentReads: PositionMonitorAgentRead[];
  newsAgentRead: PositionMonitorNewsRead | null;
}): PositionMonitorResult {
  const { position, quote, news, rank, agentReads, newsAgentRead } = params;
  const livePrice = quote?.price ?? position.currentPrice;
  const pnlPct = positionEconomics(position, livePrice).pnlPct;
  const updatedScore = round1(rank?.score ?? position.currentScore);
  const scoreDelta = updatedScore - position.entryScore;
  const scoreChange = updatedScore - position.currentScore;
  const updatedSignal = rank?.signal ?? signalFromScore(updatedScore);
  const newsState = newsRead(news, newsAgentRead);
  const bias = agentBias(agentReads);
  const hedgeRead = agentReads.find(read => read.source === 'hedge_fund');
  const hedgeDirection = stanceDirection(hedgeRead);

  const riskFlags: string[] = [];
  if (pnlPct >= 15) riskFlags.push('position is extended versus entry');
  if (pnlPct <= -8) riskFlags.push('position is moving against entry');
  if (scoreDelta <= -1.25) riskFlags.push('opportunity score has deteriorated since entry');
  if (updatedSignal === 'red') riskFlags.push('current score is red');
  if (newsState.riskCount >= 2) riskFlags.push('risk headlines are stacking');
  if (bias <= -1) riskFlags.push('agent checks lean negative');

  let thesisDrift: ThesisDrift = 'stable';
  if (scoreDelta > 0.6 || (bias > 0 && newsState.riskCount === 0)) thesisDrift = 'strengthening';
  if (scoreDelta < -0.6 || newsState.riskCount >= 2 || bias < 0) thesisDrift = 'weakening';

  let action: PositionMonitorResult['action'] = 'Hold';
  if (updatedScore < 4 || scoreDelta <= -1.75 || (newsState.riskCount >= 2 && pnlPct < 2) || bias <= -2) {
    action = 'Exit';
  } else if (pnlPct >= 12 && (scoreChange <= 0 || newsState.riskCount > 0 || updatedScore < 7)) {
    action = 'Trim';
  } else if (updatedScore >= 7.5 && scoreDelta >= 0.7 && pnlPct > -5 && newsState.riskCount === 0 && bias >= 0) {
    action = 'Add';
  } else if (Math.abs(scoreDelta) < 0.4 && Math.abs(pnlPct) < 4 && newsState.riskCount === 0) {
    action = 'Watch';
  }

  const actionWantsNegativeEvidence = action === 'Trim' || action === 'Exit';
  const agentSupport =
    action === 'Watch'
      ? Math.max(0, 1 - Math.abs(bias))
      : actionWantsNegativeEvidence
        ? -bias
        : bias;
  const hedgeConflict =
    hedgeDirection === 'negative' && (action === 'Add' || action === 'Hold') ||
    hedgeDirection === 'positive' && (action === 'Trim' || action === 'Exit');
  const confidence = clamp(
    46 +
      Math.min(16, Math.abs(scoreDelta) * 6) +
      Math.min(10, Math.abs(pnlPct) * 0.65) +
      Math.max(0, agentSupport) * 8 -
      Math.max(0, -agentSupport) * 7 +
      Math.min(8, agentReads.length * 2.5) +
      (hedgeRead?.confidence ? Math.max(0, hedgeRead.confidence - 55) * 0.18 : 0) +
      (hedgeConflict ? -12 : 0) +
      (newsState.riskCount > 0 && actionWantsNegativeEvidence ? 5 : 0),
    32,
    90,
  );

  const priceRead =
    pnlPct >= 12
      ? `Price is working (+${pnlPct.toFixed(1)}% since entry), so the PM question is whether to let it run or harvest risk.`
      : pnlPct <= -8
        ? `Price is moving against the thesis (${pnlPct.toFixed(1)}% since entry); require score or catalyst support to keep holding.`
        : `Price is still inside normal swing noise (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% since entry).`;

  const scoreRead =
    scoreDelta >= 0.6
      ? `Score improved from ${position.entryScore.toFixed(1)} to ${updatedScore.toFixed(1)}; thesis is getting more support.`
      : scoreDelta <= -0.6
        ? `Score faded from ${position.entryScore.toFixed(1)} to ${updatedScore.toFixed(1)}; original setup is weaker.`
        : `Score is near entry (${position.entryScore.toFixed(1)} -> ${updatedScore.toFixed(1)}); no major thesis drift.`;

  const hedgeLine = hedgeRead
    ? `AI Hedge Fund ${hedgeConflict ? 'conflicts with' : hedgeDirection === 'neutral' ? 'is neutral on' : 'supports'} this monitor action (${hedgeRead.stance}${hedgeRead.confidence != null ? `, ${hedgeRead.confidence}%` : ''}).`
    : null;
  const agentRead = agentReads.length > 0
    ? `${hedgeLine ? `${hedgeLine} ` : ''}${agentReads.length} agent check${agentReads.length === 1 ? '' : 's'} loaded; total bias is ${bias > 0 ? 'supportive' : bias < 0 ? 'cautious' : 'mixed'}.`
    : 'Agent checks unavailable; monitor is using score, price, and news only.';

  const exitTrigger =
    action === 'Exit'
      ? 'Exit candidate: score/news/agent checks no longer support the original thesis.'
      : action === 'Trim'
        ? 'Trim candidate: price has worked or upside is less clean, so harvest some risk while keeping exposure.'
        : action === 'Add'
          ? 'Add candidate: score and thesis support improved without fresh risk headlines.'
          : action === 'Watch'
            ? 'Watch: no clear add or exit signal; wait for catalyst confirmation.'
            : 'Hold: thesis is intact enough to keep monitoring.';

  const holdTrigger =
    action === 'Exit'  ? 'Hold only if a near-term catalyst repairs the score or invalidates the risk headline.' :
    action === 'Trim'  ? 'Reduce position size if P&L target is reached or new risk headlines stack; keep a partial position while thesis holds.' :
    action === 'Add'   ? 'Press the position if score keeps rising and fresh risk headlines stay absent.' :
    action === 'Watch' ? 'Move to Hold or Add if score rises above 7 or a catalyst confirms the thesis. Exit if score deteriorates further.' :
                         'Keep holding while score stays stable, news avoids risk escalation, and price action does not break down.';

  return {
    action,
    confidence: Math.round(confidence),
    asOf: new Date().toISOString(),
    priceRead,
    scoreRead,
    newsRead: newsState.read,
    agentRead,
    exitTrigger,
    holdTrigger,
    riskFlags,
    updatedScore,
    updatedSignal,
    thesisDrift,
    agentReads,
    newsAgentRead,
  };
}

export async function POST(req: NextRequest) {
  let body: MonitorPayload;
  try {
    body = await req.json() as MonitorPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const position = parsePosition(body.position);
  if (!position) {
    return NextResponse.json({ error: 'position required' }, { status: 400 });
  }

  const ticker = position.ticker.toUpperCase();
  const origin = new URL(req.url).origin;
  const horizonWeeks = clamp(
    typeof body.horizonWeeks === 'number' ? Math.round(body.horizonWeeks) : 6,
    1,
    26,
  );
  const news = Array.isArray(body.news) ? body.news.slice(0, 6) : [];
  const quote = body.quote ?? null;

  const [rankResult, hedgeResult, tradingResult, dexterResult] = await Promise.allSettled([
    fetchRank(ticker, origin, horizonWeeks),
    fetchJson(`${origin}/api/pm/quant-monitor`, {
      method: 'POST',
      headers: internalRequestHeaders(req.headers),
      body: JSON.stringify({ ticker, autoEscalate: true }),
    }, 55_000),
    fetchJson(`${origin}/api/tradingagents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      // Multi-stage researcher debate needs the same window as quant-monitor above;
      // both run in this parallel batch so total wall time is unchanged.
    }, 55_000),
    fetchJson(`${origin}/api/dexter?action=overview&ticker=${encodeURIComponent(ticker)}&limit=4`, {
      method: 'GET',
    }, 8_000),
  ]);

  const rank = rankResult.status === 'fulfilled' ? rankResult.value : null;
  const newsAgentRead = hedgeResult.status === 'fulfilled'
    ? newsSentimentAgentRead(hedgeResult.value)
    : null;
  const agentReads = [
    hedgeResult.status === 'fulfilled' ? quantScoutRead(hedgeResult.value) : null,
    tradingResult.status === 'fulfilled' ? tradingAgentsRead(tradingResult.value) : null,
    dexterResult.status === 'fulfilled' ? dexterRead(dexterResult.value) : null,
  ].filter((read): read is PositionMonitorAgentRead => Boolean(read));

  const monitor = buildMonitor({ position, quote, news, rank, agentReads, newsAgentRead });

  // Notify on exit/trim signals or significant score drops
  if (monitor.action === 'Exit' || monitor.action === 'Trim') {
    await notifyScoreDrop({
      ticker,
      fromScore: position.entryScore,
      toScore: monitor.updatedScore,
      action: monitor.action,
      confidence: monitor.confidence,
      reason: [monitor.exitTrigger, ...monitor.riskFlags].filter(Boolean).join(' '),
    });
  }

  return NextResponse.json({ monitor }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
