import { NextRequest, NextResponse } from 'next/server';
import { getSectorPerformance, type SectorPerf } from '@/lib/providers/fmp';
import {
  getCached,
  setCache,
  cacheKey,
  isFresh,
  CACHE_TTL,
  type Freshness,
} from '@/lib/market/snapshotCache';

export const dynamic = 'force-dynamic';

type SectorRow = {
  sector: string;
  ticker: string;
  returnPct: number;
};

type CachedSectors = { rising: SectorRow[]; falling: SectorRow[] };

type SectorsSuccess = {
  ok: true;
  provider: string;
  freshness: Freshness;
  asOf: string;
  reason?: string;
  period: string;
  rising: SectorRow[];
  falling: SectorRow[];
};

type SectorsError = {
  ok: false;
  error: { code: string; message: string };
};

function toResponse(payload: SectorsSuccess | SectorsError, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
  });
}

function perfToRows(perfs: SectorPerf[]): CachedSectors {
  const rows: SectorRow[] = perfs.map((s) => ({
    sector: s.sector,
    ticker: s.symbol,
    returnPct: s.changesPercentage,
  }));

  return {
    rising: rows
      .filter((r) => r.returnPct > 0)
      .sort((a, b) => b.returnPct - a.returnPct),
    falling: rows
      .filter((r) => r.returnPct < 0)
      .sort((a, b) => a.returnPct - b.returnPct),
  };
}

export async function GET(req: NextRequest) {
  const period =
    req.nextUrl.searchParams.get('tf') ||
    req.nextUrl.searchParams.get('range') ||
    '1D';

  const key = cacheKey('fmp', 'sectors', 'proxy_performance');
  const cached = getCached<CachedSectors>(key);

  if (cached && isFresh(key)) {
    return toResponse({
      ok: true,
      provider: 'fmp',
      freshness: 'fresh',
      asOf: cached.asOf,
      period,
      ...cached.data,
    });
  }

  const result = await getSectorPerformance();

  if (result.ok) {
    const sectors = perfToRows(result.data);
    setCache(key, sectors, CACHE_TTL.SECTORS);
    return toResponse({
      ok: true,
      provider: 'fmp',
      freshness: 'fresh',
      asOf: new Date().toISOString(),
      period,
      ...sectors,
    });
  }

  if (cached) {
    return toResponse({
      ok: true,
      provider: 'fmp',
      freshness: 'stale',
      asOf: cached.asOf,
      reason: 'rate_limit',
      period,
      ...cached.data,
    });
  }

  return toResponse({
    ok: false,
    error: { code: 'LIVE_UNAVAILABLE', message: 'Live sector data temporarily unavailable' },
  });
}
