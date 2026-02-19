import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const rangeSchema = z.enum(['1D', '1W', '1M', '3M', '1Y', 'MAX']);

export async function GET(req: NextRequest) {
  try {
    const range = rangeSchema.parse((req.nextUrl.searchParams.get('range') || '1M').toUpperCase());
    const origin = req.nextUrl.origin;
    const response = await fetch(`${origin}/api/market-brief/performance?range=${range}&symbol=SPY`, {
      cache: 'no-store',
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: payload?.message || payload?.error || 'Failed to fetch SPY data.' },
        { status: response.status }
      );
    }

    return NextResponse.json({ ok: true, range, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid SPY request.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

