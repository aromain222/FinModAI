import { NextRequest, NextResponse } from 'next/server';
import { lookupStock } from '@/lib/data/company/lookupStock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const prompt = searchParams.get('prompt')?.trim() || undefined;
    const ticker = searchParams.get('ticker')?.trim() || undefined;
    const companyName = searchParams.get('companyName')?.trim() || undefined;

    const resolved = await lookupStock({ prompt, ticker, companyName });
    if (!resolved) {
      return NextResponse.json(
        { error: 'Could not resolve a stock from the provided input.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ stock: resolved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stock lookup failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === 'string' ? body.prompt : undefined;
    const ticker = typeof body?.ticker === 'string' ? body.ticker : undefined;
    const companyName = typeof body?.companyName === 'string' ? body.companyName : undefined;

    const resolved = await lookupStock({ prompt, ticker, companyName });
    if (!resolved) {
      return NextResponse.json(
        { error: 'Could not resolve a stock from the provided input.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ stock: resolved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stock lookup failed' },
      { status: 500 },
    );
  }
}
