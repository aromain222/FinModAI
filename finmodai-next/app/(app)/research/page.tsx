'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Sparkles, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { PortfolioPosition, PositionThesis } from '@/lib/pm/types';
import type { QuantScoreSnapshot } from '@/lib/pm/monitoring/types';
import { cn } from '@/lib/utils';

type ResearchSnapshot = {
  ticker: string;
  position: PortfolioPosition;
  thesis: PositionThesis;
  snapshots: QuantScoreSnapshot[];
  analyzedAt: string;
  isAlreadyHeld: boolean;
};

type ResearchResponse = {
  ok: true;
  ticker: string;
  quote: { ticker: string; price: number | null; name: string | null };
  position: PortfolioPosition;
  thesis: PositionThesis;
  snapshots: QuantScoreSnapshot[];
  analysis: {
    targetPrice: number;
    stopLoss: number;
    convictionScore: number;
    timeHorizon: string;
    thesisSummary: string;
    whyWeOwnIt: string;
    primaryDriver: string;
    mainRisk: string;
    keyRisks: string[];
    catalysts: string[];
    sellConditions: string[];
    invalidationConditions: string[];
    nextCatalyst: string;
  };
  isAlreadyHeld: boolean;
};

function signalColor(signal?: 'bullish' | 'bearish' | 'neutral'): string {
  if (signal === 'bullish') return 'var(--cb-bull)';
  if (signal === 'bearish') return 'var(--cb-bear)';
  return 'var(--cb-neutral)';
}

function convictionTone(score: number | null | undefined): string {
  if (score == null) return 'var(--cb-neutral)';
  if (score >= 70) return 'var(--cb-bull)';
  if (score >= 50) return 'var(--cb-caution)';
  return 'var(--cb-bear)';
}

export default function ResearchPage() {
  return (
    <Suspense fallback={null}>
      <ResearchPageInner />
    </Suspense>
  );
}

function ResearchPageInner() {
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<PortfolioPosition[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResearchSnapshot | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const searchParams = useSearchParams();
  const initialTickerHandled = useRef(false);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/pm/research', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { items?: PortfolioPosition[] };
      const items = (data.items ?? []).sort((a, b) =>
        (b.lastPmAnalysisAt ?? b.updatedAt ?? '').localeCompare(a.lastPmAnalysisAt ?? a.updatedAt ?? ''),
      );
      setList(items);
      if (!selectedTicker && items.length > 0) setSelectedTicker(items[0].ticker);
    } catch { /* silent */ }
  }, [selectedTicker]);

  useEffect(() => { void loadList(); }, [loadList]);

  // Deep-link support: ?ticker=NVDA auto-loads that name. If it isn't in the list yet,
  // the input is pre-filled — user can hit Enter to analyze without paste.
  useEffect(() => {
    if (initialTickerHandled.current) return;
    const t = searchParams?.get('ticker')?.trim().toUpperCase();
    if (!t) return;
    initialTickerHandled.current = true;
    setSelectedTicker(t);
    setInput(t);
  }, [searchParams]);

  const loadDetailFor = useCallback(async (ticker: string) => {
    setLoadingDetail(true);
    try {
      const [posRes, thesisRes, snapsRes] = await Promise.all([
        fetch(`/api/pm/positions?ticker=${ticker}&limit=1`, { cache: 'no-store' }),
        fetch(`/api/pm/theses?ticker=${ticker}`, { cache: 'no-store' }),
        fetch(`/api/pm/quant-monitor?ticker=${ticker}&limit=12`, { cache: 'no-store' }),
      ]);
      const [posPayload, thesisPayload, snapsPayload] = await Promise.all([
        posRes.json().catch(() => ({})) as Promise<{ positions?: PortfolioPosition[] }>,
        thesisRes.json().catch(() => ({})) as Promise<{ theses?: PositionThesis[] }>,
        snapsRes.json().catch(() => ({})) as Promise<{ snapshots?: QuantScoreSnapshot[] }>,
      ]);
      const position = posPayload.positions?.[0];
      const thesis = thesisPayload.theses?.[0];
      if (!position || !thesis) {
        setDetail(null);
        return;
      }
      const snapshots = snapsPayload.snapshots ?? [];
      const seen = new Set<string>();
      const latestPerAnalyst = snapshots.filter(s => {
        if (seen.has(s.analystKey)) return false;
        seen.add(s.analystKey);
        return true;
      });
      setDetail({
        ticker,
        position,
        thesis,
        snapshots: latestPerAnalyst,
        analyzedAt: position.lastPmAnalysisAt ?? position.updatedAt,
        isAlreadyHeld: position.status === 'active' || position.status === 'trimmed',
      });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicker) void loadDetailFor(selectedTicker);
  }, [selectedTicker, loadDetailFor]);

  const handleAnalyze = useCallback(async () => {
    const raw = input.trim().toUpperCase();
    if (!raw) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/pm/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: raw }),
      });
      const payload = await res.json().catch(() => ({})) as Partial<ResearchResponse> & { error?: string; reason?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ? `${payload.error}${payload.reason ? `: ${payload.reason}` : ''}` : `HTTP ${res.status}`);
        return;
      }
      setInput('');
      // Hydrate the detail directly from the POST payload — Supabase replicas can lag
      // and a refetch immediately after write occasionally shows the prior thesis.
      if (payload.position && payload.thesis) {
        setDetail({
          ticker: payload.ticker ?? raw,
          position: payload.position,
          thesis: payload.thesis,
          snapshots: payload.snapshots ?? [],
          analyzedAt: payload.position.lastPmAnalysisAt ?? payload.position.updatedAt ?? new Date().toISOString(),
          isAlreadyHeld: payload.isAlreadyHeld ?? false,
        });
      }
      setSelectedTicker(raw);
      // Refresh sidebar list (cheap, no race).
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }, [input, loadList, loadDetailFor]);

  const watchlistOnly = useMemo(() => list.filter(p => p.status === 'watch'), [list]);
  const heldOnly = useMemo(() => list.filter(p => p.status === 'active' || p.status === 'trimmed'), [list]);

  return (
    <main className="mx-auto max-w-7xl space-y-4">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Research</p>
        <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Idea Lab</h1>
        <p className="max-w-2xl text-sm text-[var(--cb-text-muted)]">
          Paste any ticker. Six scouts read it, the PM agent writes a thesis: target, stop, drivers, catalysts, risks. Save to watchlist or move on.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cb-text-muted)]" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !analyzing) void handleAnalyze(); }}
            placeholder="Type ticker (e.g. AAPL, NVDA, SPOT)"
            disabled={analyzing}
            className="h-10 w-full rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] pl-8 pr-3 text-sm text-[var(--cb-text-primary)] outline-none placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-green)] disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => { void handleAnalyze(); }}
          disabled={analyzing || input.trim().length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-sm font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
        >
          <Sparkles className={cn('h-4 w-4', analyzing && 'animate-pulse')} />
          {analyzing ? 'Analyzing… ~45s' : 'Analyze'}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-4">
        <aside className="space-y-4">
          <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Held ({heldOnly.length})</h3>
            <div className="space-y-1">
              {heldOnly.length === 0 ? (
                <p className="text-xs text-[var(--cb-text-muted)]">No held positions</p>
              ) : heldOnly.map(p => (
                <ResearchRow key={p.id} p={p} active={selectedTicker === p.ticker} onClick={() => setSelectedTicker(p.ticker)} />
              ))}
            </div>
          </section>
          <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Watchlist ({watchlistOnly.length})</h3>
            <div className="space-y-1">
              {watchlistOnly.length === 0 ? (
                <p className="text-xs text-[var(--cb-text-muted)]">No watchlist names yet</p>
              ) : watchlistOnly.map(p => (
                <ResearchRow key={p.id} p={p} active={selectedTicker === p.ticker} onClick={() => setSelectedTicker(p.ticker)} />
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          {analyzing ? (
            <AnalyzingSkeleton ticker={input.trim().toUpperCase() || '…'} />
          ) : loadingDetail ? (
            <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-6 text-sm text-[var(--cb-text-muted)]">
              Loading…
            </div>
          ) : detail ? (
            <ResearchDetail detail={detail} />
          ) : (
            <EmptyResearchPane onSeed={(t) => { setInput(t); }} />
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyResearchPane({ onSeed }: { onSeed: (ticker: string) => void }) {
  const seeds = ['AAPL', 'NVDA', 'SPOT', 'TSLA', 'COST'];
  return (
    <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">No ideas yet</h3>
      <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
        Paste any ticker above, or start with one of these. The PM agent runs 6 scouts + writes a target, stop, conviction, thesis, drivers, risks, catalysts. About 45 seconds per name.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {seeds.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onSeed(t)}
            className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2.5 py-1 font-mono text-xs text-[var(--cb-text-primary)] transition hover:border-[var(--cb-border-strong)]"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const SCOUT_NAMES = ['Fundamentals', 'Valuation', 'Technicals', 'Sentiment', 'News', 'Growth'];

function AnalyzingSkeleton({ ticker }: { ticker: string }) {
  return (
    <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-6">
      <div className="flex items-center gap-3">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: 'var(--cb-bull)' }} />
        <p className="text-sm text-[var(--cb-text-primary)]">Analyzing <span className="font-mono">{ticker}</span>…</p>
      </div>
      <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
        6 scouts read it, then the PM writes a thesis. ~45 seconds.
      </p>
      <div className="mt-4 space-y-2">
        {SCOUT_NAMES.map((name, i) => (
          <div key={name} className="flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--cb-text-muted)',
                animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
            <span className="font-mono text-xs text-[var(--cb-text-muted)]">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchRow({ p, active, onClick }: { p: PortfolioPosition; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition',
        active ? 'bg-[var(--cb-surface-subtle)] text-[var(--cb-text-primary)]' : 'text-[var(--cb-text-secondary)] hover:bg-[var(--cb-surface-subtle)]',
      )}
    >
      <span className="font-mono text-xs font-semibold">{p.ticker}</span>
      <span className="flex items-center gap-2 font-mono text-[10px] text-[var(--cb-text-muted)]">
        {p.targetPrice != null && p.currentPrice != null && (
          <span style={{ color: p.targetPrice > p.currentPrice ? 'var(--cb-bull)' : 'var(--cb-bear)' }}>
            {p.targetPrice > p.currentPrice ? '+' : ''}{(((p.targetPrice - p.currentPrice) / p.currentPrice) * 100).toFixed(0)}%
          </span>
        )}
        {p.convictionScore != null && (
          <span style={{ color: convictionTone(p.convictionScore) }}>{p.convictionScore}</span>
        )}
      </span>
    </button>
  );
}

function ResearchDetail({ detail }: { detail: ResearchSnapshot }) {
  const { ticker, position, thesis, snapshots, analyzedAt, isAlreadyHeld } = detail;
  const upsidePct = position.targetPrice != null && position.currentPrice != null && position.currentPrice > 0
    ? ((position.targetPrice - position.currentPrice) / position.currentPrice) * 100
    : null;
  const stopPct = position.stopLoss != null && position.currentPrice != null && position.currentPrice > 0
    ? ((position.stopLoss - position.currentPrice) / position.currentPrice) * 100
    : null;

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-bold text-[var(--cb-text-primary)]">{ticker}</h2>
              {position.companyName && (
                <span className="text-sm text-[var(--cb-text-muted)]">{position.companyName}</span>
              )}
              {isAlreadyHeld && (
                <span className="rounded border border-[var(--cb-green)]/40 bg-[var(--cb-green)]/10 px-1.5 py-0.5 text-[10px] font-mono text-[var(--cb-green)]">HELD</span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
              Analyzed {new Date(analyzedAt).toLocaleString()} · {thesis.timeHorizon ?? '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl text-[var(--cb-text-primary)]">
              ${position.currentPrice?.toFixed(2) ?? '—'}
            </p>
            <p className="text-[10px] text-[var(--cb-text-muted)]">current</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            label="Target"
            value={position.targetPrice != null ? `$${position.targetPrice.toFixed(2)}` : '—'}
            sub={upsidePct != null ? `${upsidePct > 0 ? '+' : ''}${upsidePct.toFixed(1)}%` : null}
            tone={upsidePct != null && upsidePct > 0 ? 'var(--cb-bull)' : 'var(--cb-bear)'}
          />
          <Stat
            label="Stop"
            value={position.stopLoss != null ? `$${position.stopLoss.toFixed(2)}` : '—'}
            sub={stopPct != null ? `${stopPct.toFixed(1)}%` : null}
            tone="#e2685c"
          />
          <Stat
            label="Conviction"
            value={position.convictionScore != null ? `${position.convictionScore}/100` : '—'}
            sub={thesis.thesisStatus ?? null}
            tone={convictionTone(position.convictionScore)}
          />
        </div>
      </section>

      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Thesis</h3>
        <p className="text-sm leading-relaxed text-[var(--cb-text-primary)]">{thesis.thesisSummary}</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--cb-text-secondary)]">{thesis.whyWeOwnIt}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--cb-border)] pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Primary driver</p>
            <p className="mt-1 text-sm text-[var(--cb-text-primary)]">{thesis.primaryDriver ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Main risk</p>
            <p className="mt-1 text-sm text-[var(--cb-text-primary)]">{thesis.mainRisk ?? '—'}</p>
          </div>
        </div>
        {thesis.catalystExpected && (
          <div className="mt-3 border-t border-[var(--cb-border)] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Next catalyst</p>
            <p className="mt-1 text-sm text-[var(--cb-text-primary)]">{thesis.catalystExpected}</p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-3 gap-3">
        <ListPanel title="Catalysts" items={thesis.catalysts ?? []} icon={<TrendingUp className="h-3 w-3" />} tone="#65d487" />
        <ListPanel title="Key risks" items={thesis.keyRisks ?? []} icon={<TrendingDown className="h-3 w-3" />} tone="#e2685c" />
        <ListPanel title="Sell conditions" items={thesis.sellConditions ?? []} icon={<Activity className="h-3 w-3" />} tone="#e8c862" />
      </div>

      {(thesis.invalidationConditions?.length ?? 0) > 0 && (
        <section className="rounded-md border border-red-900/40 bg-red-950/20 p-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-red-300">Thesis breaks if</h3>
          <ul className="space-y-1">
            {(thesis.invalidationConditions ?? []).map((c, i) => (
              <li key={i} className="text-xs text-red-200">— {c}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Scout reads</h3>
        {snapshots.length === 0 ? (
          <p className="text-xs text-[var(--cb-text-muted)]">No scout reads available.</p>
        ) : (
          <div className="space-y-2">
            {snapshots.map(s => (
              <div key={s.id} className="border-l-2 pl-3" style={{ borderLeftColor: signalColor(s.signal) }}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs text-[var(--cb-text-primary)]">
                    {s.analystName.replace(' Analyst', '')}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: signalColor(s.signal) }}>
                    {s.signal} · {Math.round(s.score)}/100
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--cb-text-secondary)]">{s.reasoning}</p>
                {s.watch && <p className="mt-0.5 text-[10px] text-[var(--cb-text-muted)]">Watch: {s.watch}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string | null; tone: string }) {
  return (
    <div className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-base text-[var(--cb-text-primary)]" style={{ color: tone }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--cb-text-muted)]">{sub}</p>}
    </div>
  );
}

function ListPanel({ title, items, icon, tone }: { title: string; items: string[]; icon: React.ReactNode; tone: string }) {
  return (
    <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: tone }}>
        {icon}
        {title}
      </h3>
      <ul className="space-y-1">
        {items.length === 0 ? (
          <li className="text-xs text-[var(--cb-text-muted)]">—</li>
        ) : items.map((c, i) => (
          <li key={i} className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">— {c}</li>
        ))}
      </ul>
    </section>
  );
}
