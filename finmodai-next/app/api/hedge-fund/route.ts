import { NextRequest, NextResponse } from 'next/server';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 120;

const PYTHON_BACKEND =
  process.env.PYTHON_BACKEND_URL?.trim() ||
  (process.env.NODE_ENV === 'production' ? null : 'http://localhost:8082');

export async function POST(req: NextRequest) {
  if (!PYTHON_BACKEND) {
    return NextResponse.json(
      { error: 'Python backend not configured (PYTHON_BACKEND_URL)' },
      { status: 503 },
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  try {
    const upstream = await fetch(`${PYTHON_BACKEND}/api/v1/hedge-fund/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(115_000),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return NextResponse.json({ error: data?.detail ?? 'Backend error' }, { status: upstream.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 502 });
  }
}
