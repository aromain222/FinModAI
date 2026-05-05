import { headers } from 'next/headers';
import { RankedList } from '@/components/ranking/RankedList';
import type { RankResponse } from '@/lib/ranking/types';

export const dynamic = 'force-dynamic';

async function fetchRankings(): Promise<RankResponse> {
  try {
    const hdrs  = await headers();
    const host  = hdrs.get('host') ?? 'localhost:3000';
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const res   = await fetch(`${proto}://${host}/api/rank`, {
      method: 'GET',
      cache:  'no-store',
    });
    if (res.ok) return res.json() as Promise<RankResponse>;
  } catch (err) {
    console.error('[AppHomePage] rank fetch failed:', err);
  }
  return { stocks: [], scoredAt: new Date().toISOString(), horizonWeeks: 6 };
}

export default async function AppHomePage() {
  const data = await fetchRankings();
  return <RankedList initial={data} />;
}
