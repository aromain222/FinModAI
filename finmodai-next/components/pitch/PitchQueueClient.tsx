'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PitchQueueItem, PitchVoteStatus } from '@/lib/pitchQueue/types';
import {
  getPitchQueue,
  removePitchQueueItem,
  updatePitchVoteStatus,
} from '@/lib/pitchQueue/storage';
import { cn } from '@/lib/utils';

function signalTone(signal: string): string {
  if (signal === 'green') return 'text-emerald-300';
  if (signal === 'red') return 'text-red-300';
  return 'text-amber-200';
}

function voteTone(status: PitchVoteStatus): string {
  if (status === 'approved') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
  if (status === 'rejected') return 'border-red-400/30 bg-red-400/10 text-red-100';
  return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
}

export function PitchQueueClient() {
  const [items, setItems] = useState<PitchQueueItem[]>([]);

  useEffect(() => {
    setItems(getPitchQueue());
    const refresh = () => setItems(getPitchQueue());
    window.addEventListener('capitalbase:pitch-queue-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('capitalbase:pitch-queue-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const updateVote = (id: string, status: PitchVoteStatus) => {
    setItems(updatePitchVoteStatus(id, status));
  };

  const remove = (id: string) => {
    setItems(removePitchQueueItem(id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--cb-text-muted)]">
          {items.length} queued idea{items.length === 1 ? '' : 's'} for weekly discussion.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/app">Back to Ranked Board</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] px-6 py-12 text-center">
          <div className="text-base font-semibold text-[var(--cb-text-primary)]">No pitches queued yet</div>
          <p className="mt-2 text-sm text-[var(--cb-text-muted)]">
            Open a ranked stock, generate or review the pitch, then add it to the weekly queue.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const date = new Date(item.timestamp);
            const dateText = Number.isNaN(date.getTime())
              ? 'Queued recently'
              : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-[var(--cb-text-primary)]">{item.ticker}</h2>
                      <span className={cn('text-xs font-semibold uppercase tracking-widest', signalTone(item.signal))}>
                        {item.signal}
                      </span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', voteTone(item.voteStatus))}>
                        {item.voteStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
                      Score {item.opportunityScore.toFixed(1)} / 10 · {item.horizon} · {dateText}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="rounded-lg border border-[var(--cb-border-subtle)] p-2 text-[var(--cb-text-muted)] transition-colors hover:border-red-400/40 hover:text-red-200"
                    aria-label={`Remove ${item.ticker} from pitch queue`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Why queued</div>
                    <p className="mt-1 text-sm text-[var(--cb-text-primary)]">{item.primaryReason}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--cb-surface-subtle)] px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Main risk</div>
                    <p className="mt-1 text-sm text-amber-100/90">{item.mainRisk}</p>
                  </div>
                </div>

                <details className="mt-4 rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
                    Open pitch
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--cb-text-primary)]">
                    {item.generatedPitch}
                  </pre>
                </details>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {(['pending', 'approved', 'rejected'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateVote(item.id, status)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                        item.voteStatus === status
                          ? voteTone(status)
                          : 'border-[var(--cb-border-subtle)] text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]',
                      )}
                    >
                      {status}
                    </button>
                  ))}
                  <Button asChild variant="outline" size="sm" className="ml-auto">
                    <Link href={`/analyst-chat?ticker=${encodeURIComponent(item.ticker)}`}>
                      Reopen in Chat
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

