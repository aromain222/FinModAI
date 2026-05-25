'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortfolioPanel } from '@/components/portfolio/PortfolioPanel';
import { AlertFeed } from '@/components/pm/AlertFeed';
import { DecisionQueue } from '@/components/pm/DecisionQueue';
import { ThesisCards } from '@/components/pm/ThesisCards';
import { WeeklyMemoPanel } from '@/components/pm/WeeklyMemoPanel';
import { LocalStoragePositionSync } from '@/components/pm/LocalStoragePositionSync';
import type { PMAlert, InvestmentDecision, PositionThesis, WeeklyMemo } from '@/lib/pm/types';
import { cn } from '@/lib/utils';

type Tab = 'monitor' | 'workflow';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

function WorkflowTab() {
  const [alerts, setAlerts] = useState<PMAlert[]>([]);
  const [decisions, setDecisions] = useState<InvestmentDecision[]>([]);
  const [theses, setTheses] = useState<PositionThesis[]>([]);
  const [memo, setMemo] = useState<WeeklyMemo | null>(null);

  const loadAll = useCallback(async () => {
    const [alertRes, decRes, thesisRes, memoRes] = await Promise.allSettled([
      fetchJson<{ alerts: PMAlert[] }>('/api/pm/alerts'),
      fetchJson<{ decisions: InvestmentDecision[] }>('/api/pm/decisions'),
      fetchJson<{ theses: PositionThesis[] }>('/api/pm/theses'),
      fetchJson<{ memos: WeeklyMemo[] }>('/api/pm/weekly-memo'),
    ]);
    if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.alerts);
    if (decRes.status === 'fulfilled') setDecisions(decRes.value.decisions);
    if (thesisRes.status === 'fulfilled') setTheses(thesisRes.value.theses);
    if (memoRes.status === 'fulfilled') setMemo(memoRes.value.memos[0] ?? null);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function handleAcknowledge(id: string) {
    await fetch(`/api/pm/alerts/${id}/acknowledge`, { method: 'POST' });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() } : a));
  }

  async function handleDecision(id: string, action: 'approve' | 'reject' | 'defer') {
    await fetch(`/api/pm/decisions/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const statusMap = { approve: 'approved', reject: 'rejected', defer: 'deferred' } as const;
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, approvalStatus: statusMap[action] } : d));
  }

  async function handleGenerateMemo() {
    const res = await fetch('/api/pm/weekly-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generate: true }),
    });
    if (!res.ok) return;
    const body = await res.json() as { memo: WeeklyMemo };
    setMemo(body.memo);
  }

  return (
    <div className="space-y-6">
      <AlertFeed alerts={alerts} onAcknowledge={handleAcknowledge} />
      <DecisionQueue decisions={decisions} onDecision={handleDecision} />
      <ThesisCards theses={theses} />
      <WeeklyMemoPanel memo={memo} onGenerate={handleGenerateMemo} />
    </div>
  );
}

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'monitor',  label: 'Monitor',  hint: 'P&L · score drift · PM actions' },
  { id: 'workflow', label: 'Workflow', hint: 'Alerts · approvals · theses · memo' },
];

export default function PortfolioPage() {
  const [tab, setTab] = useState<Tab>('monitor');

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <LocalStoragePositionSync />

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
          Swing-trade workflow
        </p>
        <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Thesis Watch</h1>
        <p className="max-w-2xl text-sm text-[var(--cb-text-muted)]">
          Track ideas by thesis, not just price. Each card auto-checks score drift, news, catalysts, and AI agent sentiment.
        </p>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--cb-border)]">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 pb-2.5 pt-1 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-b-2 border-[var(--cb-green)] text-[var(--cb-text-primary)]'
                : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
            )}
          >
            {t.label}
            <span className="ml-1.5 hidden text-[10px] font-normal text-[var(--cb-text-muted)] sm:inline">
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      {tab === 'monitor'  && <PortfolioPanel />}
      {tab === 'workflow' && <WorkflowTab />}
    </main>
  );
}
