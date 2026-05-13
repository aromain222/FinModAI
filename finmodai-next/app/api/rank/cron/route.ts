/**
 * GET /api/rank/cron
 *
 * Called by Vercel Cron every 10 minutes.
 * Scores the next BATCH_PER_RUN tickers from the full watchlist and
 * upserts results into the ranked_stocks Supabase table.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 * Vercel automatically sets Authorization: Bearer ${CRON_SECRET} on
 * internally-triggered cron requests, so no manual token management needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { scoreMultiple } from '@/lib/ranking/score';
import { writeCache, readCronOffset, writeCronOffset } from '@/lib/ranking/rankCache';
import { mockFallback } from '@/lib/ranking/mock';
import { attachClassification, buildRankUniverse, DEFAULT_RANK_UNIVERSE_SIZE } from '@/lib/ranking/universe';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const BATCH_PER_RUN = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify Vercel cron signature or manual secret
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const universe = await buildRankUniverse(DEFAULT_RANK_UNIVERSE_SIZE);
  const total  = universe.tickers.length;

  // Read current offset, score next slice, advance
  const offset = await readCronOffset();
  const end    = Math.min(offset + BATCH_PER_RUN, total);
  const batch  = universe.tickers.slice(offset, end);
  const next   = end >= total ? 0 : end;

  let scored;
  try {
    scored = attachClassification(await scoreMultiple(batch, origin, 6), universe.metaByTicker);
  } catch {
    scored = attachClassification(batch.map(t => mockFallback(t, 6)), universe.metaByTicker);
  }

  await writeCache(scored);
  await writeCronOffset(next);

  return NextResponse.json({
    ok: true,
    scored: scored.length,
    offset,
    next,
    total,
    cycleComplete: next === 0,
  });
}
