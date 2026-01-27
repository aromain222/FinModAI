import 'server-only';

import { getSeries } from "@/lib/dataSources/orchestrator";

type Range = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

type SnapshotPoint = {
  symbol: string;
  last: number | null;
  changePct: number | null;
  asOf: string | null;
  source: string;
  failures: { source: string; status?: number; message?: string }[];
};

type SnapshotResult = {
  range: Range;
  asOf: string | null;
  indices: { SPY: SnapshotPoint; QQQ: SnapshotPoint; DIA: SnapshotPoint };
  rates: { twoY: SnapshotPoint; tenY: SnapshotPoint };
  vol: { VIX: SnapshotPoint };
  movers?: Record<string, SnapshotPoint>;
  unavailable?: boolean;
  reason?: string;
};

const RANGE_DEFAULT: Range = "1M";
const VALID_RANGES: Range[] = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

const hasDatabento = Boolean(process.env.DATABENTO_API_KEY);

async function fetchSeries(symbol: string, kind: string, range: Range): Promise<SnapshotPoint> {
  // If Databento is not configured, return unavailable to avoid demo data.
  if (!hasDatabento) {
    return {
      symbol,
      last: null,
      changePct: null,
      asOf: null,
      source: "unavailable",
      failures: [{ source: "databento", message: "Databento not configured" }],
    };
  }

  const res = await getSeries({ kind, symbol, range });
  const data = Array.isArray(res.data) ? res.data : [];
  const last = data.at(-1);
  const first = data.at(0);

  const changePct =
    last && first && first.v
      ? ((Number(last.v) - Number(first.v)) / Number(first.v)) * 100
      : null;

  const sourceUsed = res.meta?.sourceUsed ?? "unknown";
  const isFallback = sourceUsed === "fallback";

  return {
    symbol,
    last: last ? Number(last.v) : null,
    changePct: isFallback ? null : changePct,
    asOf: last ? new Date(last.t).toISOString() : null,
    source: sourceUsed,
    failures: res.meta?.failures ?? [],
  };
}

export async function getMarketSnapshot(rangeInput?: string): Promise<{ ok: boolean; data?: SnapshotResult; error?: string }> {
  const range = (VALID_RANGES.includes(rangeInput as Range) ? rangeInput : RANGE_DEFAULT) as Range;

  const results = await Promise.all([
    fetchSeries("SPY", "INDEX_PRICE", range),
    fetchSeries("QQQ", "INDEX_PRICE", range),
    fetchSeries("DIA", "INDEX_PRICE", range),
    fetchSeries("VIX", "INDEX_PRICE", range),
    fetchSeries("DGS2", "RATE", range), // 2Y treasury (FRED code)
    fetchSeries("DGS10", "RATE", range), // 10Y treasury (FRED code)
  ]);

  const [spy, qqq, dia, vix, twoY, tenY] = results;

  const fallbackUsed = [spy, qqq, dia, vix, twoY, tenY].some((p) => p.source === "fallback");
  const unavailable = !hasDatabento || [spy, qqq, dia].some((p) => p.source === "unavailable") || fallbackUsed;
  if (unavailable) {
    return {
      ok: true,
      data: {
        range,
        asOf: null,
        indices: { SPY: spy, QQQ: qqq, DIA: dia },
        rates: { twoY, tenY },
        vol: { VIX: vix },
        unavailable: true,
        reason: !hasDatabento
          ? "Databento not configured; live market data unavailable."
          : "Live market data unavailable; fallback sources rejected to avoid demo data.",
      },
    };
  }

  const timestamps = [spy.asOf, qqq.asOf, dia.asOf, vix.asOf, twoY.asOf, tenY.asOf]
    .filter(Boolean)
    .map((ts) => new Date(ts as string).getTime());
  const asOf =
    timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  return {
    ok: true,
    data: {
      range,
      asOf,
      indices: { SPY: spy, QQQ: qqq, DIA: dia },
      rates: { twoY, tenY },
      vol: { VIX: vix },
    },
  };
}
