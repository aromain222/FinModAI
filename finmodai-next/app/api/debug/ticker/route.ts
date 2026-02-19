import { NextResponse } from 'next/server';
import { fetchNormalizedQuote, fetchNormalizedFundamentals, fetchNormalizedComps } from '@/lib/data/normalized';
import { buildRequiredInputs } from '@/lib/models/shared/requiredInputs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get('ticker') || 'AAPL').toUpperCase();

  const quoteResult = await fetchNormalizedQuote(ticker);
  const fundamentalsResult = await fetchNormalizedFundamentals(ticker);
  const compsResult = await fetchNormalizedComps(ticker);

  const missingFields = Array.from(
    new Set([...quoteResult.missingFields, ...fundamentalsResult.missingFields])
  );

  return NextResponse.json({
    ticker,
    quote: quoteResult.quote,
    fundamentals: fundamentalsResult.fundamentals,
    comps: compsResult.comps,
    missingFields,
    requiredInputs: buildRequiredInputs(missingFields, 'Public data unavailable; paste value if known.'),
    warnings: {
      quote: quoteResult.warnings,
      fundamentals: fundamentalsResult.warnings,
      comps: compsResult.warnings,
    },
  });
}
