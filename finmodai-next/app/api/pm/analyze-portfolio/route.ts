import { NextRequest, NextResponse } from 'next/server';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Run PM analysis across every active position. Sequential to avoid hammering
 * the LLM provider — each call ~10-30s. For a typical 8-position book this is
 * 1-4 minutes total. Returns per-ticker outcomes so the UI can surface failures.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;

  const positions = await listPositions({ limit: 200 });
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');

  const results: Array<{ ticker: string; ok: boolean; reason?: string }> = [];
  for (const pos of active) {
    try {
      const res = await fetch(`${origin}/api/pm/analyze-position`, {
        method: 'POST',
        headers: internalRequestHeaders(req.headers),
        body: JSON.stringify({ ticker: pos.ticker }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        results.push({ ticker: pos.ticker, ok: false, reason: body?.reason ?? `HTTP ${res.status}` });
      } else {
        results.push({ ticker: pos.ticker, ok: true });
      }
    } catch (err) {
      results.push({ ticker: pos.ticker, ok: false, reason: (err as Error).message });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  return NextResponse.json({
    analyzed: succeeded,
    failed: results.length - succeeded,
    total: results.length,
    results,
  });
}
