'use client';

import { useMemo } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import type { ActivePosition } from '@/lib/portfolio/types';
import type { StockQuote } from '@/app/api/quotes/route';
import type { ClassifiedNewsItem, LabelKey } from '@/lib/portfolio/newsClassify';
import { LABEL_STYLE } from '@/lib/portfolio/newsClassify';
import { cn } from '@/lib/utils';

type Props = {
  positions: ActivePosition[];
  quotes: Map<string, StockQuote>;
  newsMap: Map<string, ClassifiedNewsItem[]>;
};

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}K`;
  return `$${Math.round(abs)}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function signalColor(signal: 'green' | 'yellow' | 'red'): string {
  if (signal === 'green') return 'text-emerald-300';
  if (signal === 'yellow') return 'text-amber-300';
  return 'text-rose-300';
}

function signalBadge(signal: 'green' | 'yellow' | 'red'): string {
  if (signal === 'green') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (signal === 'yellow') return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
}

function actionBadge(action: string): string {
  if (action === 'Add') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (action === 'Hold') return 'border-blue-400/30 bg-blue-500/10 text-blue-300';
  if (action === 'Trim') return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  if (action === 'Exit') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]';
}

function driftIcon(drift: string): string {
  if (drift === 'strengthening') return '↑';
  if (drift === 'weakening') return '↓';
  return '→';
}

function driftColor(drift: string): string {
  if (drift === 'strengthening') return 'text-emerald-300';
  if (drift === 'weakening') return 'text-rose-300';
  return 'text-[var(--cb-text-muted)]';
}

const NEWS_PRIORITY: LabelKey[] = ['Estimate', 'Risk', 'Positioning', 'Multiple'];

function topNewsLabel(items: ClassifiedNewsItem[] | undefined): LabelKey | null {
  if (!items || items.length === 0) return null;
  for (const p of NEWS_PRIORITY) {
    if (items.some(i => i.label === p)) return p;
  }
  return null;
}

export function PortfolioRiskDashboard({ positions, quotes, newsMap }: Props) {
  const active = useMemo(() => positions.filter(p => p.status !== 'exited'), [positions]);

  const m = useMemo(() => {
    const withCap = active.filter(
      p => typeof p.notionalUsd === 'number' && Number.isFinite(p.notionalUsd) && (p.notionalUsd ?? 0) > 0,
    );
    const totalCapital = withCap.reduce((s, p) => s + (p.notionalUsd ?? 0), 0);

    const rows = active.map(p => {
      const livePrice = quotes.get(p.ticker)?.price ?? p.currentPrice;
      const pct = ((livePrice - p.entryPrice) / p.entryPrice) * 100;
      const notional = typeof p.notionalUsd === 'number' && Number.isFinite(p.notionalUsd) ? (p.notionalUsd ?? 0) : 0;
      const dollarPnl = notional > 0 ? notional * (pct / 100) : null;
      const todayPct = quotes.get(p.ticker)?.changePct ?? null;
      const pctOfBook = totalCapital > 0 && notional > 0 ? (notional / totalCapital) * 100 : null;
      return { p, pct, dollarPnl, todayPct, notional, pctOfBook };
    });

    const totalPnl = rows.reduce((s, r) => s + (r.dollarPnl ?? 0), 0);
    const totalPctReturn = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;

    const dailyPnl = withCap.reduce((s, p) => {
      const q = quotes.get(p.ticker);
      if (!q?.price || !q.changePct) return s;
      const notional = typeof p.notionalUsd === 'number' && Number.isFinite(p.notionalUsd) ? (p.notionalUsd ?? 0) : 0;
      const prevPrice = q.price / (1 + q.changePct / 100);
      return s + notional * ((q.price - prevPrice) / prevPrice);
    }, 0);

    const avgScore = active.length > 0 ? active.reduce((s, p) => s + p.currentScore, 0) / active.length : 0;

    const signalCounts = { green: 0, yellow: 0, red: 0 } as Record<'green' | 'yellow' | 'red', number>;
    const driftCounts  = { strengthening: 0, stable: 0, weakening: 0 } as Record<string, number>;
    for (const p of active) { signalCounts[p.currentSignal]++; driftCounts[p.thesisDrift]++; }

    const newsCounts: Record<string, number> = { Estimate: 0, Risk: 0, Positioning: 0, Multiple: 0 };
    for (const p of active) {
      for (const item of newsMap.get(p.ticker) ?? []) {
        if (item.label in newsCounts) newsCounts[item.label]++;
      }
    }

    const biggest = rows.reduce<typeof rows[0] | null>(
      (best, r) => (!best || r.notional > best.notional ? r : best), null,
    );
    const riskPositions = active.filter(p => p.status === 'broken' || p.thesisDrift === 'weakening');
    const hasDailyData  = active.some(p => quotes.get(p.ticker)?.changePct != null);

    return { totalCapital, totalPnl, totalPctReturn, dailyPnl, avgScore, signalCounts, driftCounts, newsCounts, biggest, riskPositions, rows, hasDailyData };
  }, [active, quotes, newsMap]);

  if (active.length === 0) return null;

  const hasCapital = m.totalCapital > 0;

  return (
    <div className="space-y-3">

      {/* ── Book Snapshot ── */}
      <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <p className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
          Book Snapshot · {active.length} position{active.length !== 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          {hasCapital && (
            <>
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Capital</div>
                <div className="text-xl font-bold tabular-nums text-[var(--cb-text-primary)]">{fmtUsd(m.totalCapital)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Total P&amp;L</div>
                <div className={cn('text-xl font-bold tabular-nums', m.totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                  {m.totalPnl >= 0 ? '+' : '–'}{fmtUsd(m.totalPnl)}
                </div>
                <div className={cn('text-[10px] tabular-nums', m.totalPnl >= 0 ? 'text-emerald-300/70' : 'text-rose-300/70')}>
                  {fmtPct(m.totalPctReturn)}
                </div>
              </div>
              {m.hasDailyData && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Today</div>
                  <div className={cn('flex items-center gap-1 text-base font-bold tabular-nums', m.dailyPnl >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                    {m.dailyPnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {m.dailyPnl >= 0 ? '+' : '–'}{fmtUsd(m.dailyPnl)}
                  </div>
                </div>
              )}
            </>
          )}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Avg Score</div>
            <div className={cn('text-xl font-bold tabular-nums', m.avgScore >= 7 ? 'text-emerald-300' : m.avgScore >= 5 ? 'text-amber-300' : 'text-rose-300')}>
              {m.avgScore.toFixed(1)}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(['green', 'yellow', 'red'] as const).map(sig =>
              m.signalCounts[sig] > 0 ? (
                <div key={sig} className="text-center">
                  <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)] capitalize">{sig}</div>
                  <div className={cn('text-lg font-bold tabular-nums', signalColor(sig))}>{m.signalCounts[sig]}</div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* ── Intelligence Row ── */}
      <div className="grid gap-3 sm:grid-cols-3">

        {/* Thesis Health */}
        <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Thesis Health</div>
          <div className="flex items-end gap-5">
            {(['strengthening', 'stable', 'weakening'] as const).map(key => (
              <div key={key} className="text-center">
                <div className={cn('text-2xl font-bold tabular-nums', driftColor(key))}>
                  {m.driftCounts[key]}
                </div>
                <div className={cn('text-[10px] font-medium capitalize', driftColor(key))}>
                  {driftIcon(key)} {key}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* News Signals */}
        <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">News Signals</div>
          {Object.values(m.newsCounts).every(v => v === 0) ? (
            <p className="text-[11px] text-[var(--cb-text-muted)]">No classified headlines yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(Object.entries(m.newsCounts) as [string, number][])
                .filter(([, v]) => v > 0)
                .map(([label, count]) => {
                  const style = LABEL_STYLE[label as LabelKey];
                  return (
                    <div key={label} className={cn('rounded-lg border px-2.5 py-1', style.border, style.bg)}>
                      <span className={cn('text-base font-bold tabular-nums', style.text)}>{count}</span>
                      <span className={cn('ml-1.5 text-[10px] font-semibold', style.text)}>{label}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Concentration */}
        <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Concentration</div>
          {m.biggest && m.biggest.pctOfBook !== null ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-[var(--cb-text-primary)]">
                  {m.biggest.pctOfBook.toFixed(0)}%
                </span>
                <span className="text-sm font-semibold text-[var(--cb-text-muted)]">{m.biggest.p.ticker}</span>
                {m.biggest.pctOfBook > 35 && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--cb-text-muted)]">
                largest position{m.biggest.pctOfBook > 35 ? ' — consider trimming' : ' of tracked capital'}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--cb-text-muted)]">Add position sizes to see concentration.</p>
          )}
        </div>
      </div>

      {/* ── Position Matrix ── */}
      <div className="overflow-hidden rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)]">
        <div className="border-b border-[var(--cb-border)] px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Position Matrix</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--cb-border)] text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                <th className="px-4 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-center">Signal</th>
                <th className="px-3 py-2 text-center">PM Action</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">P&amp;L</th>
                <th className="px-3 py-2 text-right">Today</th>
                <th className="px-3 py-2 text-center">Drift</th>
                <th className="px-3 py-2 text-left">News</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map(({ p, pct, dollarPnl, todayPct }) => {
                const newsLabel = topNewsLabel(newsMap.get(p.ticker));
                const newsStyle = newsLabel ? LABEL_STYLE[newsLabel] : null;
                return (
                  <tr key={p.id} className="border-b border-[var(--cb-border)] last:border-0 transition-colors hover:bg-[var(--cb-surface-subtle)]">
                    <td className="px-4 py-2.5 font-bold text-[var(--cb-text-primary)]">{p.ticker}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize', signalBadge(p.currentSignal))}>
                        {p.currentSignal}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', actionBadge(p.latestMonitor?.action ?? 'Watch'))}>
                        {p.latestMonitor?.action ?? 'Checking'}
                      </span>
                    </td>
                    <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', signalColor(p.currentSignal))}>
                      {p.currentScore.toFixed(1)}
                    </td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', pct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                      <div className="font-semibold">{fmtPct(pct)}</div>
                      {dollarPnl !== null && (
                        <div className="text-[9px] opacity-70">{dollarPnl >= 0 ? '+' : '–'}{fmtUsd(dollarPnl)}</div>
                      )}
                    </td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums text-[11px]',
                      todayPct == null ? 'text-[var(--cb-text-muted)]' : todayPct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                      {todayPct != null ? fmtPct(todayPct) : '—'}
                    </td>
                    <td className={cn('px-3 py-2.5 text-center font-bold text-base', driftColor(p.thesisDrift))}>
                      {driftIcon(p.thesisDrift)}
                    </td>
                    <td className="px-3 py-2.5">
                      {newsLabel && newsStyle ? (
                        <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', newsStyle.border, newsStyle.text, newsStyle.bg)}>
                          {newsLabel}
                        </span>
                      ) : (
                        <span className="text-[var(--cb-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Risk Watch ── */}
      {m.riskPositions.length > 0 && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-rose-400/80">
              Risk Watch — {m.riskPositions.length} position{m.riskPositions.length !== 1 ? 's' : ''} need attention
            </span>
          </div>
          <div className="space-y-2">
            {m.riskPositions.map(p => (
              <div key={p.id} className="flex flex-wrap items-start gap-3">
                <span className="shrink-0 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                  {p.ticker}
                </span>
                <p className="text-[11px] leading-tight text-[var(--cb-text-muted)]">{p.keyRisks}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
