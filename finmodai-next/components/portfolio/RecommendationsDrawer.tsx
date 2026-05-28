'use client';

import { useEffect, useState } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import type { Recommendation } from '@/app/api/execution/recommendations/route';

interface RecommendationsDrawerProps {
  onAdd: (ticker: string) => void;
}

type Status = 'loading' | 'done' | 'error';

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7.0
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

export function RecommendationsDrawer({ onAdd }: RecommendationsDrawerProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [recs,   setRecs]   = useState<Recommendation[]>([]);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/execution/recommendations');
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json() as { recommendations: Recommendation[] };
        if (!cancelled) {
          setRecs(data.recommendations);
          setStatus('done');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recommendations');
          setStatus('error');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={13} className="text-[var(--cb-text-muted)]" />
        <span className="text-xs font-semibold text-[var(--cb-text-primary)]">Agent recommendations</span>
        <span className="text-xs text-[var(--cb-text-muted)]">— scored from live universe</span>
      </div>

      {status === 'loading' && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--cb-surface-subtle)]" />
          ))}
          <p className="mt-2 text-center text-xs text-[var(--cb-text-muted)]">
            Scoring stocks — this takes ~15 s
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-3 text-xs text-red-400">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {status === 'done' && recs.length === 0 && (
        <p className="text-xs text-[var(--cb-text-muted)]">
          No strong buy candidates right now (score &lt; 6.0 across universe).
        </p>
      )}

      {status === 'done' && recs.length > 0 && (
        <div className="space-y-2">
          {recs.map(rec => (
            <div
              key={rec.ticker}
              className="flex items-start justify-between gap-3 rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{rec.ticker}</span>
                  <ScoreBadge score={rec.score} />
                  {rec.sector && (
                    <span className="text-xs text-[var(--cb-text-muted)]">{rec.sector}</span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--cb-text-secondary)]">
                  {rec.primaryReason}
                </p>
                <p className="line-clamp-1 text-xs text-[var(--cb-text-muted)]">
                  <span className="mr-1 text-amber-400/70">Risk:</span>
                  {rec.mainRisk}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAdd(rec.ticker)}
                className="cursor-pointer shrink-0 rounded-lg border border-[var(--cb-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--cb-text-primary)] transition-colors hover:bg-[var(--cb-surface)]"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
