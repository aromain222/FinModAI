import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords } from '@/lib/pm/persistence/store';
import type { AgentView } from '@/lib/pm/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const COMMITTEE_AGENT_NAME = 'Senior Investment Committee';

type CommitteeSignal = {
  key: string;
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  thesis: string;
  risk?: string;
  watch?: string;
};

type CommitteeDebate = {
  id: string;
  ticker: string;
  createdAt: string;
  runAt?: string;
  stance: AgentView['stance'];
  conviction: number;
  reasoning: string;
  summary?: string;
  action?: string;
  sizing?: string;
  decision: { action: string; confidence: number; reasoning: string; sizing?: string } | null;
  consensus: { bullish: number; bearish: number; neutral: number } | null;
  signals: CommitteeSignal[];
  trigger?: string;
};

function extractDebate(view: AgentView): CommitteeDebate {
  const raw = (view.rawOutput ?? {}) as {
    decision?: { action?: string; confidence?: number; reasoning?: string; sizing?: string } | null;
    consensus?: { bullish?: number; bearish?: number; neutral?: number };
    signals?: Array<{ key?: string; name?: string; signal?: 'bullish' | 'bearish' | 'neutral'; confidence?: number; reasoning?: string; thesis?: string; risk?: string; watch?: string }>;
    trigger?: string;
  };
  const signals: CommitteeSignal[] = (raw.signals ?? []).map(s => ({
    key: s.key ?? '',
    name: s.name ?? s.key ?? 'Unknown',
    signal: s.signal ?? 'neutral',
    confidence: s.confidence ?? 0,
    reasoning: s.reasoning ?? '',
    thesis: s.thesis ?? '',
    risk: s.risk,
    watch: s.watch,
  }));
  return {
    id: view.id,
    ticker: view.ticker,
    createdAt: view.createdAt,
    runAt: view.runAt,
    stance: view.stance,
    conviction: view.conviction,
    reasoning: view.reasoning,
    summary: view.summary,
    action: view.action,
    sizing: view.sizing,
    decision: raw.decision
      ? {
          action: raw.decision.action ?? 'hold',
          confidence: raw.decision.confidence ?? 0,
          reasoning: raw.decision.reasoning ?? '',
          sizing: raw.decision.sizing,
        }
      : null,
    consensus: raw.consensus
      ? {
          bullish: raw.consensus.bullish ?? 0,
          bearish: raw.consensus.bearish ?? 0,
          neutral: raw.consensus.neutral ?? 0,
        }
      : null,
    signals,
    trigger: raw.trigger,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get('ticker');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 30), 1), 100);

  // Pull recent AgentViews and filter to committee. We don't index by agentName, so a small
  // over-fetch + client-side filter is the pragmatic path.
  const views = await listPMRecords<AgentView>('pm_agent_views', {
    ticker: ticker ?? undefined,
    limit: limit * 3,
  });
  const committee = views
    .filter(v => v.agentName === COMMITTEE_AGENT_NAME)
    .slice(0, limit)
    .map(extractDebate);

  return NextResponse.json({
    debates: committee,
    latest: committee[0] ?? null,
  });
}
