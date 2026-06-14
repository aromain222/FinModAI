'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Newspaper, Play, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mood = 'bullish' | 'neutral' | 'bearish' | 'mixed';
type Confidence = 'low' | 'medium' | 'high';
type MentionVolume = 'normal' | 'elevated' | 'spiking';

type MarketBrief = {
  id: string;
  runAt: string;
  runLabel: string;
  source: 'x_trending_lookup' | 'news_pipeline' | 'hybrid';
  tickersCovered: string[];
  sectorsCovered: string[];
  summary: string;
  xSamplesCount: number;
  newsEventsCount: number;
  analysis: {
    marketMood: Mood;
    marketMoodWhy: string;
    executiveSummary: string[];
    topTopics: Array<{
      topic: string;
      whyTrending: string;
      relevantTickers: string[];
      relevantSectors: string[];
      confidence: Confidence;
      sources: string[];
    }>;
    portfolioAlerts: Array<{
      ticker: string;
      companyName?: string | null;
      mentionVolume: MentionVolume;
      sentiment: Mood;
      keyPoints: string[];
      potentialThesisImpact?: string | null;
    }>;
    macroSignals: {
      ratesFed?: string | null;
      inflation?: string | null;
      jobsEconomy?: string | null;
      commoditiesEnergy?: string | null;
      crypto?: string | null;
      geopolitics?: string | null;
    };
    bullishArguments: string[];
    bearishArguments: string[];
    riskFlags: string[];
    recommendedAgentReviews: Array<{
      ticker?: string | null;
      sector?: string | null;
      reason: string;
    }>;
    confidence: Confidence;
    pmHandoff: {
      whatChanged: string;
      deservesAttention: string;
      canIgnore: string;
    };
  };
};

function moodTone(mood: Mood): string {
  switch (mood) {
    case 'bullish': return 'var(--cb-bull)';
    case 'bearish': return 'var(--cb-bear)';
    case 'mixed':   return 'var(--cb-caution)';
    default:        return 'var(--cb-neutral)';
  }
}

function volumeTone(v: MentionVolume): string {
  if (v === 'spiking') return 'var(--cb-bear)';
  if (v === 'elevated') return 'var(--cb-caution)';
  return 'var(--cb-neutral)';
}

function confidenceLabel(c: Confidence): string {
  return c === 'high' ? 'HIGH' : c === 'medium' ? 'MED' : 'LOW';
}

export default function IntelligencePage() {
  const [briefs, setBriefs] = useState<MarketBrief[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pm/market-brief?limit=50', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { briefs?: MarketBrief[] };
      const list = (data.briefs ?? []).sort((a, b) => b.runAt.localeCompare(a.runAt));
      setBriefs(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, [load]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/pm/market-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runLabel: 'manual' }),
      });
      const payload = await res.json().catch(() => ({})) as { brief?: MarketBrief; error?: string; reason?: string };
      if (!res.ok) {
        setError(payload.error ? `${payload.error}${payload.reason ? `: ${payload.reason}` : ''}` : `HTTP ${res.status}`);
        return;
      }
      await load();
      if (payload.brief?.id) setSelectedId(payload.brief.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }, [load]);

  const selected = useMemo(() => briefs.find(b => b.id === selectedId) ?? null, [briefs, selectedId]);

  return (
    <main className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Market Intelligence</p>
          <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Daily Brief</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--cb-text-muted)]">
            Scheduled at 6 / 10 / 12 / 2 / 4 ET on weekdays. Pulls X chatter (when token set), news events, and portfolio context — synthesizes what matters now.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void handleRun(); }}
          disabled={running}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 text-sm font-medium text-[var(--cb-text-secondary)] transition hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
        >
          <Play className={cn('h-4 w-4', running && 'animate-pulse')} />
          {running ? 'Running brief…' : 'Run brief now'}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-[var(--cb-danger)]/40 bg-[var(--cb-danger)]/[0.08] px-3 py-2 text-xs text-[var(--cb-text-primary)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4">
        <aside className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
            History ({briefs.length})
          </h3>
          <div className="space-y-1">
            {loading && briefs.length === 0 ? (
              <p className="text-xs text-[var(--cb-text-muted)]">Loading…</p>
            ) : briefs.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--cb-text-muted)]">No briefs yet.</p>
                <button
                  type="button"
                  onClick={() => { void handleRun(); }}
                  className="rounded border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-xs text-[var(--cb-text-primary)] hover:border-[var(--cb-border-strong)]"
                >
                  Run first brief
                </button>
              </div>
            ) : briefs.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={cn(
                  'w-full rounded px-2 py-1.5 text-left transition',
                  selectedId === b.id ? 'bg-[var(--cb-surface-subtle)]' : 'hover:bg-[var(--cb-surface-subtle)]',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--cb-text-primary)]">{b.runLabel}</span>
                  <span className="font-mono text-[10px]" style={{ color: moodTone(b.analysis.marketMood) }}>
                    {b.analysis.marketMood}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--cb-text-muted)]">
                  {new Date(b.runAt).toLocaleString()}
                </p>
                <p className="mt-1 line-clamp-2 text-[10px] text-[var(--cb-text-secondary)]">
                  {b.summary}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {selected ? <BriefDetail brief={selected} /> : (
            <div className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-6 text-sm text-[var(--cb-text-muted)]">
              Pick a brief on the left, or click <strong>Run brief now</strong> to generate the first one.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function BriefDetail({ brief }: { brief: MarketBrief }) {
  const a = brief.analysis;
  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase"
                style={{ color: moodTone(a.marketMood), backgroundColor: 'var(--cb-surface-subtle)' }}
              >
                {a.marketMood}
              </span>
              <span className="font-mono text-[10px] text-[var(--cb-text-muted)]">
                {brief.runLabel} · {new Date(brief.runAt).toLocaleString()} · conf {confidenceLabel(a.confidence)}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--cb-text-primary)]">{a.marketMoodWhy}</p>
          </div>
          <div className="shrink-0 text-right text-[10px] text-[var(--cb-text-muted)]">
            <div className="flex items-center justify-end gap-1"><Newspaper className="h-3 w-3" />{brief.newsEventsCount} events</div>
            <div className="flex items-center justify-end gap-1"><Activity className="h-3 w-3" />{brief.xSamplesCount} X posts</div>
            <div className="mt-1 font-mono text-[9px] uppercase">{brief.source.replace(/_/g, ' ')}</div>
          </div>
        </div>
      </section>

      {/* Executive summary */}
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Executive summary</h3>
        <ul className="space-y-1.5">
          {a.executiveSummary.map((b, i) => (
            <li key={i} className="text-sm leading-relaxed text-[var(--cb-text-primary)]">— {b}</li>
          ))}
        </ul>
      </section>

      {/* PM handoff */}
      <section className="rounded-md border border-[var(--cb-green)]/30 bg-[var(--cb-accent-soft)] p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-green)]">PM handoff</h3>
        <div className="space-y-2 text-sm text-[var(--cb-text-primary)]">
          <p><span className="text-[var(--cb-text-muted)]">What changed:</span> {a.pmHandoff.whatChanged}</p>
          <p><span className="text-[var(--cb-text-muted)]">Deserves attention:</span> {a.pmHandoff.deservesAttention}</p>
          <p><span className="text-[var(--cb-text-muted)]">Can ignore:</span> {a.pmHandoff.canIgnore}</p>
        </div>
      </section>

      {/* Portfolio alerts */}
      {a.portfolioAlerts.length > 0 && (
        <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Portfolio &amp; watchlist alerts ({a.portfolioAlerts.length})</h3>
          <div className="space-y-2">
            {a.portfolioAlerts.map((p, i) => (
              <div key={i} className="rounded border border-[var(--cb-border)] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link href={`/research?ticker=${p.ticker}`} className="font-mono text-sm font-semibold text-[var(--cb-text-primary)] hover:underline">{p.ticker}</Link>
                    {p.companyName && <span className="text-xs text-[var(--cb-text-muted)]">{p.companyName}</span>}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span style={{ color: volumeTone(p.mentionVolume) }}>{p.mentionVolume}</span>
                    <span>·</span>
                    <span style={{ color: moodTone(p.sentiment) }}>{p.sentiment}</span>
                  </div>
                </div>
                {p.keyPoints.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {p.keyPoints.map((k, j) => (
                      <li key={j} className="text-xs text-[var(--cb-text-secondary)]">— {k}</li>
                    ))}
                  </ul>
                )}
                {p.potentialThesisImpact && (
                  <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Thesis impact: {p.potentialThesisImpact}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top topics */}
      {a.topTopics.length > 0 && (
        <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Trending topics ({a.topTopics.length})</h3>
          <div className="space-y-2">
            {a.topTopics.map((t, i) => (
              <div key={i} className="rounded border border-[var(--cb-border)] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--cb-text-primary)]">{t.topic}</p>
                  <span className="font-mono text-[10px] text-[var(--cb-text-muted)]">conf {confidenceLabel(t.confidence)}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--cb-text-secondary)]">{t.whyTrending}</p>
                {(t.relevantTickers.length > 0 || t.relevantSectors.length > 0) && (
                  <p className="mt-1 font-mono text-[10px] text-[var(--cb-text-muted)]">
                    {t.relevantTickers.map(tk => (
                      <Link key={tk} href={`/research?ticker=${tk}`} className="mr-2 hover:underline">${tk}</Link>
                    ))}
                    {t.relevantSectors.length > 0 && <span> · {t.relevantSectors.join(', ')}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Macro */}
      <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">Macro signals</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MacroRow label="Rates / Fed" value={a.macroSignals.ratesFed} />
          <MacroRow label="Inflation" value={a.macroSignals.inflation} />
          <MacroRow label="Jobs / economy" value={a.macroSignals.jobsEconomy} />
          <MacroRow label="Commodities / energy" value={a.macroSignals.commoditiesEnergy} />
          <MacroRow label="Crypto" value={a.macroSignals.crypto} />
          <MacroRow label="Geopolitics" value={a.macroSignals.geopolitics} />
        </div>
      </section>

      {/* Bull/Bear */}
      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-md border border-[var(--cb-bull)]/30 bg-[var(--cb-surface)] p-3">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--cb-bull)' }}>
            <TrendingUp className="h-3 w-3" /> Bullish arguments
          </h3>
          <ul className="space-y-1">
            {a.bullishArguments.length === 0
              ? <li className="text-xs text-[var(--cb-text-muted)]">—</li>
              : a.bullishArguments.map((b, i) => <li key={i} className="text-xs text-[var(--cb-text-secondary)]">— {b}</li>)}
          </ul>
        </section>
        <section className="rounded-md border border-[var(--cb-bear)]/30 bg-[var(--cb-surface)] p-3">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--cb-bear)' }}>
            <TrendingDown className="h-3 w-3" /> Bearish arguments
          </h3>
          <ul className="space-y-1">
            {a.bearishArguments.length === 0
              ? <li className="text-xs text-[var(--cb-text-muted)]">—</li>
              : a.bearishArguments.map((b, i) => <li key={i} className="text-xs text-[var(--cb-text-secondary)]">— {b}</li>)}
          </ul>
        </section>
      </div>

      {/* Risk flags */}
      {a.riskFlags.length > 0 && (
        <section className="rounded-md border border-[var(--cb-caution)]/40 bg-[var(--cb-surface)] p-3">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--cb-caution)' }}>
            Risk flags
          </h3>
          <ul className="space-y-1">
            {a.riskFlags.map((r, i) => <li key={i} className="text-xs text-[var(--cb-text-secondary)]">— {r}</li>)}
          </ul>
        </section>
      )}

      {/* Recommended reviews */}
      {a.recommendedAgentReviews.length > 0 && (
        <section className="rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface)] p-3">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
            Suggested agent reviews
          </h3>
          <ul className="space-y-1">
            {a.recommendedAgentReviews.map((r, i) => (
              <li key={i} className="text-xs text-[var(--cb-text-secondary)]">
                <span className="font-mono">{r.ticker ?? r.sector ?? '—'}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MacroRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p>
      <p className="mt-0.5 text-xs text-[var(--cb-text-primary)]">{value && value.trim() ? value : '—'}</p>
    </div>
  );
}
