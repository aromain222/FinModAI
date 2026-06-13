'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, Play, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Industrials',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services',
];

type CompetitionRound = {
  id: string;
  status: string;
  sector: string | null;
  candidateTickers: string[];
  candidates: Array<{
    ticker: string;
    entryPrice: number | null;
    targetPrice: number | null;
    convictionScore: number | null;
    thesisSummary: string | null;
    primaryDriver: string | null;
    upsidePct?: number;
  }>;
  winnerTicker: string | null;
  entryPrice: number | null;
  entryDate: string | null;
  rationale: string | null;
  conviction: number | null;
  createdAt: string;
  currentPrice: number | null;
  returnPct: number | null;
  ageDays: number | null;
};

type Stats = {
  totalRounds: number;
  completedRounds: number;
  hitRate: number | null;
  avgReturnPct: number;
  bestPick: { ticker: string | null; returnPct: number | null } | null;
  worstPick: { ticker: string | null; returnPct: number | null } | null;
};

function pnlColor(p: number | null): string {
  if (p == null) return 'var(--cb-text-muted)';
  if (p > 0) return '#65d487';
  if (p < 0) return '#e2685c';
  return 'var(--cb-text-muted)';
}

function formatPct(p: number | null): string {
  if (p == null) return '—';
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}

export default function CompetitionPage() {
  const [sector, setSector] = useState<string>(SECTORS[0]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<CompetitionRound[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pm/competition', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { rounds?: CompetitionRound[]; stats?: Stats };
      const list = (data.rounds ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setRounds(list);
      setStats(data.stats ?? null);
      if (!selectedRoundId && list.length > 0) setSelectedRoundId(list[0].id);
    } catch { /* silent */ }
  }, [selectedRoundId]);

  useEffect(() => { void load(); }, [load]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/pm/competition/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector }),
      });
      const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError((payload?.error as string) ?? `HTTP ${res.status}`);
      } else {
        await load();
        const r = payload?.round as { id?: string } | undefined;
        if (r?.id) setSelectedRoundId(r.id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }, [sector, load]);

  const selectedRound = useMemo(
    () => rounds.find(r => r.id === selectedRoundId) ?? null,
    [rounds, selectedRoundId],
  );

  return (
    <main className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Stock-picking competition</p>
          <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">The League</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--cb-text-muted)]">
            Pick a sector. The senior committee scouts trending names, researches them, and picks one. Past picks are scored against live prices.
          </p>
        </div>
      </header>

      {stats && stats.totalRounds > 0 && (
        <section className="grid grid-cols-4 gap-3">
          <Stat label="Total picks" value={String(stats.totalRounds)} sub={null} tone="var(--cb-text-primary)" />
          <Stat label="Hit rate" value={stats.hitRate != null ? `${stats.hitRate.toFixed(0)}%` : '—'} sub={`${stats.completedRounds} scored`} tone={stats.hitRate != null && stats.hitRate >= 50 ? '#65d487' : '#e2685c'} />
          <Stat label="Avg return" value={formatPct(stats.avgReturnPct)} sub={null} tone={pnlColor(stats.avgReturnPct)} />
          <Stat
            label="Best pick"
            value={stats.bestPick?.ticker ?? '—'}
            sub={stats.bestPick?.returnPct != null ? formatPct(stats.bestPick.returnPct) : null}
            tone={pnlColor(stats.bestPick?.returnPct ?? null)}
          />
        </section>
      )}

      <section className="flex items-end gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Sector</span>
          <select
            value={sector}
            onChange={e => setSector(e.target.value)}
            disabled={running}
            className="h-9 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 text-sm text-[var(--cb-text-primary)] outline-none focus:border-[var(--cb-green)] disabled:opacity-50"
          >
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => { void handleRun(); }}
          disabled={running}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-4 text-sm font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
        >
          <Play className={cn('h-4 w-4', running && 'animate-pulse')} />
          {running ? 'Running round… ~2-3 min' : 'Run a round'}
        </button>
        {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
      </section>

      <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4">
        <aside className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Past picks ({rounds.length})</h3>
          <div className="space-y-1">
            {rounds.length === 0 ? (
              <p className="text-xs text-[var(--cb-text-muted)]">No rounds yet — run one above.</p>
            ) : rounds.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoundId(r.id)}
                className={cn(
                  'w-full rounded px-2 py-1.5 text-left transition',
                  selectedRoundId === r.id ? 'bg-[var(--cb-surface-subtle)]' : 'hover:bg-[var(--cb-surface-subtle)]',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--cb-text-primary)]">
                    <Trophy className="h-3 w-3 text-[var(--cb-text-muted)]" />
                    {r.winnerTicker}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: pnlColor(r.returnPct) }}>
                    {formatPct(r.returnPct)}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--cb-text-muted)]">
                  {r.sector ?? 'any sector'} · {r.ageDays != null ? `${r.ageDays.toFixed(1)}d ago` : 'just now'}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {selectedRound ? (
            <RoundDetail round={selectedRound} />
          ) : (
            <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-6 text-sm text-[var(--cb-text-muted)]">
              Run a round to see the committee's pick.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string | null; tone: string }) {
  return (
    <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-base" style={{ color: tone }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--cb-text-muted)]">{sub}</p>}
    </div>
  );
}

function RoundDetail({ round }: { round: CompetitionRound }) {
  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <Trophy className="h-5 w-5 text-[var(--cb-green)]" />
              <h2 className="text-2xl font-bold text-[var(--cb-text-primary)]">{round.winnerTicker}</h2>
              <span className="text-xs text-[var(--cb-text-muted)]">
                won {round.sector ?? 'any sector'} · {round.entryDate ? new Date(round.entryDate).toLocaleString() : ''}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">{round.rationale}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl text-[var(--cb-text-primary)]">
              ${round.currentPrice?.toFixed(2) ?? '—'}
            </p>
            <p className="font-mono text-base" style={{ color: pnlColor(round.returnPct) }}>
              {formatPct(round.returnPct)}
            </p>
            <p className="text-[10px] text-[var(--cb-text-muted)]">
              entry ${round.entryPrice?.toFixed(2) ?? '—'} · {round.ageDays != null ? `${round.ageDays.toFixed(1)}d` : 'now'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Candidates in this round ({round.candidates.length})</h3>
        <div className="space-y-2">
          {round.candidates
            .slice()
            .sort((a, b) => (b.convictionScore ?? 0) - (a.convictionScore ?? 0))
            .map(c => {
              const isWinner = c.ticker === round.winnerTicker;
              return (
                <div
                  key={c.ticker}
                  className={cn(
                    'rounded border p-3',
                    isWinner ? 'border-[var(--cb-green)]/40 bg-[var(--cb-green)]/[0.03]' : 'border-[var(--cb-border)]',
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      {isWinner && <Trophy className="h-3.5 w-3.5 text-[var(--cb-green)]" />}
                      <span className="font-mono text-sm font-semibold text-[var(--cb-text-primary)]">{c.ticker}</span>
                      {c.convictionScore != null && (
                        <span className="font-mono text-[10px] text-[var(--cb-text-muted)]">conv {c.convictionScore}</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--cb-text-muted)]">
                      ${c.entryPrice?.toFixed(2) ?? '—'} → tgt ${c.targetPrice?.toFixed(2) ?? '—'}
                      {c.upsidePct != null && (
                        <span className="ml-2" style={{ color: c.upsidePct > 0 ? '#65d487' : '#e2685c' }}>
                          {c.upsidePct > 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
                          {' '}{c.upsidePct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {c.primaryDriver && (
                    <p className="mt-1 text-xs text-[var(--cb-text-secondary)]">Driver: {c.primaryDriver}</p>
                  )}
                  {c.thesisSummary && (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--cb-text-muted)]">{c.thesisSummary}</p>
                  )}
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
