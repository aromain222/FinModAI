import { NextResponse } from 'next/server';
import { readLedgerHoldings, type LedgerHolding } from '@/lib/integrations/ledger/holdings';
import { savePosition, listPositions } from '@/lib/pm/portfolio/positionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function deterministicId(securityId: string): string {
  return `ledger:${securityId}`;
}

function totalNotional(holdings: LedgerHolding[]): number {
  return holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
}

type SyncOutcome = {
  ticker: string;
  status: 'upserted' | 'skipped' | 'error';
  reason?: string;
};

export async function POST() {
  const read = await readLedgerHoldings();

  if (!read.ok) {
    const httpStatus = read.reason === 'db_missing' ? 404 : read.reason === 'sqlite_unavailable' ? 503 : 500;
    return NextResponse.json(
      { success: false, reason: read.reason, detail: read.detail },
      { status: httpStatus },
    );
  }

  const existing = await listPositions({ limit: 500 });
  const existingById = new Map(existing.map((p) => [p.id, p]));

  const notional = totalNotional(read.holdings);
  const results: SyncOutcome[] = [];

  for (const h of read.holdings) {
    try {
      const id = deterministicId(h.securityId);
      const prior = existingById.get(id);
      const currentAllocation = notional > 0 && h.marketValue != null
        ? Number(((h.marketValue / notional) * 100).toFixed(2))
        : null;

      await savePosition({
        id,
        ticker: h.ticker,
        companyName: h.name,
        shares: h.quantity,
        notionalExposure: h.marketValue,
        costBasis: h.costBasis,
        currentPrice: h.currentPrice,
        currentAllocation,
        status: prior?.status ?? 'active',
        portfolioRole: prior?.portfolioRole ?? null,
        portfolioTheme: prior?.portfolioTheme ?? null,
        timeHorizon: prior?.timeHorizon ?? null,
        targetAllocation: prior?.targetAllocation ?? null,
        pmNotes: prior?.pmNotes,
        createdAt: prior?.createdAt,
        updatedAt: new Date().toISOString(),
      });

      results.push({ ticker: h.ticker, status: 'upserted' });
    } catch (err) {
      results.push({
        ticker: h.ticker,
        status: 'error',
        reason: (err as Error).message,
      });
    }
  }

  const synced = results.filter((r) => r.status === 'upserted').length;
  const errors = results.filter((r) => r.status === 'error');

  return NextResponse.json({
    success: errors.length === 0,
    synced,
    errorCount: errors.length,
    notionalUSD: notional,
    source: read.source,
    results,
  });
}

export async function GET() {
  const read = await readLedgerHoldings();
  if (!read.ok) {
    const httpStatus = read.reason === 'db_missing' ? 404 : read.reason === 'sqlite_unavailable' ? 503 : 500;
    return NextResponse.json({ success: false, ...read }, { status: httpStatus });
  }
  return NextResponse.json({
    success: true,
    count: read.holdings.length,
    notionalUSD: totalNotional(read.holdings),
    holdings: read.holdings,
    source: read.source,
  });
}
