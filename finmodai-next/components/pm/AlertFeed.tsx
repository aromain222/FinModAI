'use client';

import { useState } from 'react';
import type { PMAlert, ImpactDirection } from '@/lib/pm/types';
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Props = {
  alerts: PMAlert[];
  onAcknowledge: (id: string) => Promise<void>;
};

function severityOrder(s: PMAlert['severity']): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5;
}

function SeverityBadge({ severity }: { severity: PMAlert['severity'] }) {
  const styles: Record<PMAlert['severity'], string> = {
    critical: 'bg-red-500/10 text-red-500 border-red-500/30',
    high:     'bg-amber-500/10 text-amber-500 border-amber-500/30',
    medium:   'bg-blue-400/10 text-blue-400 border-blue-400/30',
    low:      'bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] border-[var(--cb-border-subtle)]',
    info:     'bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] border-[var(--cb-border-subtle)]',
  };
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${styles[severity]}`}>
      {severity}
    </span>
  );
}

function ImpactIcon({ direction }: { direction: ImpactDirection }) {
  if (direction === 'bullish') return <TrendingUp className="h-3 w-3 text-[var(--cb-green)]" />;
  if (direction === 'bearish') return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-[var(--cb-text-muted)]" />;
}

function AlertRow({ alert, onAcknowledge }: { alert: PMAlert; onAcknowledge: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alert.acknowledged ?? false);

  async function handleAck() {
    if (busy || done) return;
    setBusy(true);
    try {
      await onAcknowledge(alert.id);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-opacity ${
        done ? 'opacity-40' : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]'
      } ${alert.severity === 'critical' ? 'border-l-2 border-l-red-500' : ''} ${
        alert.severity === 'high' ? 'border-l-2 border-l-amber-500' : ''
      }`}
    >
      <AlertTriangle
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
          alert.severity === 'critical' ? 'text-red-500' :
          alert.severity === 'high'     ? 'text-amber-500' :
          alert.severity === 'medium'   ? 'text-blue-400' :
          'text-[var(--cb-text-muted)]'
        }`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          {alert.ticker && (
            <span className="text-xs font-semibold text-[var(--cb-text-primary)]">{alert.ticker}</span>
          )}
          <span className="text-xs font-medium text-[var(--cb-text-secondary)]">{alert.title}</span>
        </div>
        <p className="text-xs text-[var(--cb-text-muted)] leading-relaxed">{alert.summary}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-[var(--cb-text-muted)]">
            <ImpactIcon direction={alert.impactDirection} />
            <span className="capitalize">{alert.impactDirection}</span>
          </div>
          {alert.suggestedAction && (
            <span className="text-xs text-[var(--cb-text-muted)]">
              Suggested: <span className="text-[var(--cb-text-secondary)] capitalize">{alert.suggestedAction}</span>
            </span>
          )}
          <span className="text-[10px] text-[var(--cb-text-muted)]">
            {new Date(alert.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleAck}
        disabled={busy || done}
        aria-label={done ? 'Acknowledged' : 'Acknowledge alert'}
        className={`shrink-0 rounded border px-2 py-1 text-[10px] font-medium transition-all ${
          done
            ? 'border-[var(--cb-border-subtle)] text-[var(--cb-text-muted)] cursor-default'
            : 'border-[var(--cb-border)] text-[var(--cb-text-secondary)] hover:border-[var(--cb-green)] hover:text-[var(--cb-green)]'
        }`}
      >
        {done ? <CheckCircle className="h-3 w-3" /> : busy ? '...' : 'Ack'}
      </button>
    </div>
  );
}

export function AlertFeed({ alerts, onAcknowledge }: Props) {
  const sorted = [...alerts].sort((a, b) => {
    const sev = severityOrder(a.severity) - severityOrder(b.severity);
    if (sev !== 0) return sev;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const open = sorted.filter((a) => !a.acknowledged);
  const acked = sorted.filter((a) => a.acknowledged);

  return (
    <section aria-label="Alert feed">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
        Alert Feed
        {open.length > 0 && (
          <span className="ml-2 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500">
            {open.length}
          </span>
        )}
      </h2>
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-6 py-8 text-center">
          <p className="text-sm font-medium text-[var(--cb-text-secondary)]">No alerts. All clear.</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Alerts fire when thesis breaks, conviction drops, or agent signals conflict.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {open.map((a) => (
            <AlertRow key={a.id} alert={a} onAcknowledge={onAcknowledge} />
          ))}
          {acked.length > 0 && open.length > 0 && (
            <p className="pt-1 text-[10px] text-[var(--cb-text-muted)]">
              {acked.length} acknowledged alert{acked.length > 1 ? 's' : ''} hidden
            </p>
          )}
          {acked.length > 0 && open.length === 0 && (
            <div className="rounded-lg border border-[var(--cb-border-subtle)] px-4 py-3 text-center">
              <p className="text-xs text-[var(--cb-text-muted)]">All {acked.length} alerts acknowledged.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
