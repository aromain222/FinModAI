import { NextRequest, NextResponse } from 'next/server';
import { fetchRecentFilings } from '@/lib/secApi';

export const dynamic = 'force-dynamic';

function parseForms(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const forms = value
    .split(',')
    .map((form) => form.trim().toUpperCase())
    .filter(Boolean);
  return forms.length > 0 ? forms : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = (searchParams.get('ticker') ?? '').trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const limitRaw = Number(searchParams.get('limit') ?? '10');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;
    const asOfDate = searchParams.get('asOfDate') ?? undefined;
    const forms = parseForms(searchParams.get('forms'));

    const result = await fetchRecentFilings({
      ticker,
      limit,
      asOfDate,
      forms,
    });

    if (!result) {
      return NextResponse.json({ error: `Unable to resolve SEC filings for ${ticker}` }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        ticker: result.company.ticker,
        cik: result.company.cik,
        companyName: result.company.companyName,
        formsQueried: result.formsQueried,
        asOfDate: result.asOfDate,
        source: result.source,
        filings: result.filings,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch SEC filings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
