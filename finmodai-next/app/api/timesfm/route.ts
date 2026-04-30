import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL ?? 'http://localhost:8082';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type'); // 'price' | 'revenue'
  const ticker = searchParams.get('ticker');

  if (!type || !ticker) {
    return NextResponse.json({ error: 'type and ticker are required' }, { status: 400 });
  }
  if (type !== 'price' && type !== 'revenue') {
    return NextResponse.json({ error: 'type must be price or revenue' }, { status: 400 });
  }

  const params = new URLSearchParams({ ticker });
  if (type === 'price') {
    const horizon = searchParams.get('horizon') ?? '30';
    params.set('horizon', horizon);
  } else {
    const quarters = searchParams.get('quarters') ?? '4';
    params.set('quarters', quarters);
  }

  try {
    const upstream = await fetch(`${PYTHON_BACKEND}/api/v1/timesfm/${type}?${params.toString()}`, {
      signal: AbortSignal.timeout(55000),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return NextResponse.json(
        { error: `Forecast service error (${upstream.status})`, detail: text },
        { status: upstream.status },
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Forecast service unavailable', detail: message },
      { status: 503 },
    );
  }
}
