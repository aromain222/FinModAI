import { NextResponse } from 'next/server';
import { clearAllPMRecords } from '@/lib/pm/persistence/store';
import type { PMTableName } from '@/lib/pm/persistence/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TABLES: PMTableName[] = [
  'pm_positions',
  'pm_position_theses',
  'pm_thesis_updates',
  'pm_investment_decisions',
  'pm_alerts',
  'pm_weekly_memos',
];

export async function DELETE(): Promise<NextResponse> {
  await Promise.all(TABLES.map(t => clearAllPMRecords(t)));
  return NextResponse.json({ ok: true });
}
