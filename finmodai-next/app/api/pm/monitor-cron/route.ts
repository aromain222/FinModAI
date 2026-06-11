/**
 * GET /api/pm/monitor-cron
 *
 * Runs automatically at market open (9:45 AM ET) and close (4:15 PM ET),
 * Mon–Fri. Checks every active position for:
 *   - Intraday price moves > 2.5%
 *   - Target price reached
 *   - Score drops from entry
 *   - Exit / trim / add signals
 *   - Quant scout score changes across fundamentals, growth, news,
 *     sentiment, technicals, and valuation
 *   - Senior investment committee escalation for material scout events
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords } from '@/lib/pm/persistence/store';
import type { PortfolioPosition, PositionThesis } from '@/lib/pm/types';
import type { StockQuote } from '@/app/api/quotes/route';
import { monitorPositions, type PositionAlert } from '@/lib/pm/notifications/positionMonitor';
import { saveAlert } from '@/lib/pm/alerts/alertStore';
import { runQuantMonitoring } from '@/lib/pm/monitoring/runQuantMonitoring';
import type { QuantMonitoringRun } from '@/lib/pm/monitoring/types';
import { runInvestmentCommittee } from '@/lib/pm/monitoring/committee';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 300;

const DISCORD_COLORS = {
  high:   0xFF4444,
  medium: 0xFF8C00,
  low:    0x00D26A,
} as const;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function appUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (!base) return '';
  return base.startsWith('http') ? base : `https://${base}`;
}

function reviewDue(thesis: PositionThesis, now: number): boolean {
  const intervalDays = Math.max(1, Number(process.env.PM_REVIEW_INTERVAL_DAYS ?? 7));
  const reference = thesis.lastReviewedAt ?? thesis.updatedAt ?? thesis.createdAt;
  const reviewedAt = new Date(reference).getTime();
  return Number.isFinite(reviewedAt) && now - reviewedAt >= intervalDays * 86_400_000;
}

async function fetchQuotes(tickers: string[], origin: string): Promise<Map<string, StockQuote>> {
  const map = new Map<string, StockQuote>();
  if (tickers.length === 0) return map;
  try {
    const res = await fetch(
      `${origin}/api/quotes?symbols=${encodeURIComponent(tickers.join(','))}`,
      { signal: AbortSignal.timeout(10_000), cache: 'no-store' },
    );
    if (!res.ok) return map;
    const data = await res.json() as { quotes?: StockQuote[] };
    for (const q of data.quotes ?? []) map.set(q.ticker, q);
  } catch { /* quotes unavailable — proceed without */ }
  return map;
}

async function postDiscord(alert: PositionAlert, link: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: alert.title,
          url: link || undefined,
          description: alert.body,
          color: DISCORD_COLORS[alert.urgency],
          footer: { text: 'CapitalBase Position Monitor' },
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* best-effort */ }
}

async function runWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let cursor = 0;
  async function consume(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(values[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    () => consume(),
  ));
  return results;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const link = `${appUrl()}/portfolio`;

  const [positions, theses] = await Promise.all([
    listPMRecords<PortfolioPosition>('pm_positions', { limit: 200 }),
    listPMRecords<PositionThesis>('pm_position_theses', { limit: 500 }),
  ]);
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');

  if (active.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, alerts: 0 });
  }

  const tickers = [...new Set(active.map(p => p.ticker))];
  const quotes = await fetchQuotes(tickers, origin);

  const [alerts, quantResults] = await Promise.all([
    monitorPositions({ positions: active, quotes, origin }),
    runWithConcurrency(
      tickers,
      Math.max(1, Number(process.env.QUANT_MONITOR_CONCURRENCY ?? 3)),
      ticker => runQuantMonitoring({ ticker, origin, autoEscalate: true }),
    ),
  ]);

  // Persist all alerts to the in-app AlertFeed and fire Discord for high/medium
  const toNotify = alerts.filter(a => a.urgency === 'high' || a.urgency === 'medium');
  await Promise.all(alerts.map(alert => saveAlert({
    id: crypto.randomUUID(),
    ticker: alert.ticker,
    alertType: 'position_monitor' as const,
    severity: alert.urgency === 'high' ? 'high' : alert.urgency === 'medium' ? 'medium' : 'low',
    title: alert.title,
    summary: alert.body,
    impactDirection: (['exit_signal', 'score_drop', 'sell_suggestion', 'trim_signal'].includes(alert.type) ? 'bearish' : alert.type === 'add_signal' ? 'bullish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
    suggestedAction: (['exit_signal', 'sell_suggestion'].includes(alert.type) ? 'review' : alert.type === 'add_signal' ? 'add' : 'watch') as 'review' | 'add' | 'watch',
    confidence: 75,
    affectedTheme: null,
    affectedThesis: null,
    shouldNotifyPM: alert.urgency === 'high',
    evidence: [],
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  })));

  for (const alert of toNotify) {
    await postDiscord(alert, link);
  }

  const quantRuns = quantResults
    .filter((result): result is PromiseFulfilledResult<QuantMonitoringRun> => result.status === 'fulfilled')
    .map(result => result.value);
  const quantFailures = quantResults.flatMap((result, index) => result.status === 'rejected'
    ? [{
        ticker: tickers[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }]
    : []);
  const latestThesisByTicker = new Map<string, PositionThesis>();
  for (const thesis of theses) {
    if (!latestThesisByTicker.has(thesis.ticker)) latestThesisByTicker.set(thesis.ticker, thesis);
  }
  const committeeTickers = new Set(
    quantRuns.filter(run => run.committeeRunId).map(run => run.ticker),
  );
  const dueReviewTickers = tickers.filter(ticker => {
    const thesis = latestThesisByTicker.get(ticker);
    return thesis ? reviewDue(thesis, Date.now()) && !committeeTickers.has(ticker) : false;
  });
  const reviewResults = await runWithConcurrency(
    dueReviewTickers,
    Math.max(1, Number(process.env.PM_REVIEW_CONCURRENCY ?? 1)),
    ticker => runInvestmentCommittee({
      ticker,
      trigger: 'review_date',
      origin,
    }),
  );
  const reviewFailures = reviewResults.flatMap((result, index) => result.status === 'rejected'
    ? [{
        ticker: dueReviewTickers[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }]
    : []);

  return NextResponse.json({
    ok: true,
    checked: active.length,
    alerts: alerts.length,
    notified: toNotify.length,
    quantMonitoring: {
      refreshed: quantRuns.length,
      failed: quantFailures.length,
      snapshots: quantRuns.reduce((sum, run) => sum + run.snapshots.length, 0),
      signalEvents: quantRuns.reduce((sum, run) => sum + run.events.length, 0),
      escalations: quantRuns.reduce((sum, run) => sum + run.escalatedEvents.length, 0),
      committeeRuns: quantRuns.filter(run => run.committeeRunId).length,
      failures: quantFailures,
    },
    scheduledReviews: {
      due: dueReviewTickers.length,
      completed: reviewResults.filter(result => result.status === 'fulfilled').length,
      failures: reviewFailures,
    },
    fired: toNotify.map(a => ({ ticker: a.ticker, type: a.type, urgency: a.urgency })),
  });
}
