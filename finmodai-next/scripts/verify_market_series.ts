import { fetchDailySeries, assessDailySeriesQuality } from '../lib/marketData/fetchDailySeries';

type RangeCheck = { label: string; days: number; points: number };

const RANGES: RangeCheck[] = [
  { label: '1W', days: 7, points: 7 },
  { label: '1M', days: 30, points: 30 },
  { label: '3M', days: 90, points: 90 },
  { label: '1Y', days: 365, points: 252 },
];

async function verifySymbol(symbol: string) {
  for (const range of RANGES) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - range.days);
    const result = await fetchDailySeries({
      symbol,
      rangePoints: range.points,
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });

    const quality = assessDailySeriesQuality(
      result.points,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );

    const last = result.points[result.points.length - 1]?.close ?? null;
    console.log(`[verify] ${symbol} ${range.label}`, {
      provider: result.provider,
      points: result.points.length,
      repeatedValuePct: Number((quality.repeatedValuePct * 100).toFixed(1)),
      maxGapDays: quality.maxGapDays,
      lastClose: last,
      warnings: result.warnings.slice(0, 2),
    });

    if (result.points.length < 5 || quality.repeatedValuePct > 0.8) {
      console.error(`[verify] ${symbol} ${range.label} FAILED quality check`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  await verifySymbol('SPY');
  await verifySymbol('VIX');
}

main().catch((err) => {
  console.error('[verify] failed', err);
  process.exitCode = 1;
});
