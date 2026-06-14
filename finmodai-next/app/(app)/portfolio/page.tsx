'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortfolioPanel } from '@/components/portfolio/PortfolioPanel';
import { AlertFeed } from '@/components/pm/AlertFeed';
import { DecisionQueue } from '@/components/pm/DecisionQueue';
import { ThesisCards } from '@/components/pm/ThesisCards';
import { WeeklyMemoPanel } from '@/components/pm/WeeklyMemoPanel';
import { LocalStoragePositionSync } from '@/components/pm/LocalStoragePositionSync';
import { LedgerPositionHydrator } from '@/components/pm/LedgerPositionHydrator';
import type { PMAlert, InvestmentDecision, PositionThesis, WeeklyMemo } from '@/lib/pm/types';
import { cn } from '@/lib/utils';

async function resetPortfolio(): Promise<void> {
  await fetch('/api/pm/reset', { method: 'DELETE' });
  Object.keys(localStorage)
    .filter(k => k.startsWith('capitalbase:'))
    .forEach(k => localStorage.removeItem(k));
  window.location.reload();
}

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
  const [resetting, setResetting] = useState(false);
  const [pullingLedger, setPullingLedger] = useState(false);
  const [pullStatus, setPullStatus] = useState<{ tone: 'ok' | 'err'; message: string } | null>(null);

  async function handleReset() {
    if (!window.confirm('Reset portfolio? This clears all positions, theses, alerts, and decisions. Cannot be undone.')) return;
    setResetting(true);
    await resetPortfolio();
  }

  async function handlePullFromLedger() {
    if (!window.confirm('Pull positions from Ledger? This re-syncs your real holdings into the portfolio and replaces any auto-hydrated tickers.')) return;
    setPullingLedger(true);
    setPullStatus(null);
    try {
      const syncRes = await fetch('/api/portfolio/sync-ledger', { method: 'POST' });
      const syncPayload = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) {
        const reason = syncPayload?.reason ?? `HTTP ${syncRes.status}`;
        const detail = syncPayload?.detail ?? '';
        setPullStatus({ tone: 'err', message: `Sync failed: ${reason}${detail ? ` — ${detail}` : ''}` });
        return;
      }
      const synced = syncPayload?.synced ?? 0;
      const stale = Object.keys(localStorage)
        .filter(k => k.startsWith('capitalbase:portfolio:v1') || k === 'capitalbase:pm-positions-hydrated:v1');
      stale.forEach(k => localStorage.removeItem(k));
      setPullStatus({ tone: 'ok', message: `Synced ${synced} position${synced === 1 ? '' : 's'} from Ledger. Reloading…` });
      // Brief delay so the user sees confirmation before reload.
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setPullStatus({ tone: 'err', message: `Sync failed: ${(err as Error).message}` });
    } finally {
      setPullingLedger(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <LocalStoragePositionSync />
      <LedgerPositionHydrator />

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
            Swing-trade workflow
          </p>
          <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Thesis Watch</h1>
          <p className="max-w-2xl text-sm text-[var(--cb-text-muted)]">
            Track ideas by thesis, not just price. Each card auto-checks score drift, news, catalysts, and AI agent sentiment.
          </p>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handlePullFromLedger}
            disabled={pullingLedger}
            className="rounded border border-[var(--cb-border)] px-3 py-1.5 text-xs text-[var(--cb-text-secondary)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-40 cursor-pointer"
          >
            {pullingLedger ? 'Pulling…' : 'Pull from Ledger'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded border border-red-800/50 px-3 py-1.5 text-xs text-red-400 transition-colors hover:border-red-600 hover:text-red-300 disabled:opacity-40 cursor-pointer"
          >
            {resetting ? 'Resetting…' : 'Reset portfolio'}
            {/* status banner appended below */}
          </button>
        </div>
      </header>

      {pullStatus && (
        <div
          className={cn(
            'rounded-md border px-3 py-2 text-xs',
            pullStatus.tone === 'ok'
              ? 'border-[var(--cb-green)]/40 bg-[var(--cb-accent-soft)] text-[var(--cb-text-primary)]'
              : 'border-[var(--cb-danger)]/40 bg-[var(--cb-danger)]/[0.08] text-[var(--cb-text-primary)]',
          )}
        >
          {pullStatus.message}
        </div>
      )}

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
