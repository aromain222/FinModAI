import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === 'string' ? body.prompt : undefined;
    const ticker = typeof body?.ticker === 'string' ? body.ticker : undefined;
    const companyName = typeof body?.companyName === 'string' ? body.companyName : undefined;

    const result = await resolveCompanyProfile({ prompt, ticker, companyName });
    return NextResponse.json({ resolved: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Company resolve failed' },
      { status: 500 }
    );
  }
}
