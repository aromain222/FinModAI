'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentView, PortfolioPosition, PMAlert, InvestmentDecision, PositionThesis, WeeklyMemo } from '@/lib/pm/types';
import { CommandCenter } from './CommandCenter';
import { PositionsByTheme } from './PositionsByTheme';
import { AlertFeed } from './AlertFeed';
import { DecisionQueue } from './DecisionQueue';
import { ThesisCards } from './ThesisCards';
import { WeeklyMemoPanel } from './WeeklyMemoPanel';
import { PMLoadingSkeleton } from './PMLoadingSkeleton';
import { LocalStoragePositionSync } from './LocalStoragePositionSync';
import { PortfolioChat } from './PortfolioChat';

type DashboardData = {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
  theses: PositionThesis[];
  agentViews: AgentView[];
  memo: WeeklyMemo | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

export function PMDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [posRes, alertRes, decRes, thesisRes, agentRes, memoRes] = await Promise.allSettled([
        fetchJson<{ positions: PortfolioPosition[] }>('/api/pm/positions'),
        fetchJson<{ alerts: PMAlert[] }>('/api/pm/alerts'),
        fetchJson<{ decisions: InvestmentDecision[] }>('/api/pm/decisions'),
        fetchJson<{ theses: PositionThesis[] }>('/api/pm/theses'),
        fetchJson<{ agentViews: AgentView[] }>('/api/pm/agent-views?limit=500'),
        fetchJson<{ memos: WeeklyMemo[] }>('/api/pm/weekly-memo'),
      ]);

      const rawPositions = posRes.status === 'fulfilled' ? posRes.value.positions : [];
      const theses = thesisRes.status === 'fulfilled' ? thesisRes.value.theses : [];
      const agentViews = agentRes.status === 'fulfilled' ? agentRes.value.agentViews : [];
      const latestThesisByTicker = latestByTicker(theses);
      const viewsByTicker = groupViewsByTicker(agentViews);

      setData({
        positions: rawPositions.map((position) => enrichPosition(position, latestThesisByTicker.get(position.ticker), viewsByTicker.get(position.ticker) ?? [])),
        alerts:    alertRes.status === 'fulfilled' ? alertRes.value.alerts : [],
        decisions: decRes.status === 'fulfilled' ? decRes.value.decisions : [],
        theses,
        agentViews,
        memo:      memoRes.status === 'fulfilled' ? (memoRes.value.memos[0] ?? null) : null,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PM OS data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function handleAcknowledge(id: string) {
    await fetch(`/api/pm/alerts/${id}/acknowledge`, { method: 'POST' });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        alerts: prev.alerts.map((a) =>
          a.id === id ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() } : a,
        ),
      };
    });
  }

  async function handleDecision(id: string, action: 'approve' | 'reject' | 'defer') {
    await fetch(`/api/pm/decisions/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const statusMap = { approve: 'approved', reject: 'rejected', defer: 'deferred' } as const;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        decisions: prev.decisions.map((d) =>
          d.id === id ? { ...d, approvalStatus: statusMap[action] } : d,
        ),
      };
    });
  }

  async function handleGenerateMemo() {
    const res = await fetch('/api/pm/weekly-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generate: true }),
    });
    if (!res.ok) throw new Error('Memo generation failed');
    const body = await res.json() as { memo: WeeklyMemo };
    setData((prev) => prev ? { ...prev, memo: body.memo } : prev);
  }

  if (loading) return <PMLoadingSkeleton />;

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-8 text-center">
        <p className="text-sm font-medium text-red-500">Failed to load PM OS</p>
        <p className="mt-1 text-xs text-[var(--cb-text-muted)]">{error}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadAll(); }}
          className="mt-3 rounded border border-[var(--cb-border)] px-3 py-1.5 text-xs text-[var(--cb-text-secondary)] hover:border-[var(--cb-green)] hover:text-[var(--cb-green)]"
        >
          Retry
        </button>
      </div>
    );
  }

  const { positions, alerts, decisions, theses, memo } = data ?? {
    positions: [], alerts: [], decisions: [], theses: [], agentViews: [], memo: null,
  };

  return (
    <div className="space-y-8">
      <LocalStoragePositionSync />
      <PortfolioChat />
      {/* Section 1: Portfolio Command Center */}
      <CommandCenter positions={positions} alerts={alerts} decisions={decisions} />

      {/* Sections 2 + 3: Positions by Theme and Alert Feed (two-column) */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <PositionsByTheme positions={positions} alerts={alerts} />
        <AlertFeed alerts={alerts} onAcknowledge={handleAcknowledge} />
      </div>

      {/* Section 4: Approval Queue */}
      <DecisionQueue decisions={decisions} onDecision={handleDecision} />

      {/* Section 5: Thesis Cards */}
      <ThesisCards theses={theses} />

      {/* Section 7: Weekly Memo */}
      <WeeklyMemoPanel memo={memo} onGenerate={handleGenerateMemo} />
    </div>
  );
}

function latestByTicker(theses: PositionThesis[]): Map<string, PositionThesis> {
  const map = new Map<string, PositionThesis>();
  for (const thesis of theses) {
    const current = map.get(thesis.ticker);
    if (!current || thesis.updatedAt > current.updatedAt) map.set(thesis.ticker, thesis);
  }
  return map;
}

function groupViewsByTicker(views: AgentView[]): Map<string, AgentView[]> {
  const map = new Map<string, AgentView[]>();
  for (const view of views) {
    const list = map.get(view.ticker) ?? [];
    list.push(view);
    map.set(view.ticker, list);
  }
  for (const [ticker, list] of map) {
    map.set(ticker, list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12));
  }
  return map;
}

function deriveConsensus(views: AgentView[]): PortfolioPosition['agentConsensus'] | undefined {
  if (views.length === 0) return undefined;
  const counts = views.reduce<Record<string, number>>((acc, view) => {
    const stance = view.stance === 'mixed' ? 'split' : view.stance;
    acc[stance] = (acc[stance] ?? 0) + 1;
    return acc;
  }, {});
  if ((counts.bullish ?? 0) > 0 && (counts.bearish ?? 0) > 0) return 'split';
  if ((counts.bullish ?? 0) >= Math.max(counts.bearish ?? 0, counts.neutral ?? 0, counts.split ?? 0)) return 'bullish';
  if ((counts.bearish ?? 0) >= Math.max(counts.bullish ?? 0, counts.neutral ?? 0, counts.split ?? 0)) return 'bearish';
  return (counts.split ?? 0) > 0 ? 'split' : 'neutral';
}

function enrichPosition(position: PortfolioPosition, thesis: PositionThesis | undefined, views: AgentView[]): PortfolioPosition {
  const latestView = views[0];
  const thesisIntegrity = thesis?.integrityStatus ?? (
    thesis?.thesisStatus === 'holding' ? 'intact' :
    thesis?.thesisStatus === 'building' ? 'under_review' :
    thesis?.thesisStatus === 'closed' ? 'resolved' :
    thesis?.thesisStatus
  ) ?? position.thesisIntegrity;
  return {
    ...position,
    thesisIntegrity,
    convictionScore: thesis?.convictionScore ?? position.convictionScore ?? latestView?.conviction ?? null,
    currentScore: thesis?.currentScore ?? thesis?.convictionScore ?? position.currentScore ?? latestView?.conviction ?? null,
    entryScore: thesis?.entryScore ?? position.entryScore ?? null,
    agentConsensus: deriveConsensus(views) ?? position.agentConsensus,
    lastAgentRunAt: latestView?.createdAt ?? position.lastAgentRunAt,
  };
}
