'use client';

import { useState } from 'react';
import type { InvestmentDecision, TradeAction } from '@/lib/pm/types';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

type Props = {
  decisions: InvestmentDecision[];
  onDecision: (id: string, action: 'approve' | 'reject' | 'defer') => Promise<void>;
};

const ACTION_COLORS: Record<TradeAction, string> = {
  buy:   'bg-[var(--cb-green)]/10 text-[var(--cb-green)] border-[var(--cb-green)]/30',
  sell:  'bg-red-500/10 text-red-500 border-red-500/30',
  hold:  'bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] border-[var(--cb-border)]',
  short: 'bg-red-500/10 text-red-500 border-red-500/30',
  cover: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
  trim:  'bg-amber-500/10 text-amber-500 border-amber-500/30',
  add:   'bg-[var(--cb-green)]/10 text-[var(--cb-green)] border-[var(--cb-green)]/30',
  watch: 'bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)] border-[var(--cb-border)]',
  exit:  'bg-red-500/10 text-red-500 border-red-500/30',
};

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? 'bg-[var(--cb-green)]' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 rounded-full bg-[var(--cb-border)]">
        <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-[var(--cb-text-muted)]">{pct}%</span>
    </div>
  );
}

function DecisionCard({ decision, onDecision }: { decision: InvestmentDecision; onDecision: Props['onDecision'] }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | 'defer' | null>(null);
  const [settled, setSettled] = useState<string | null>(null);

  const confidence = decision.confidenceScore ?? decision.confidence;
  const rationale = decision.rationaleText ?? decision.rationale;
  const action = decision.recommendedAction ?? decision.action;
  const actionStyle = ACTION_COLORS[action] ?? ACTION_COLORS.hold;

  async function handle(act: 'approve' | 'reject' | 'defer') {
    if (busy || settled) return;
    setBusy(act);
    try {
      await onDecision(decision.id, act);
      setSettled(act);
    } finally {
      setBusy(null);
    }
  }

  if (settled) {
    const labels = { approve: 'Approved', reject: 'Rejected', defer: 'Deferred' };
    const colors = {
      approve: 'border-[var(--cb-green)]/30 bg-[var(--cb-green)]/5',
      reject:  'border-red-500/30 bg-red-500/5',
      defer:   'border-amber-500/30 bg-amber-500/5',
    };
    return (
      <div className={`rounded-lg border px-3 py-2.5 ${colors[settled as keyof typeof colors]} opacity-60`}>
        <p className="text-xs text-[var(--cb-text-muted)]">
          {decision.ticker} — {labels[settled as keyof typeof labels]}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-[var(--cb-surface)] px-3 py-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--cb-text-primary)]">{decision.ticker}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${actionStyle}`}>
              {action}
            </span>
          </div>
          {decision.recommendedSizing && (
            <p className="text-[10px] text-[var(--cb-text-muted)]">Sizing: {decision.recommendedSizing}</p>
          )}
        </div>
        <ConfidenceBar score={confidence} />
      </div>

      {/* Rationale */}
      <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">{rationale}</p>

      {/* Created */}
      <p className="text-[10px] text-[var(--cb-text-muted)]">
        Submitted {new Date(decision.createdAt).toLocaleDateString()}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => void handle('approve')}
          disabled={!!busy}
          className="flex items-center gap-1 rounded border border-[var(--cb-green)]/40 bg-[var(--cb-green)]/10 px-2.5 py-1 text-xs font-medium text-[var(--cb-green)] transition-all hover:bg-[var(--cb-green)]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle className="h-3 w-3" />
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => void handle('reject')}
          disabled={!!busy}
          className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <XCircle className="h-3 w-3" />
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button
          type="button"
          onClick={() => void handle('defer')}
          disabled={!!busy}
          className="flex items-center gap-1 rounded border border-[var(--cb-border)] px-2.5 py-1 text-xs font-medium text-[var(--cb-text-muted)] transition-all hover:border-amber-500/40 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clock className="h-3 w-3" />
          {busy === 'defer' ? 'Deferring…' : 'Defer'}
        </button>
      </div>
    </div>
  );
}

export function DecisionQueue({ decisions, onDecision }: Props) {
  const pending = decisions.filter((d) => d.approvalStatus === 'pending');
  const recent = decisions.filter((d) => d.approvalStatus !== 'pending').slice(0, 3);

  return (
    <section aria-label="PM approval queue">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
        Approval Queue
        {pending.length > 0 && (
          <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
            {pending.length}
          </span>
        )}
      </h2>
      {decisions.length === 0 ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-6 py-8 text-center">
          <p className="text-sm font-medium text-[var(--cb-text-secondary)]">No decisions pending approval.</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Recommendations appear here when the Intelligence Engine flags a conviction change.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((d) => (
            <DecisionCard key={d.id} decision={d} onDecision={onDecision} />
          ))}
          {recent.length > 0 && pending.length > 0 && (
            <p className="pt-1 text-[10px] text-[var(--cb-text-muted)]">
              {recent.length} recently resolved decision{recent.length > 1 ? 's' : ''} not shown.
            </p>
          )}
          {pending.length === 0 && recent.length > 0 && (
            <div className="rounded-lg border border-[var(--cb-border-subtle)] px-4 py-3 text-center">
              <p className="text-xs text-[var(--cb-text-muted)]">
                No pending decisions. {recent.length} resolved this week.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
