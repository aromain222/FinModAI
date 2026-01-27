import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const traceId = crypto.randomUUID();
  const status = {
    polygon: Boolean(process.env.POLYGON_API_KEY),
    finnhub: Boolean(process.env.FINNHUB_API_KEY),
    fmp: Boolean(process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY),
    fred: Boolean(process.env.FRED_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
  return NextResponse.json({ ok: true, data: status, meta: { asOf: new Date().toISOString(), traceId } });
}
