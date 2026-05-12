import { NextRequest, NextResponse } from 'next/server';
import {
  getIncomeStatements, getCashFlowStatements,
  getKeyMetrics, getFilings, getInsiderTransactions,
} from '@/lib/dexter/client';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');
  const ticker = searchParams.get('ticker')?.toUpperCase();
  const limit  = Math.min(Number(searchParams.get('limit') ?? '4'), 12);

  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  try {
    switch (action) {
      case 'income':
        return NextResponse.json(await getIncomeStatements(ticker, limit));
      case 'cashflow':
        return NextResponse.json(await getCashFlowStatements(ticker, limit));
      case 'metrics':
        return NextResponse.json(await getKeyMetrics(ticker, limit));
      case 'filings': {
        const formType = searchParams.get('form_type') ?? undefined;
        return NextResponse.json(await getFilings(ticker, formType, limit));
      }
      case 'insider':
        return NextResponse.json(await getInsiderTransactions(ticker, limit));
      case 'overview': {
        const [income, cashflow, metrics, filings, insider] = await Promise.allSettled([
          getIncomeStatements(ticker, 4),
          getCashFlowStatements(ticker, 4),
          getKeyMetrics(ticker, 4),
          getFilings(ticker, undefined, 6),
          getInsiderTransactions(ticker, 8),
        ]);
        const errors = [
          ['income', income],
          ['cashflow', cashflow],
          ['metrics', metrics],
          ['filings', filings],
          ['insider', insider],
        ].flatMap(([key, result]) => {
          const settled = result as PromiseSettledResult<unknown>;
          return settled.status === 'rejected'
            ? [{ source: key, error: settled.reason instanceof Error ? settled.reason.message : 'failed' }]
            : [];
        });
        return NextResponse.json({
          income:   income.status   === 'fulfilled' ? income.value   : [],
          cashflow: cashflow.status === 'fulfilled' ? cashflow.value : [],
          metrics:  metrics.status  === 'fulfilled' ? metrics.value  : [],
          filings:  filings.status  === 'fulfilled' ? filings.value  : [],
          insider:  insider.status  === 'fulfilled' ? insider.value  : [],
          errors,
        });
      }
      default:
        return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
