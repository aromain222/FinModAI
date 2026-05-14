'use client';

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { ActivePosition, PositionMonitorAction, PositionMonitorAgentRead } from '@/lib/portfolio/types';
import type { StockQuote } from '@/app/api/quotes/route';
import type { ClassifiedNewsItem, LabelKey } from '@/lib/portfolio/newsClassify';
import { cn } from '@/lib/utils';

type Props = {
  positions: ActivePosition[];
  quotes: Map<string, StockQuote>;
  newsMap: Map<string, ClassifiedNewsItem[]>;
  monitoring: Set<string>;
  onRefreshMonitor: (position: ActivePosition) => void;
};

const ACTION_STYLE: Record<PositionMonitorAction, string> = {
  Add:   'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  Hold:  'border-blue-400/30 bg-blue-500/10 text-blue-300',
  Trim:  'border-amber-400/30 bg-amber-500/10 text-amber-300',
  Exit:  'border-rose-400/30 bg-rose-500/10 text-rose-300',
  Watch: 'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-secondary)]',
};

const ACTION_RANK: Record<PositionMonitorAction, number> = {
  Exit: 0,
  Trim: 1,
  Add: 2,
  Hold: 3,
  Watch: 4,
};

function fmtPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function signalColor(signal: ActivePosition['currentSignal']): string {
  if (signal === 'green') return 'text-emerald-300';
  if (signal === 'yellow') return 'text-amber-300';
  return 'text-rose-300';
}

function classifyNews(items: ClassifiedNewsItem[] | undefined): { label: LabelKey | null; riskTitle: string | null } {
  const rows = items ?? [];
  const risk = rows.find(item => item.label === 'Risk');
  const estimate = rows.find(item => item.label === 'Estimate');
  const positioning = rows.find(item => item.label === 'Positioning');
  const multiple = rows.find(item => item.label === 'Multiple');
  const top = risk ?? estimate ?? positioning ?? multiple ?? rows[0];
  return { label: top?.label ?? null, riskTitle: risk?.title ?? null };
}

function agentLine(reads: PositionMonitorAgentRead[]): string {
  if (reads.length === 0) return 'Agent checks pending.';
  const hedge = reads.find(read => read.source === 'hedge_fund');
  const trading = reads.find(read => read.source === 'tradingagents');
  const dexter = reads.find(read => read.source === 'dexter');
  return [
    hedge ? `Hedge Fund: ${hedge.stance}${hedge.confidence != null ? ` ${hedge.confidence}%` : ''}` : null,
    trading ? `TradingAgents: ${trading.stance}` : null,
    dexter ? `Dexter: ${dexter.stance}` : null,
  ].filter(Boolean).join(' · ') || `${reads.length} agent check${reads.length === 1 ? '' : 's'} loaded.`;
}

function fallbackAction(position: ActivePosition, pnlPct: number, news: ClassifiedNewsItem[] | undefined): PositionMonitorAction {
  const scoreDelta = position.currentScore - position.entryScore;
  const riskNews = (news ?? []).filter(item => item.label === 'Risk').length;
  if (position.currentScore < 4 || scoreDelta <= -1.5 || riskNews >= 2) return 'Exit';
  if (pnlPct >= 12 && (scoreDelta <= 0 || riskNews > 0)) return 'Trim';
  if (position.currentScore >= 7.5 && scoreDelta >= 0.5 && pnlPct > -5 && riskNews === 0) return 'Add';
  if (Math.abs(scoreDelta) < 0.4 && Math.abs(pnlPct) < 4) return 'Watch';
  return 'Hold';
}

function positionShares(position: ActivePosition): number | null {
  if (typeof position.shares === 'number' && Number.isFinite(position.shares) && position.shares > 0) return position.shares;
  if (typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd) && position.notionalUsd > 0 && position.entryPrice > 0) {
    return position.notionalUsd / position.entryPrice;
  }
  return null;
}

function costBasis(position: ActivePosition): number | null {
  if (typeof position.costBasis === 'number' && Number.isFinite(position.costBasis) && position.costBasis > 0) return position.costBasis;
  const shares = positionShares(position);
  if (shares !== null) return shares * position.entryPrice;
  if (typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd) && position.notionalUsd > 0) return position.notionalUsd;
  return null;
}

function whyNow(position: ActivePosition, pnlPct: number, news: ClassifiedNewsItem[] | undefined): string {
  const monitor = position.latestMonitor;
  if (monitor?.exitTrigger) return monitor.exitTrigger;
  const scoreDelta = position.currentScore - position.entryScore;
  const newsState = classifyNews(news);
  if (newsState.label === 'Risk') return 'Risk headline is live; recheck whether the original thesis still holds.';
  if (scoreDelta >= 0.6) return `Score improved ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} since entry; thesis support is improving.`;
  if (scoreDelta <= -0.6) return `Score faded ${scoreDelta.toFixed(1)} since entry; thesis support is weakening.`;
  if (Math.abs(pnlPct) >= 8) return `Price moved ${fmtPct(pnlPct)} since entry; decide whether to press, hold, or harvest risk.`;
  return 'Position is inside normal swing noise; wait for score, news, or catalyst confirmation.';
}

function changeTrigger(position: ActivePosition, action: PositionMonitorAction): string {
  const monitor = position.latestMonitor;
  if (monitor?.holdTrigger) return monitor.holdTrigger;
  if (action === 'Exit')  return 'Hold only if a near-term catalyst repairs the score or invalidates the risk headline.';
  if (action === 'Trim')  return 'Reduce size if P&L target is reached or risk headlines stack; keep partial exposure while thesis holds.';
  if (action === 'Add')   return 'Press if score keeps rising and risk headlines stay absent.';
  if (action === 'Watch') return 'Move to Hold/Add if score breaks above 7 or a catalyst confirms the thesis; exit if score deteriorates.';
  return position.currentScore >= 7
    ? 'Decision worsens if score fades, risk headlines stack, or agent sentiment turns negative.'
    : 'Decision improves if score moves above 7, news confirms the catalyst, and agent sentiment turns supportive.';
}

function keyRisk(position: ActivePosition, news: ClassifiedNewsItem[] | undefined): string {
  const monitor = position.latestMonitor;
  if (monitor?.riskFlags[0]) return monitor.riskFlags[0];
  const newsState = classifyNews(news);
  if (newsState.riskTitle) return newsState.riskTitle;
  return position.keyRisks;
}

export function PortfolioAlerts({ positions, quotes, newsMap, monitoring, onRefreshMonitor }: Props) {
  const active = positions.filter(position => position.status !== 'exited');
  if (active.length === 0) return null;

  const rows = active
    .map(position => {
      const quote = quotes.get(position.ticker);
      const livePrice = quote?.price ?? position.currentPrice;
      const shares = positionShares(position);
      const basis = costBasis(position);
      const pnlUsd = shares !== null && basis !== null ? shares * livePrice - basis : null;
      const pnlPct = basis !== null && basis > 0 && pnlUsd !== null
        ? (pnlUsd / basis) * 100
        : ((livePrice - position.entryPrice) / position.entryPrice) * 100;
      const news = newsMap.get(position.ticker);
      const action = position.latestMonitor?.action ?? fallbackAction(position, pnlPct, news);
      const confidence = position.latestMonitor?.confidence ?? 42;
      const scoreDelta = position.currentScore - position.entryScore;
      return { position, action, confidence, pnlPct, scoreDelta, news };
    })
    .sort((a, b) => ACTION_RANK[a.action] - ACTION_RANK[b.action] || b.confidence - a.confidence);

  const urgent = rows.filter(row => row.action === 'Exit' || row.action === 'Trim').length;

  return (
    <section className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cb-border)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            {urgent > 0 ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
            <h2 className="text-sm font-bold text-[var(--cb-text-primary)]">Portfolio Alerts</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--cb-text-muted)]">
            Add, hold, trim, or exit calls based on P&L, score drift, news, catalysts, and agent checks.
          </p>
        </div>
        <span className="rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-0.5 text-[10px] text-[var(--cb-text-muted)]">
          {urgent > 0 ? `${urgent} need attention` : 'No urgent trims/exits'}
        </span>
      </div>

      <div className="divide-y divide-[var(--cb-border)]">
        {rows.map(({ position, action, confidence, pnlPct, scoreDelta, news }) => {
          const isChecking = monitoring.has(position.id);
          const monitor = position.latestMonitor;
          return (
            <div key={position.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[210px_1fr_auto]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-[var(--cb-text-primary)]">{position.ticker}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', ACTION_STYLE[action])}>
                    {action}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--cb-text-muted)]">
                  <span>P&L <span className={pnlPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtPct(pnlPct)}</span></span>
                  <span>Score <span className={signalColor(position.currentSignal)}>{position.currentScore.toFixed(1)}</span></span>
                  <span>Δ {scoreDelta >= 0 ? '+' : ''}{scoreDelta.toFixed(1)}</span>
                  <span>{confidence}% conf.</span>
                </div>
              </div>

              <div className="grid gap-2 text-[11px] leading-snug text-[var(--cb-text-muted)] sm:grid-cols-2">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Why now</div>
                  <p className="mt-0.5 text-[var(--cb-text-secondary)]">{whyNow(position, pnlPct, news)}</p>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">What changes it</div>
                  <p className="mt-0.5 text-[var(--cb-text-secondary)]">{changeTrigger(position, action)}</p>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Key risk</div>
                  <p className="mt-0.5 text-amber-100/80">{keyRisk(position, news)}</p>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Agent read</div>
                  <p className="mt-0.5 text-[var(--cb-text-secondary)]">{agentLine(monitor?.agentReads ?? [])}</p>
                </div>
              </div>

              <div className="flex items-start justify-end">
                <button
                  type="button"
                  onClick={() => onRefreshMonitor(position)}
                  disabled={isChecking || position.status === 'exited'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cb-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--cb-text-secondary)] transition-colors hover:border-blue-400/40 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {isChecking ? 'Checking' : monitor ? 'Recheck' : 'Run check'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
