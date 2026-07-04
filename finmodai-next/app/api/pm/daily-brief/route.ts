/**
 * GET /api/pm/daily-brief
 *
 * Morning research loop: re-consult the resident agents on the user's held
 * names, run a discovery scan for new ideas, and return a markdown brief with
 * the full theses. Read-only with respect to trading — execution is never
 * requested; picks land as pending InvestmentDecisions only.
 *
 * Scheduled by .github/workflows/daily-brief.yml, which posts the markdown as
 * a GitHub issue (GitHub then emails it to watchers). Protected by the same
 * cron/execution bearer secrets as the trading-agent cron route.
 *
 * Query params:
 *   holdings     comma-separated tickers to re-consult (overrides
 *                DAILY_BRIEF_HOLDINGS / pm_positions)
 *   personality  steward | operator | hunter
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailyBrief } from '@/lib/pm/tradingAgent/dailyBrief';
import { isPersonalityKey } from '@/lib/pm/tradingAgent/personality';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const executionSecret = process.env.EXECUTION_CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (executionSecret && auth === `Bearer ${executionSecret}`) return true;
  // Locally (no VERCEL env) allow, so dev runs work without ceremony.
  return !process.env.VERCEL;
}

function appOrigin(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const holdingsParam = req.nextUrl.searchParams.get('holdings');
  const personalityParam = req.nextUrl.searchParams.get('personality');
  if (personalityParam && !isPersonalityKey(personalityParam)) {
    return NextResponse.json(
      { error: `Unknown personality "${personalityParam}" — use steward, operator, or hunter.` },
      { status: 400 },
    );
  }

  try {
    const brief = await runDailyBrief({
      origin: appOrigin(req),
      requestHeaders: req.headers,
      holdings: holdingsParam
        ? holdingsParam.split(',').map(ticker => ticker.trim()).filter(Boolean)
        : undefined,
      personality: personalityParam && isPersonalityKey(personalityParam) ? personalityParam : undefined,
    });

    return NextResponse.json({
      ranAt: brief.ranAt,
      holdings: brief.holdings,
      personality: brief.discoveryRun.personality,
      bookReads: (brief.holdingsRun?.scanned ?? []).map(analysis => ({
        ticker: analysis.candidate.ticker,
        action: analysis.consensus.action,
        stance: analysis.consensus.stance,
        confidence: analysis.consensus.confidence,
        agreement: analysis.consensus.agreement,
      })),
      discoveryPicks: brief.discoveryRun.picks.map(pick => ({
        ticker: pick.ticker,
        selectionScore: pick.selectionScore,
        notional: pick.sizing.notional,
        decisionId: pick.decision.id,
      })),
      markdown: brief.markdown,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Daily brief failed' },
      { status: 502 },
    );
  }
}
