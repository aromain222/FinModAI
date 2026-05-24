'use client';

import type { PortfolioPosition, PMAlert, ThesisIntegrityStatus } from '@/lib/pm/types';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

const DEFAULT_THEMES = [
  'AI Infrastructure',
  'Defensive Compounders',
  'Speculative Growth',
  'Macro Sensitive',
  'Special Situations',
  'Energy Transition',
];

type Props = {
  positions: PortfolioPosition[];
  alerts: PMAlert[];
};

function integrityColor(status: ThesisIntegrityStatus | undefined): string {
  switch (status) {
    case 'intact':       return 'text-[var(--cb-green)]';
    case 'strengthening': return 'text-emerald-400';
    case 'weakening':    return 'text-amber-500';
    case 'broken':       return 'text-red-500';
    case 'under_review': return 'text-blue-400';
    case 'resolved':     return 'text-[var(--cb-text-muted)]';
    default:             return 'text-[var(--cb-text-muted)]';
  }
}

function integrityBg(status: ThesisIntegrityStatus | undefined): string {
  switch (status) {
    case 'intact':       return 'bg-[var(--cb-green)]/10 text-[var(--cb-green)]';
    case 'strengthening': return 'bg-emerald-400/10 text-emerald-400';
    case 'weakening':    return 'bg-amber-500/10 text-amber-500';
    case 'broken':       return 'bg-red-500/10 text-red-500';
    case 'under_review': return 'bg-blue-400/10 text-blue-400';
    default:             return 'bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]';
  }
}

function ConvictionDrift({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-[var(--cb-text-muted)]">—</span>;
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? 'bg-[var(--cb-green)]' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5" title={`Conviction: ${pct}`}>
      <div className="h-1.5 w-14 rounded-full bg-[var(--cb-border)]">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-[var(--cb-text-muted)]">{pct}</span>
    </div>
  );
}

function AlertBadge({ alert }: { alert: PMAlert }) {
  const color =
    alert.severity === 'critical' ? 'border-red-500/40 bg-red-500/10 text-red-400' :
    alert.severity === 'high'     ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' :
    alert.severity === 'medium'   ? 'border-blue-400/40 bg-blue-400/10 text-blue-400' :
                                    'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]';
  return (
    <div className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate max-w-[160px]">{alert.title}</span>
    </div>
  );
}

function PositionCard({ position, latestAlert }: { position: PortfolioPosition; latestAlert: PMAlert | null }) {
  const allocationPct = position.currentAllocation ?? position.targetAllocation;
  const needsApproval = position.approvalStatus === 'pending';

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-[var(--cb-surface)] px-3 py-2.5 text-sm ${
        needsApproval ? 'border-amber-500/50' : 'border-[var(--cb-border-subtle)]'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--cb-text-primary)]">{position.ticker}</span>
            {needsApproval && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold text-amber-500">
                APPROVAL NEEDED
              </span>
            )}
          </div>
          {position.companyName && (
            <p className="truncate text-xs text-[var(--cb-text-muted)]">{position.companyName}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {allocationPct != null && (
            <span className="text-xs text-[var(--cb-text-muted)]">{(allocationPct * 100).toFixed(1)}%</span>
          )}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${integrityBg(position.thesisIntegrity)}`}>
            {position.thesisIntegrity ?? 'no thesis'}
          </span>
        </div>
      </div>

      {/* Conviction + meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-[var(--cb-text-muted)]">Conviction</span>
          <ConvictionDrift score={position.currentScore ?? position.convictionScore ?? null} />
        </div>
        {position.portfolioRole && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[var(--cb-text-muted)]">Role</span>
            <span className="text-xs text-[var(--cb-text-secondary)]">{position.portfolioRole}</span>
          </div>
        )}
        {position.timeHorizon && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[var(--cb-text-muted)]">Horizon</span>
            <span className="text-xs text-[var(--cb-text-secondary)]">{position.timeHorizon}</span>
          </div>
        )}
        {position.agentConsensus && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-[var(--cb-text-muted)]">Consensus</span>
            <ConsensusIcon stance={position.agentConsensus} />
          </div>
        )}
      </div>

      {/* Latest alert */}
      {latestAlert && <AlertBadge alert={latestAlert} />}
    </div>
  );
}

function ConsensusIcon({ stance }: { stance: PortfolioPosition['agentConsensus'] }) {
  if (stance === 'bullish') return <span className="flex items-center gap-0.5 text-xs text-[var(--cb-green)]"><TrendingUp className="h-3 w-3" /> Bullish</span>;
  if (stance === 'bearish') return <span className="flex items-center gap-0.5 text-xs text-red-500"><TrendingDown className="h-3 w-3" /> Bearish</span>;
  if (stance === 'split')   return <span className="flex items-center gap-0.5 text-xs text-amber-500"><Minus className="h-3 w-3" /> Split</span>;
  return <span className="text-xs text-[var(--cb-text-muted)]">Neutral</span>;
}

export function PositionsByTheme({ positions, alerts }: Props) {
  const active = positions.filter((p) => p.status === 'active' || p.status === 'watch');

  const alertsByTicker = alerts.reduce<Record<string, PMAlert[]>>((acc, a) => {
    if (!a.ticker) return acc;
    acc[a.ticker] = acc[a.ticker] ?? [];
    acc[a.ticker].push(a);
    return acc;
  }, {});

  // Group by theme
  const themeMap: Record<string, PortfolioPosition[]> = {};
  for (const p of active) {
    const theme = p.portfolioTheme ?? 'Unassigned';
    themeMap[theme] = themeMap[theme] ?? [];
    themeMap[theme].push(p);
  }

  // Merge default themes (show even if empty to give PM structure)
  const allThemes = Array.from(new Set([...DEFAULT_THEMES, ...Object.keys(themeMap)]));
  const populated = allThemes.filter((t) => (themeMap[t]?.length ?? 0) > 0);

  if (active.length === 0) {
    return (
      <EmptySection
        title="Positions by Theme"
        message="No active positions. Add positions via the ranked board."
      />
    );
  }

  return (
    <section aria-label="Positions by theme">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
        Positions by Theme
      </h2>
      <div className="space-y-5">
        {populated.map((theme) => {
          const themePositions = themeMap[theme] ?? [];
          return (
            <div key={theme}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--cb-text-secondary)]">{theme}</span>
                <span className="text-[10px] text-[var(--cb-text-muted)]">
                  {themePositions.length} position{themePositions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {themePositions.map((p) => {
                  const tickerAlerts = alertsByTicker[p.ticker] ?? [];
                  const severityOrder = (s: PMAlert['severity']) =>
                    ({ critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5);
                  const latestAlert = tickerAlerts
                    .filter((a) => !a.acknowledged)
                    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))[0] ?? null;
                  return <PositionCard key={p.id} position={p} latestAlert={latestAlert} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EmptySection({ title, message }: { title: string; message: string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{title}</h2>
      <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-6 py-8 text-center">
        <p className="text-sm font-medium text-[var(--cb-text-secondary)]">{message}</p>
      </div>
    </section>
  );
}
