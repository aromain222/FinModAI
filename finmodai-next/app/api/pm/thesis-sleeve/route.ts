import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildThesisSleeve } from '@/lib/pm/sleeve/buildThesisSleeve';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import type { RankResponse } from '@/lib/ranking/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  idea: z.string().trim().max(800).optional(),
  horizonDays: z.number().int().min(21).max(90).default(45),
  maxPositions: z.number().int().min(2).max(6).default(4),
  capitalUsd: z.number().positive().max(100_000_000).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const origin = new URL(req.url).origin;
    const horizonWeeks = Math.max(3, Math.ceil(parsed.data.horizonDays / 7));
    const rankResponse = await fetch(`${origin}/api/rank?limit=40&horizonWeeks=${horizonWeeks}`, {
      cache: 'no-store',
      headers: internalRequestHeaders(req.headers),
      signal: AbortSignal.timeout(50_000),
    });
    if (!rankResponse.ok) throw new Error(`Ranked board returned HTTP ${rankResponse.status}.`);
    const ranked = await rankResponse.json() as Partial<RankResponse>;
    if (!ranked.stocks || ranked.stocks.length < 2) throw new Error('Ranked board did not return enough candidates.');

    const sleeve = await buildThesisSleeve({
      idea: parsed.data.idea,
      horizonDays: parsed.data.horizonDays,
      maxPositions: parsed.data.maxPositions,
      capitalUsd: parsed.data.capitalUsd,
      rankedStocks: ranked.stocks,
      rankedAt: ranked.scoredAt ?? new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, sleeve });
  } catch (error) {
    console.error('[thesis-sleeve] generation failed:', error);
    return NextResponse.json({
      error: 'sleeve_generation_failed',
      detail: error instanceof Error ? error.message : 'Unknown sleeve generation error.',
    }, { status: 502 });
  }
}
