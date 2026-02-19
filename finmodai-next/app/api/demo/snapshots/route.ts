import { NextRequest, NextResponse } from 'next/server';
import {
  getDemoSnapshotsTopByRevenue,
  getDemoSnapshotsBySector,
} from '@/lib/data/providers/demoProvider';

/**
 * GET /api/demo/snapshots
 * Query: top=20 (default) for Market Brief landing, or sector=Technology for Comps/sector view.
 * Returns demo companies from public.demo_company_snapshots. Never empty array without reason.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');
    const top = Math.min(100, Math.max(1, parseInt(searchParams.get('top') || '20', 10) || 20));

    const rows = sector
      ? await getDemoSnapshotsBySector(sector)
      : await getDemoSnapshotsTopByRevenue(top);

    return NextResponse.json({
      companies: rows,
      source: 'demo_company_snapshots',
      units: 'USD millions',
    });
  } catch (e) {
    console.warn('[demo/snapshots]', e);
    return NextResponse.json({
      companies: [],
      source: 'demo_company_snapshots',
      units: 'USD millions',
      warning: 'Demo snapshot data unavailable.',
    });
  }
}
