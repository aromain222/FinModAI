'use client';

import type { PortfolioPosition, PMAlert, InvestmentDecision } from '@/lib/pm/types';

type Props = {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
  decisions: InvestmentDecision[];
};

type ThesisHealthCounts = {
  intact: number;
  strengthening: number;
  weakening: number;
  broken: number;
};

function severityOrder(s: PMAlert['severity']): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5;
}

export function CommandCenter({ positions, alerts, decisions }: Props) {
  const active = positions.filter((p) => p.status === 'active');
  const openAlerts = alerts.filter((a) => !a.acknowledged);
  const pending = decisions.filter((d) => d.approvalStatus === 'pending');

  const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
  const highCount = openAlerts.filter((a) => a.severity === 'high').length;

  const health: ThesisHealthCounts = {
    intact: 0,
    strengthening: 0,
    weakening: 0,
    broken: 0,
  };
  for (const p of active) {
    const s = p.thesisIntegrity;
    if (s === 'intact') health.intact++;
    else if (s === 'strengthening') health.strengthening++;
    else if (s === 'weakening') health.weakening++;
    else if (s === 'broken') health.broken++;
    else health.intact++;
  }

  const highestSeverity = openAlerts.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))[0]?.severity;

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)] px-5 py-3"
      role="region"
      aria-label="Portfolio command center"
    >
      {/* Active positions */}
      <Stat
        label="Active Positions"
        value={String(active.length)}
        empty={active.length === 0}
      />

      <Divider />

      {/* Open alerts */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
          Open Alerts
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={
              openAlerts.length === 0
                ? 'text-sm font-semibold text-[var(--cb-text-muted)]'
                : highestSeverity === 'critical'
                ? 'text-sm font-semibold text-red-500'
                : highestSeverity === 'high'
                ? 'text-sm font-semibold text-amber-500'
                : 'text-sm font-semibold text-[var(--cb-text-primary)]'
            }
          >
            {openAlerts.length}
          </span>
          {criticalCount > 0 && (
            <span className="rounded px-1 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-500">
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded px-1 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-500">
              {highCount} high
            </span>
          )}
        </div>
      </div>

      <Divider />

      {/* Pending decisions */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
          Pending Approval
        </span>
        <span
          className={
            pending.length > 0
              ? 'text-sm font-semibold text-amber-500'
              : 'text-sm font-semibold text-[var(--cb-text-muted)]'
          }
        >
          {pending.length === 0 ? 'None' : `${pending.length} decision${pending.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <Divider />

      {/* Thesis health */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
          Thesis Health
        </span>
        {active.length === 0 ? (
          <span className="text-sm text-[var(--cb-text-muted)]">—</span>
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            {health.intact > 0 && (
              <span className="text-[var(--cb-green)] font-medium">{health.intact} intact</span>
            )}
            {health.strengthening > 0 && (
              <span className="text-emerald-400 font-medium">{health.strengthening} strengthening</span>
            )}
            {health.weakening > 0 && (
              <span className="text-amber-500 font-medium">{health.weakening} weakening</span>
            )}
            {health.broken > 0 && (
              <span className="text-red-500 font-medium">{health.broken} broken</span>
            )}
            {health.intact + health.strengthening + health.weakening + health.broken === 0 && (
              <span className="text-[var(--cb-text-muted)]">No thesis data</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, empty }: { label: string; value: string; empty?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
        {label}
      </span>
      <span
        className={`text-sm font-semibold ${empty ? 'text-[var(--cb-text-muted)]' : 'text-[var(--cb-text-primary)]'}`}
      >
        {empty ? '0' : value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-[var(--cb-border-subtle)]" aria-hidden />;
}
