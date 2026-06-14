'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trophy, Play, TrendingUp, TrendingDown, ClipboardCheck, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'league' | 'review';
type ReviewVerdict = 'keep' | 'trim' | 'replace' | 'add';

type PositionReview = {
  ticker: string;
  currentPrice: number | null;
  entryPrice: number | null;
  pnlPct: number | null;
  priorConviction: number | null;
  freshConviction: number;
  convictionDelta: number | null;
  targetPrice: number;
  stopLoss: number;
  thesisSummary: string;
  primaryDriver: string;
  mainRisk: string;
  nextCatalyst: string;
  verdict: ReviewVerdict;
  verdictReason: string;
  suggestedAlternative: {
    ticker: string;
    mentionCount: number;
    netDirection: 'up' | 'down' | 'flat';
    sampleHeadline: string | null;
  } | null;
};

type ReviewResponse = {
  reviewedAt: string;
  total: number;
  summary: { keep: number; trim: number; replace: number; add: number };
  reviews: PositionReview[];
};

// ADD and REPLACE both require explicit PM sign-off — amber border per the design system.
// KEEP stays neutral. TRIM gets a softer caution tint. The verdict pill color carries direction.
const VERDICT_TONES: Record<ReviewVerdict, { bg: string; border: string; fg: string; label: string }> = {
  keep:    { bg: 'bg-[var(--cb-surface)]',       border: 'border-[var(--cb-border)]',    fg: 'var(--cb-bull)',    label: 'KEEP' },
  add:     { bg: 'bg-yellow-500/[0.04]',         border: 'border-yellow-600/50',         fg: 'var(--cb-bull)',    label: 'ADD · approve' },
  trim:    { bg: 'bg-yellow-500/[0.04]',         border: 'border-yellow-600/30',         fg: 'var(--cb-caution)', label: 'TRIM' },
  replace: { bg: 'bg-yellow-500/[0.04]',         border: 'border-yellow-600/50',         fg: 'var(--cb-bear)',    label: 'REPLACE · approve' },
};

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
  if (p > 0) return 'var(--cb-bull)';
  if (p < 0) return 'var(--cb-bear)';
  return 'var(--cb-text-muted)';
}

function formatPct(p: number | null): string {
  if (p == null) return '—';
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}

export default function CompetitionPage() {
  const [tab, setTab] = useState<Tab>('league');
  const [sector, setSector] = useState<string>(SECTORS[0]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<CompetitionRound[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

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

  const handleRunReview = useCallback(async () => {
    setReviewing(true);
    setReviewError(null);
    try {
      const res = await fetch('/api/pm/portfolio-review', { method: 'POST' });
      const payload = await res.json().catch(() => ({})) as Partial<ReviewResponse> & { error?: string; hint?: string };
      if (!res.ok) {
        setReviewError(payload.error ? `${payload.error}${payload.hint ? ` — ${payload.hint}` : ''}` : `HTTP ${res.status}`);
        return;
      }
      setReview(payload as ReviewResponse);
    } catch (err) {
      setReviewError((err as Error).message);
    } finally {
      setReviewing(false);
    }
  }, []);

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

      <div className="flex gap-1 border-b border-[var(--cb-border)]">
        <button
          type="button"
          onClick={() => setTab('league')}
          className={cn(
            'flex items-center gap-1.5 px-4 pb-2.5 pt-1 text-sm font-medium transition-colors',
            tab === 'league'
              ? 'border-b-2 border-[var(--cb-green)] text-[var(--cb-text-primary)]'
              : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
          )}
        >
          <Trophy className="h-3.5 w-3.5" />
          The League
        </button>
        <button
          type="button"
          onClick={() => setTab('review')}
          className={cn(
            'flex items-center gap-1.5 px-4 pb-2.5 pt-1 text-sm font-medium transition-colors',
            tab === 'review'
              ? 'border-b-2 border-[var(--cb-green)] text-[var(--cb-text-primary)]'
              : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
          )}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Should I still own this?
        </button>
      </div>

      {tab === 'review' && (
        <PortfolioReviewTab
          review={review}
          reviewing={reviewing}
          error={reviewError}
          onRun={handleRunReview}
        />
      )}

      {tab === 'league' && stats && stats.totalRounds > 0 && (
        <section className="grid grid-cols-4 gap-3">
          <Stat label="Total picks" value={String(stats.totalRounds)} sub={null} tone="var(--cb-text-primary)" />
          <Stat label="Hit rate" value={stats.hitRate != null ? `${stats.hitRate.toFixed(0)}%` : '—'} sub={`${stats.completedRounds} scored`} tone={stats.hitRate != null && stats.hitRate >= 50 ? 'var(--cb-bull)' : 'var(--cb-bear)'} />
          <Stat label="Avg return" value={formatPct(stats.avgReturnPct)} sub={null} tone={pnlColor(stats.avgReturnPct)} />
          <Stat
            label="Best pick"
            value={stats.bestPick?.ticker ?? '—'}
            sub={stats.bestPick?.returnPct != null ? formatPct(stats.bestPick.returnPct) : null}
            tone={pnlColor(stats.bestPick?.returnPct ?? null)}
          />
        </section>
      )}

      {tab === 'league' && (
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
      )}

      {tab === 'league' && (
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
                  <Link
                    href={`/research?ticker=${r.winnerTicker}`}
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--cb-text-primary)] hover:underline"
                  >
                    <Trophy className="h-3 w-3 text-[var(--cb-text-muted)]" />
                    {r.winnerTicker}
                  </Link>
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
      )}
    </main>
  );
}

function PortfolioReviewTab({
  review,
  reviewing,
  error,
  onRun,
}: {
  review: ReviewResponse | null;
  reviewing: boolean;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <div>
          <p className="text-sm text-[var(--cb-text-primary)]">Re-runs the PM analyzer on every held position and tells you what to do.</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Takes ~3-4 min for an 8-name book. Fresh scout scan + analyzer per ticker. Verdict rules: conviction &lt; 50 or below stop → replace; ≥80 + working → add; 50-64 or +20%+ → trim; else keep.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={reviewing}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-4 text-sm font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', reviewing && 'animate-spin')} />
          {reviewing ? 'Reviewing book…' : 'Review my book'}
        </button>
        {error && <span className="text-xs text-[var(--cb-danger)]">{error}</span>}
      </section>

      {error?.includes('no_held_positions') && (
        <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
          <p className="text-sm text-[var(--cb-text-primary)]">No held positions to review.</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Pull your real holdings from Ledger first, then come back.
          </p>
          <Link
            href="/portfolio"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-4 text-sm font-medium text-[var(--cb-text-primary)] transition hover:border-[var(--cb-border-strong)]"
          >
            Pull from Ledger →
          </Link>
        </div>
      )}

      {reviewing && !review && (
        <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: 'var(--cb-bull)' }} />
            <p className="text-sm text-[var(--cb-text-primary)]">Reviewing your book…</p>
          </div>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Each held position gets a fresh scout scan + PM analyzer. ~30 seconds per name.
          </p>
        </div>
      )}

      {review && (
        <>
          <section className="grid grid-cols-4 gap-3">
            <SummaryStat label="Keep" value={review.summary.keep} tone="var(--cb-bull)" />
            <SummaryStat label="Trim" value={review.summary.trim} tone="var(--cb-caution)" />
            <SummaryStat label="Replace" value={review.summary.replace} tone="var(--cb-bear)" />
            <SummaryStat label="Add" value={review.summary.add} tone="var(--cb-bull)" />
          </section>

          <div className="space-y-2">
            {review.reviews
              .slice()
              .sort((a, b) => {
                const order: Record<ReviewVerdict, number> = { replace: 0, add: 1, trim: 2, keep: 3 };
                return order[a.verdict] - order[b.verdict];
              })
              .map(r => <ReviewCard key={r.ticker} r={r} />)}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-xl" style={{ color: tone }}>{value}</p>
    </div>
  );
}

function ReviewCard({ r }: { r: PositionReview }) {
  const tone = VERDICT_TONES[r.verdict];
  return (
    <div className={cn('rounded-md border p-4', tone.border, tone.bg)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link href={`/research?ticker=${r.ticker}`} className="font-mono text-lg font-bold text-[var(--cb-text-primary)] hover:underline">
              {r.ticker}
            </Link>
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ color: tone.fg, backgroundColor: `${tone.fg}1a` }}>
              {tone.label}
            </span>
            {r.convictionDelta != null && (
              <span className="font-mono text-[10px] text-[var(--cb-text-muted)]">
                conv {r.priorConviction} → {r.freshConviction} ({r.convictionDelta > 0 ? '+' : ''}{r.convictionDelta})
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--cb-text-secondary)]">{r.verdictReason}</p>
          <p className="mt-2 text-xs text-[var(--cb-text-primary)]">{r.thesisSummary}</p>
          <div className="mt-2 flex gap-4 text-[10px] text-[var(--cb-text-muted)]">
            <span>Driver: <span className="text-[var(--cb-text-secondary)]">{r.primaryDriver}</span></span>
            <span>Main risk: <span className="text-[var(--cb-text-secondary)]">{r.mainRisk}</span></span>
          </div>
          {r.suggestedAlternative && (
            <div className="mt-3 rounded border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Suggested alternative</p>
              <p className="mt-0.5 font-mono text-sm text-[var(--cb-text-primary)]">
                {r.suggestedAlternative.ticker}
                <span className="ml-2 text-[10px] text-[var(--cb-text-muted)]">
                  {r.suggestedAlternative.mentionCount} mentions · trending {r.suggestedAlternative.netDirection}
                </span>
              </p>
              {r.suggestedAlternative.sampleHeadline && (
                <p className="mt-0.5 text-[10px] text-[var(--cb-text-muted)]">{r.suggestedAlternative.sampleHeadline}</p>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-base text-[var(--cb-text-primary)]">${r.currentPrice?.toFixed(2) ?? '—'}</p>
          <p className="font-mono text-xs" style={{ color: r.pnlPct != null && r.pnlPct > 0 ? 'var(--cb-bull)' : r.pnlPct != null && r.pnlPct < 0 ? 'var(--cb-bear)' : 'var(--cb-text-muted)' }}>
            {r.pnlPct != null ? `${r.pnlPct > 0 ? '+' : ''}${r.pnlPct.toFixed(1)}%` : '—'}
          </p>
          <p className="mt-1 text-[10px] text-[var(--cb-text-muted)]">
            tgt <span style={{ color: 'var(--cb-bull)' }}>${r.targetPrice.toFixed(0)}</span>
            <span className="mx-1">·</span>
            stop <span style={{ color: 'var(--cb-bear)' }}>${r.stopLoss.toFixed(0)}</span>
          </p>
        </div>
      </div>
    </div>
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
              <Link href={`/research?ticker=${round.winnerTicker}`} className="text-2xl font-bold text-[var(--cb-text-primary)] hover:underline">
                {round.winnerTicker}
              </Link>
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
                      <Link href={`/research?ticker=${c.ticker}`} className="font-mono text-sm font-semibold text-[var(--cb-text-primary)] hover:underline">
                        {c.ticker}
                      </Link>
                      {c.convictionScore != null && (
                        <span className="font-mono text-[10px] text-[var(--cb-text-muted)]">conv {c.convictionScore}</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--cb-text-muted)]">
                      ${c.entryPrice?.toFixed(2) ?? '—'} → tgt ${c.targetPrice?.toFixed(2) ?? '—'}
                      {c.upsidePct != null && (
                        <span className="ml-2" style={{ color: c.upsidePct > 0 ? 'var(--cb-bull)' : 'var(--cb-bear)' }}>
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
