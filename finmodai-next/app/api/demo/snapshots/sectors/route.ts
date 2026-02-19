import { NextResponse } from 'next/server';
import { getDemoSnapshotsGroupedBySector } from '@/lib/data/providers/demoProvider';

/**
 * GET /api/demo/snapshots/sectors
 * Returns demo companies grouped by sector: count, avg EBITDA margin, top 3 by revenue.
 */
export async function GET() {
  try {
    const grouped = await getDemoSnapshotsGroupedBySector();
    return NextResponse.json({
      sectors: grouped,
      source: 'demo_company_snapshots',
      units: 'USD millions',
    });
  } catch (e) {
    console.warn('[demo/snapshots/sectors]', e);
    return NextResponse.json({
      sectors: [],
      source: 'demo_company_snapshots',
      units: 'USD millions',
      warning: 'Sector data unavailable.',
    });
  }
}
