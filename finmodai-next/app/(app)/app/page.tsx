/**
 * App Home — Ranked Stock Opportunities
 *
 * Server component: fetches the default watchlist ranking at request time,
 * then passes it to the RankedList client component for interactive filtering.
 */

import { headers } from 'next/headers';
import { RankedList } from '@/components/ranking/RankedList';
import type { RankResponse } from '@/lib/ranking/types';
import { APP_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

async function fetchRankings(): Promise<RankResponse> {
  try {
    const hdrs = await headers();
    const host = hdrs.get('host') ?? 'localhost:3000';
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const origin = `${proto}://${host}`;

    const res = await fetch(`${origin}/api/rank`, {
      method: 'GET',
      cache:  'no-store',
    });

    if (res.ok) return res.json() as Promise<RankResponse>;
  } catch (err) {
    console.error('[AppHomePage] rank fetch failed:', err);
  }

  // Static fallback — scoreMultiple is not called here; the API handles it.
  // Return empty shell so the page renders; RankedList will handle empty state.
  return { stocks: [], scoredAt: new Date().toISOString(), horizonWeeks: 6 };
}

export default async function AppHomePage() {
  const data = await fetchRankings();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
          {APP_NAME}
        </p>
        <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">
          Stock Opportunities
        </h1>
        <p className="text-sm text-[var(--cb-text-muted)]">
          Ranked by 1–3 month investment signal. Green = buy, yellow = watch, red = avoid.
        </p>
      </header>

      <RankedList initial={data} />
    </div>
  );
}
