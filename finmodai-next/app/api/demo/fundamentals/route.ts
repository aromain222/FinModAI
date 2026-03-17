import { NextRequest, NextResponse } from 'next/server';
import { getDemoFundamentals, getDemoQuote } from '@/lib/data/providers/demoProvider';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickerRaw = searchParams.get('ticker') || '';
    const ticker = tickerRaw.trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const [fundamentals, quote] = await Promise.all([
      getDemoFundamentals(ticker),
      getDemoQuote(ticker),
    ]);
    if (!fundamentals) {
      return NextResponse.json({ error: 'Demo company not found' }, { status: 400 });
    }

    const enterpriseValue =
      quote?.marketCap != null && fundamentals.totalDebt != null && fundamentals.cash != null
        ? quote.marketCap + fundamentals.totalDebt - fundamentals.cash
        : null;

    return NextResponse.json(
      {
        ticker: fundamentals.ticker,
        companyName: fundamentals.companyName,
        sector: fundamentals.sector,
        currency: fundamentals.currency,
        units: fundamentals.units,
        revenueLTM: fundamentals.revenueLTM,
        ebitdaLTM: fundamentals.ebitdaLTM,
        netIncomeLTM: fundamentals.netIncomeLTM,
        cash: fundamentals.cash,
        totalDebt: fundamentals.totalDebt,
        sharesOutstanding: fundamentals.sharesOutstanding,
        sharePrice: quote?.price ?? null,
        marketCap: quote?.marketCap ?? null,
        enterpriseValue,
        source: fundamentals.source,
        provenance: fundamentals.provenance ?? {},
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch demo fundamentals';
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
