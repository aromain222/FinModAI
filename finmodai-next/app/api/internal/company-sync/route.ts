import { NextRequest, NextResponse } from 'next/server';
import { syncCompanyFromFmp } from '@/lib/integrations/fmp/syncCompany';
import { syncIdentifiersFromOpenFigi } from '@/lib/integrations/openfigi/syncIdentifiers';
import { syncPricesFromPolygon } from '@/lib/integrations/polygon/syncPrices';
import { syncCompanyFactsFromSec } from '@/lib/integrations/sec/syncCompanyFacts';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const ticker = typeof body?.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    const fmp = await syncCompanyFromFmp(ticker);
    const [openfigi, polygon, sec] = await Promise.all([
      syncIdentifiersFromOpenFigi(ticker).catch((error) => ({ ticker, companyId: fmp.companyId, compositeFigi: null, shareClassFigi: null, warnings: [error instanceof Error ? error.message : 'OpenFIGI sync failed'] })),
      syncPricesFromPolygon(ticker).catch((error) => ({ ticker, companyId: fmp.companyId, rowsUpserted: 0, latestDate: null, warnings: [error instanceof Error ? error.message : 'Polygon sync failed'] })),
      syncCompanyFactsFromSec(ticker).catch((error) => ({ ticker, companyId: fmp.companyId, cik: null, snapshotDate: null, warnings: [error instanceof Error ? error.message : 'SEC sync failed'] })),
    ]);

    const resolved = await resolveCompanyProfile({ ticker });

    return NextResponse.json({
      ticker,
      steps: { fmp, openfigi, polygon, sec },
      resolved,
      warnings: [...fmp.warnings, ...openfigi.warnings, ...polygon.warnings, ...sec.warnings],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Company sync failed' },
      { status: 500 }
    );
  }
}
