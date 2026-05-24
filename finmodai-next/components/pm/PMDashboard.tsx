'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PortfolioPosition, PMAlert, InvestmentDecision, PositionThesis, WeeklyMemo } from '@/lib/pm/types';
import { CommandCenter } from './CommandCenter';
import { PositionsByTheme } from './PositionsByTheme';
import { AlertFeed } from './AlertFeed';
import { DecisionQueue } from './DecisionQueue';
import { ThesisCards } from './ThesisCards';
import { WeeklyMemoPanel } from './WeeklyMemoPanel';
import { PMLoadingSkeleton } from './PMLoadingSkeleton';

type DashboardData = {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
  theses: PositionThesis[];
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
      const [posRes, alertRes, decRes, thesisRes, memoRes] = await Promise.allSettled([
        fetchJson<{ positions: PortfolioPosition[] }>('/api/pm/positions'),
        fetchJson<{ alerts: PMAlert[] }>('/api/pm/alerts'),
        fetchJson<{ decisions: InvestmentDecision[] }>('/api/pm/decisions'),
        fetchJson<{ theses: PositionThesis[] }>('/api/pm/theses'),
        fetchJson<{ memos: WeeklyMemo[] }>('/api/pm/weekly-memo'),
      ]);

      setData({
        positions: posRes.status === 'fulfilled' ? posRes.value.positions : [],
        alerts:    alertRes.status === 'fulfilled' ? alertRes.value.alerts : [],
        decisions: decRes.status === 'fulfilled' ? decRes.value.decisions : [],
        theses:    thesisRes.status === 'fulfilled' ? thesisRes.value.theses : [],
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
    positions: [], alerts: [], decisions: [], theses: [], memo: null,
  };

  return (
    <div className="space-y-8">
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
