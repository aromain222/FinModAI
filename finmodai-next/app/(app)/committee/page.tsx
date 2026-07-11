'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Users, Gavel, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

type Stance = 'bullish' | 'bearish' | 'neutral' | 'mixed';

type CommitteeSignal = {
  key: string;
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  thesis: string;
  risk?: string;
  watch?: string;
};

type CommitteeDebate = {
  id: string;
  ticker: string;
  createdAt: string;
  runAt?: string;
  stance: Stance;
  conviction: number;
  reasoning: string;
  summary?: string;
  action?: string;
  sizing?: string;
  decision: { action: string; confidence: number; reasoning: string; sizing?: string } | null;
  consensus: { bullish: number; bearish: number; neutral: number } | null;
  signals: CommitteeSignal[];
  trigger?: string;
  debate?: {
    degraded: boolean;
    metrics?: {
      elapsedMs: number;
      modelCalls: number;
      successfulCalls: number;
      degradedCalls: number;
      reportedTotalTokens: number;
      models: string[];
    };
    rebuttals: Array<{ reviewerKey: string; targetKey: string; challenges: Array<{ claimId: string; verdict: string; critique: string }> }>;
    adjudication: null | {
      decision: string;
      whatIsPriced: string;
      whyNow: string;
      confirmation: string;
      invalidation: string;
      disagreements: string[];
      claims: Array<{ claimId: string; score: number; accepted: boolean }>;
    };
  } | null;
};

function stanceTone(s: Stance | CommitteeSignal['signal']): string {
  if (s === 'bullish') return 'var(--cb-bull)';
  if (s === 'bearish') return 'var(--cb-bear)';
  if (s === 'mixed')   return 'var(--cb-caution)';
  return 'var(--cb-neutral)';
}

export default function CommitteePage() {
  return (
    <Suspense fallback={null}>
      <CommitteePageInner />
    </Suspense>
  );
}

function CommitteePageInner() {
  const searchParams = useSearchParams();
  const initialTicker = searchParams?.get('ticker')?.toUpperCase() ?? '';

  const [debates, setDebates] = useState<CommitteeDebate[]>([]);
  const [tickerFilter, setTickerFilter] = useState<string>(initialTicker);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triggerTicker, setTriggerTicker] = useState<string>(initialTicker);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (tickerFilter) params.set('ticker', tickerFilter);
      const res = await fetch(`/api/pm/committee?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { debates?: CommitteeDebate[] };
      const list = data.debates ?? [];
      setDebates(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tickerFilter, selectedId]);

  useEffect(() => { void load(); }, [load]);

  const handleTrigger = useCallback(async () => {
    const t = triggerTicker.trim().toUpperCase();
    if (!t) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/pm/investment-committee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t, trigger: 'user_request' }),
      });
      const payload = await res.json().catch(() => ({})) as { id?: string; error?: string };
      if (!res.ok) {
        setError(payload.error ?? `HTTP ${res.status}`);
        return;
      }
      setTickerFilter(t);
      // Refetch after a brief delay so Supabase has the new row.
      setTimeout(() => { void load(); }, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }, [triggerTicker, load]);

  const selected = useMemo(() => debates.find(d => d.id === selectedId) ?? debates[0] ?? null, [debates, selectedId]);

  return (
    <main className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Committee Debate</p>
          <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Senior Investment Committee</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--cb-text-muted)]">
            Six independent functional desks write sourced memos, cross-examine claim-level evidence, revise weak conclusions, and hand a PM adjudicator one recommendation with explicit disagreement.
          </p>
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Filter by ticker</span>
          <input
            type="text"
            value={tickerFilter}
            onChange={e => setTickerFilter(e.target.value.toUpperCase())}
            placeholder="All tickers"
            className="h-9 w-32 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 font-mono text-xs text-[var(--cb-text-primary)] outline-none focus:border-[var(--cb-green)]"
          />
        </label>
        <span className="text-[var(--cb-text-muted)]">·</span>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Convene committee on</span>
          <input
            type="text"
            value={triggerTicker}
            onChange={e => setTriggerTicker(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter' && !running) void handleTrigger(); }}
            placeholder="Ticker e.g. NVDA"
            className="h-9 w-32 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 font-mono text-xs text-[var(--cb-text-primary)] outline-none focus:border-[var(--cb-green)]"
          />
        </label>
        <button
          type="button"
          onClick={() => { void handleTrigger(); }}
          disabled={running || triggerTicker.trim().length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-sm font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
        >
          <Gavel className={cn('h-4 w-4', running && 'animate-pulse')} />
          {running ? 'Convening… up to 90s' : 'Convene committee'}
        </button>
        {error && <span className="text-xs text-[var(--cb-danger)]">{error}</span>}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
            Past debates ({debates.length})
          </h3>
          <div className="space-y-1">
            {loading && debates.length === 0 ? (
              <p className="text-xs text-[var(--cb-text-muted)]">Loading…</p>
            ) : debates.length === 0 ? (
              <p className="text-xs text-[var(--cb-text-muted)]">
                No committee debates yet. Type a ticker above and click <strong>Convene committee</strong> to run one.
              </p>
            ) : debates.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  'w-full rounded px-2 py-1.5 text-left transition',
                  selectedId === d.id ? 'bg-[var(--cb-surface-subtle)]' : 'hover:bg-[var(--cb-surface-subtle)]',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--cb-text-primary)]">{d.ticker}</span>
                  <span className="font-mono text-[10px]" style={{ color: stanceTone(d.stance) }}>
                    {d.action ?? d.stance}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--cb-text-muted)]">
                  {new Date(d.createdAt).toLocaleString()}
                </p>
                {d.summary && (
                  <p className="mt-1 line-clamp-2 text-[10px] text-[var(--cb-text-secondary)]">{d.summary}</p>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {selected ? <DebateDetail debate={selected} /> : (
            <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-6 text-sm text-[var(--cb-text-muted)]">
              Pick a debate on the left, or convene one above.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DebateDetail({ debate }: { debate: CommitteeDebate }) {
  const total = debate.consensus ? debate.consensus.bullish + debate.consensus.bearish + debate.consensus.neutral : 0;
  return (
    <div className="space-y-4">
      {/* Verdict hero */}
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <Link href={`/research?ticker=${debate.ticker}`} className="text-2xl font-bold text-[var(--cb-text-primary)] hover:underline">
                {debate.ticker}
              </Link>
              <span className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase" style={{ color: stanceTone(debate.stance), backgroundColor: 'var(--cb-surface-subtle)' }}>
                {debate.action ?? debate.stance}
              </span>
              {debate.trigger && (
                <span className="text-[10px] text-[var(--cb-text-muted)]">{String(debate.trigger).replace(/_/g, ' ')}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
              {new Date(debate.createdAt).toLocaleString()} · conviction {debate.conviction}
            </p>
            {(debate.decision?.reasoning || debate.summary || debate.reasoning) && (
              <p className="mt-3 text-sm leading-relaxed text-[var(--cb-text-primary)]">
                {debate.decision?.reasoning || debate.summary || debate.reasoning}
              </p>
            )}
            {(debate.decision?.sizing || debate.sizing) && (
              <p className="mt-2 text-xs text-[var(--cb-text-muted)]">
                Sizing: <span className="text-[var(--cb-text-secondary)]">{debate.decision?.sizing || debate.sizing}</span>
              </p>
            )}
          </div>
          {debate.consensus && total > 0 && (
            <div className="shrink-0 rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-3">
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Consensus</p>
              <div className="flex h-2 w-40 overflow-hidden rounded-sm">
                <span style={{ flex: debate.consensus.bullish, backgroundColor: 'var(--cb-bull)' }} />
                <span style={{ flex: debate.consensus.neutral, backgroundColor: 'var(--cb-neutral)' }} />
                <span style={{ flex: debate.consensus.bearish, backgroundColor: 'var(--cb-bear)' }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9px]">
                <span style={{ color: 'var(--cb-bull)' }}>{debate.consensus.bullish} bull</span>
                <span style={{ color: 'var(--cb-neutral)' }}>{debate.consensus.neutral} neu</span>
                <span style={{ color: 'var(--cb-bear)' }}>{debate.consensus.bearish} bear</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {debate.debate?.adjudication && (
        <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Cross-exam &amp; PM adjudication</h3>
          <span className="font-mono text-[10px] text-[var(--cb-text-muted)]">
            {debate.debate.rebuttals.length} rebuttals · {debate.debate.adjudication.claims.filter(claim => claim.accepted).length}/{debate.debate.adjudication.claims.length} claims survived
          </span>
        </div>
        {debate.debate.metrics && (
          <p className="mt-1 font-mono text-[10px] text-[var(--cb-text-muted)]">
            {(debate.debate.metrics.elapsedMs / 1000).toFixed(1)}s · {debate.debate.metrics.successfulCalls}/{debate.debate.metrics.modelCalls} model calls returned valid JSON · {debate.debate.metrics.reportedTotalTokens.toLocaleString()} reported tokens
          </p>
        )}
          <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
            <p className="text-[var(--cb-text-muted)]">What is priced: <span className="text-[var(--cb-text-primary)]">{debate.debate.adjudication.whatIsPriced}</span></p>
            <p className="text-[var(--cb-text-muted)]">Why now: <span className="text-[var(--cb-text-primary)]">{debate.debate.adjudication.whyNow}</span></p>
            <p className="text-[var(--cb-text-muted)]">Confirmation: <span className="text-[var(--cb-text-primary)]">{debate.debate.adjudication.confirmation}</span></p>
            <p className="text-[var(--cb-text-muted)]">Invalidation: <span className="text-[var(--cb-text-primary)]">{debate.debate.adjudication.invalidation}</span></p>
          </div>
          {debate.debate.adjudication.disagreements.length > 0 && (
            <p className="mt-3 text-xs text-[var(--cb-text-muted)]">
              Remaining disagreement: <span className="text-[var(--cb-text-secondary)]">{debate.debate.adjudication.disagreements.join(' · ')}</span>
            </p>
          )}
        </section>
      )}

      {/* Functional desk grid */}
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
          <Users className="h-3.5 w-3.5" />
          Functional research desks
        </h3>
        {debate.signals.length === 0 ? (
          <p className="text-xs text-[var(--cb-text-muted)]">No desk signals recorded for this debate.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {debate.signals.map((s, i) => (
              <div
                key={`${s.key}-${i}`}
                className="rounded border-l-2 border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] p-3"
                style={{ borderLeftColor: stanceTone(s.signal) }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--cb-text-primary)]">{s.name}</span>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span style={{ color: stanceTone(s.signal) }}>{s.signal}</span>
                    <span className="text-[var(--cb-text-muted)]">conf {s.confidence}</span>
                  </div>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--cb-text-primary)]">{s.reasoning}</p>
                {s.thesis && (
                  <p className="mt-1 text-[10px] text-[var(--cb-text-muted)]">
                    Thesis: <span className="text-[var(--cb-text-secondary)]">{s.thesis}</span>
                  </p>
                )}
                <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
                  {s.risk && (
                    <p className="text-[var(--cb-text-muted)]">Risk: <span className="text-[var(--cb-text-secondary)]">{s.risk}</span></p>
                  )}
                  {s.watch && (
                    <p className="text-[var(--cb-text-muted)]">Watch: <span className="text-[var(--cb-text-secondary)]">{s.watch}</span></p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
