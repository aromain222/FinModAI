'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Loader2, Minus, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RangeKey = '1W' | '1M' | '3M' | '1Y' | 'YTD' | '5Y' | 'MAX';

type CandleApiPoint = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

type CandleApiSuccessResponse = {
  ok: true;
  symbol: string;
  timeframe: RangeKey;
  provider: string;
  source: 'cache' | 'live' | 'none';
  candles: CandleApiPoint[];
};

type CandleApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    symbol?: string;
    timeframe?: RangeKey;
  };
};

interface StockMove {
  ticker: string;
  returnPct: number;
  lastPrice?: number;
}

interface StockSummary {
  ok?: boolean;
  asOf: string;
  rising: StockMove[];
  falling: StockMove[];
  partialData?: { excludedTickers: number };
}

interface SectorItem {
  key: string;
  name: string;
  returnPct: number;
}

interface SectorResponseItem {
  sector: string;
  ticker: string;
  returnPct: number;
}

interface SectorResponse {
  ok?: boolean;
  period: string;
  rising: SectorResponseItem[];
  falling: SectorResponseItem[];
  partialData?: { excludedTickers: number };
}

interface MacroSnapshotResponse {
  asOf: string;
  metrics?: {
    sp500_level?: number;
    sp500_pct?: number;
    vix_level?: number;
    vix_pct?: number;
    tenY_level?: number;
    tenY_change_bps?: number;
    realized_vol_annual?: number;
    risk_regime?: 'low' | 'mixed' | 'high';
  };
  series?: Record<
    string,
    {
      points?: Array<{ date: string; value: number | null }>;
    }
  >;
  sectorBreadth?: {
    rising: SectorItem[];
    falling: SectorItem[];
  };
}

type CandlePoint = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ema21: number | null;
  volume: number | null;
};

const RANGE_OPTIONS: RangeKey[] = ['1W', '1M', '3M', '1Y', 'YTD', '5Y', 'MAX'];

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function compactVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function computeEma(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  if (values.length === 0) return result;

  const k = 2 / (period + 1);
  let emaValue = values[0];
  for (let i = 0; i < values.length; i += 1) {
    emaValue = i === 0 ? values[i] : values[i] * k + emaValue * (1 - k);
    result.push(emaValue);
  }
  return result;
}

function buildCandleData(points: CandleApiPoint[]): CandlePoint[] {
  const now = Date.now();
  const clean = points
    .filter((point) => {
      const numeric = [point.t, point.o, point.h, point.l, point.c].every((v) => Number.isFinite(v));
      if (!numeric) return false;
      if (point.t < 946684800000) return false;
      if (point.t > now + 24 * 60 * 60 * 1000) return false;
      return true;
    })
    .map((point) => ({
      t: point.t,
      open: point.o,
      high: point.h,
      low: point.l,
      close: point.c,
      volume: Number.isFinite(point.v) ? point.v : null,
    }))
    .sort((a, b) => a.t - b.t);

  const closes = clean.map((point) => point.close);
  const ema = computeEma(closes, 21);

  return clean.map((point, idx) => {
    const previousClose = idx > 0 ? closes[idx - 1] : closes[idx];
    const close = point.close;
    const open = point.open ?? previousClose;
    const high = point.high ?? Math.max(open, close);
    const low = point.low ?? Math.min(open, close);

    return {
      t: point.t,
      open,
      high,
      low,
      close,
      ema21: ema[idx],
      volume: point.volume,
    };
  });
}

function ArrowGlyph({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return <Minus className="h-3.5 w-3.5 text-zinc-400" />;
  }
  if (value > 0) return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />;
  return <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />;
}

function TinySparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" />;

  const width = 120;
  const height = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-9);
  const step = width / Math.max(values.length - 1, 1);

  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const trend = values[values.length - 1] - values[0];
  const stroke = trend >= 0 ? '#10b981' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.8} />
    </svg>
  );
}

function MetricTile({
  label,
  value,
  delta,
  spark,
}: {
  label: string;
  value: string;
  delta?: number | null;
  spark?: number[];
}) {
  return (
    <div className="rounded-lg border border-zinc-800/35 bg-zinc-950/35 px-3 py-2.5 transition-colors duration-200 ease-out hover:border-zinc-700/45 hover:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">{label}</div>
        <ArrowGlyph value={delta} />
      </div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">{value}</div>
      {spark && spark.length > 1 && <TinySparkline values={spark} />}
    </div>
  );
}

function CandleChart({
  data,
  loading,
  error,
  emptyNote,
  onRetry,
}: {
  data: CandlePoint[];
  loading: boolean;
  error: string | null;
  emptyNote: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="min-h-[510px] w-full min-w-0 rounded-xl bg-zinc-900/20 p-3">
        <div className="h-full w-full animate-pulse space-y-2">
          <div className="h-3 w-40 rounded bg-gradient-to-r from-zinc-800/35 via-zinc-700/35 to-zinc-800/35" />
          <div className="h-[calc(100%-1.25rem)] rounded bg-gradient-to-r from-zinc-800/30 via-zinc-700/30 to-zinc-800/30" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[510px] w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-zinc-900/20">
        <p className="text-sm text-zinc-300">Data unavailable</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex min-h-[510px] w-full min-w-0 items-center justify-center rounded-xl bg-zinc-900/20 text-sm text-zinc-400">
        {emptyNote || 'No data returned for selected range'}
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="flex min-h-[510px] w-full min-w-0 items-center justify-center rounded-xl bg-zinc-900/20 text-sm text-zinc-400">
        Insufficient data for range
      </div>
    );
  }

  const chartData = data.map((point) => ({
    t: point.t,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    ema21: point.ema21,
    volume: point.volume ?? 0,
  }));

  const maxVolume = Math.max(...chartData.map((point) => point.volume), 1);
  const firstTs = chartData[0]?.t ?? Date.now();
  const lastTs = chartData[chartData.length - 1]?.t ?? Date.now();
  const spanMs = Math.max(lastTs - firstTs, 1);
  const low = Math.min(...chartData.map((point) => point.low));
  const high = Math.max(...chartData.map((point) => point.high));
  const band = Math.max(high - low, 0.25);
  const pad = band * 0.06;
  const yMin = Math.max(0, low - pad);
  const yMax = high + pad;

  const xTickFormatter = (value: number) => {
    const date = new Date(value);
    if (spanMs <= 1000 * 60 * 60 * 24 * 7) {
      return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    }
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  const tooltipLabelFormatter = (value: number) => {
    return new Date(value).toLocaleString();
  };

  const tooltipValueFormatter = (value: number | string, name: string) => {
    if (name === 'volume') {
      return [compactVolume(typeof value === 'number' ? value : Number(value)), 'Volume'];
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    return [formatNumber(numeric, 2), name === 'ema21' ? '21D EMA' : 'Close'];
  };

  return (
    <div className="h-[560px] w-full min-w-0 rounded-xl bg-zinc-900/20 p-2">
      <div className="grid h-full min-h-0 grid-rows-[4fr_1.35fr] gap-2">
        <div className="min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              key={`spy-price-${data[0]?.t ?? 0}-${data[data.length - 1]?.t ?? 0}-${data.length}`}
              data={chartData}
              syncId="spy-market-chart"
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
              <YAxis
                orientation="right"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                stroke="#3f3f46"
                domain={[yMin, yMax]}
                width={56}
                tickCount={6}
                tickFormatter={(value) => formatNumber(typeof value === 'number' ? value : Number(value), 2)}
              />
              <Tooltip
                labelFormatter={tooltipLabelFormatter}
                formatter={(value: number | string, name: string, item: { payload?: { open?: number; high?: number; low?: number; close?: number; volume?: number } }) => {
                  if (name === 'close') {
                    const row = item?.payload;
                    return [
                      `O ${formatNumber(row?.open, 2)}  H ${formatNumber(row?.high, 2)}  L ${formatNumber(row?.low, 2)}  C ${formatNumber(row?.close, 2)}`,
                      'OHLC',
                    ];
                  }
                  return tooltipValueFormatter(value, name);
                }}
                contentStyle={{
                  backgroundColor: 'rgba(24, 24, 27, 0.96)',
                  borderColor: 'rgba(63, 63, 70, 0.9)',
                  borderRadius: '8px',
                  color: '#e4e4e7',
                }}
              />
              <Line
                type="linear"
                dataKey="close"
                stroke="#e4e4e7"
                strokeWidth={2.1}
                dot={chartData.length <= 12 ? { r: 2, strokeWidth: 0, fill: '#e4e4e7' } : false}
                name="close"
              />
              <Line
                type="linear"
                dataKey="ema21"
                stroke="#60a5fa"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                name="ema21"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="min-h-0 border-t border-zinc-800/45 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              syncId="spy-market-chart"
              margin={{ top: 4, right: 12, left: 0, bottom: 10 }}
            >
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={xTickFormatter}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                stroke="#3f3f46"
                minTickGap={42}
              />
              <YAxis
                orientation="right"
                tick={false}
                stroke="#3f3f46"
                domain={[0, Math.ceil(maxVolume * 1.1)]}
                width={0}
              />
              <Tooltip
                labelFormatter={tooltipLabelFormatter}
                formatter={(value: number | string) => {
                  const numeric = typeof value === 'number' ? value : Number(value);
                  return [compactVolume(numeric), 'Volume'];
                }}
                contentStyle={{
                  backgroundColor: 'rgba(24, 24, 27, 0.96)',
                  borderColor: 'rgba(63, 63, 70, 0.9)',
                  borderRadius: '8px',
                  color: '#e4e4e7',
                }}
              />
              <Bar dataKey="volume" fill="#334155" opacity={0.5} barSize={6} name="volume" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function MarketDashboard() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('1M');

  const [performanceData, setPerformanceData] = useState<CandleApiPoint[]>([]);
  const [performanceMeta, setPerformanceMeta] = useState<CandleApiResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceEmptyNote, setPerformanceEmptyNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [stocks, setStocks] = useState<StockSummary | null>(null);
  const [sectors, setSectors] = useState<{ rising: SectorItem[]; falling: SectorItem[] } | null>(null);
  const [partialDataCount, setPartialDataCount] = useState<number>(0);
  const [moversUnavailable, setMoversUnavailable] = useState(false);
  const [sectorsUnavailable, setSectorsUnavailable] = useState(false);
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<MacroSnapshotResponse | null>(null);

  const fetchPerformance = async (range: RangeKey, isRefresh = false) => {
    setPerformanceLoading(true);
    if (isRefresh) setRefreshing(true);
    setPerformanceError(null);
    setPerformanceEmptyNote(null);
    setPerformanceData([]);

    try {
      const res = await fetch(`/api/market/candles?symbol=SPY&timeframe=${range}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch chart data');

      const payload = (await res.json()) as CandleApiSuccessResponse | CandleApiErrorResponse;
      if (!payload.ok) {
        setPerformanceData([]);
        setPerformanceMeta(null);
        setPerformanceEmptyNote(payload.error.message || 'No data returned for selected range');
        return;
      }

      const points = Array.isArray(payload.candles) ? payload.candles : [];
      setPerformanceData(points);
      setPerformanceMeta(payload);
      setPerformanceEmptyNote(points.length === 0 ? 'No data returned for selected range' : null);

      if (process.env.NODE_ENV !== 'production') {
        const first = points[0]?.t ?? null;
        const last = points[points.length - 1]?.t ?? null;
        console.debug('[MarketChart]', {
          points: points.length,
          first,
          last,
          firstTimestamp: first ? new Date(first).toISOString() : null,
          lastTimestamp: last ? new Date(last).toISOString() : null,
          range,
        });
      }
    } catch (error: any) {
      setPerformanceError(error?.message || 'Data unavailable');
      setPerformanceData([]);
      setPerformanceMeta(null);
    } finally {
      setPerformanceLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  const fetchStructure = async (range: RangeKey) => {
    setStructureLoading(true);
    setStructureError(null);
    setStocks(null);
    setSectors(null);
    setPartialDataCount(0);
    setMoversUnavailable(false);
    setSectorsUnavailable(false);
    const macroRange = range;
    const [stocksRes, sectorsRes, snapshotRes] = await Promise.allSettled([
      fetch(`/api/market/movers?tf=${range}`, { cache: 'no-store' }),
      fetch(`/api/market/sectors?tf=${range}`, { cache: 'no-store' }),
      fetch(`/api/macro/snapshot?range=${macroRange}`, { cache: 'no-store' }),
    ]);

    if (stocksRes.status === 'fulfilled' && stocksRes.value.ok) {
      const payload = await stocksRes.value.json();
      const data: StockSummary = payload;
      if (data.ok === false) {
        setStocks(null);
        setMoversUnavailable(true);
      } else {
      setStocks({
        ...data,
        rising: (data.rising ?? []).filter((item) => Number.isFinite(item.returnPct)),
        falling: (data.falling ?? []).filter((item) => Number.isFinite(item.returnPct)),
      });
      setPartialDataCount((current) => current + (data.partialData?.excludedTickers ?? 0));
      }
    } else {
      setStocks(null);
      setMoversUnavailable(true);
    }

    if (sectorsRes.status === 'fulfilled' && sectorsRes.value.ok) {
      const payload = await sectorsRes.value.json();
      const data: SectorResponse = payload;
      if (data.ok === false) {
        setSectors(null);
        setSectorsUnavailable(true);
      } else {
      setSectors({
        rising: (data.rising ?? []).map((item) => ({
          key: item.ticker,
          name: item.sector,
          returnPct: item.returnPct,
        })).filter((item) => Number.isFinite(item.returnPct)),
        falling: (data.falling ?? []).map((item) => ({
          key: item.ticker,
          name: item.sector,
          returnPct: item.returnPct,
        })).filter((item) => Number.isFinite(item.returnPct)),
      });
      setPartialDataCount((current) => current + (data.partialData?.excludedTickers ?? 0));
      }
    } else {
      setSectors(null);
      setSectorsUnavailable(true);
    }

    if (snapshotRes.status === 'fulfilled' && snapshotRes.value.ok) {
      const data: MacroSnapshotResponse = await snapshotRes.value.json();
      setSnapshot(data);
    } else {
      setSnapshot(null);
    }

    if (
      (stocksRes.status !== 'fulfilled' || !stocksRes.value.ok) &&
      (sectorsRes.status !== 'fulfilled' || !sectorsRes.value.ok)
    ) {
      setStructureError('Failed to fetch movers and sectors');
    }

    setStructureLoading(false);
  };

  useEffect(() => {
    fetchPerformance(rangeKey);
    fetchStructure(rangeKey);
  }, [rangeKey]);

  const candleData = useMemo(() => buildCandleData(performanceData), [performanceData]);

  const latest = candleData[candleData.length - 1] ?? null;
  const windowStartPoint = candleData[0] ?? null;
  const priceNow = latest?.close ?? null;
  const priceStart = windowStartPoint ? (windowStartPoint.open ?? windowStartPoint.close) : null;
  const priceDelta =
    priceNow !== null && priceStart !== null
      ? priceNow - priceStart
      : null;
  const pctDelta =
    priceNow !== null && priceStart !== null && priceStart !== 0
      ? (priceDelta! / priceStart) * 100
      : null;
  const up = priceDelta !== null ? priceDelta >= 0 : null;

  const rangeLow =
    candleData.length > 0
      ? candleData.reduce<number>(
          (min, point) => (point.low < min ? point.low : min),
          candleData[0].low
        )
      : null;
  const rangeHigh =
    candleData.length > 0
      ? candleData.reduce<number>(
          (max, point) => (point.high > max ? point.high : max),
          candleData[0].high
        )
      : null;
  const volumeTotal = candleData.reduce((sum, point) => sum + (point.volume ?? 0), 0);
  const volumeForDisplay = candleData.length === 0 ? null : volumeTotal;

  const tape = useMemo(() => {
    const rising = stocks?.rising ?? [];
    const falling = stocks?.falling ?? [];
    return [...rising, ...falling].sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct));
  }, [stocks]);

  const breadth = useMemo(() => {
    const risingCount = sectors?.rising?.length ?? 0;
    const fallingCount = sectors?.falling?.length ?? 0;
    const advDecl = fallingCount > 0 ? risingCount / fallingCount : risingCount > 0 ? Number.POSITIVE_INFINITY : null;

    const sp500Series = snapshot?.series?.sp500?.points?.filter((p) => Number.isFinite(p.value)) ?? [];
    const spValues = sp500Series.map((p) => p.value as number);
    const latestSp = spValues[spValues.length - 1];
    const ma50 = spValues.length >= 50 ? spValues.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    const ma200 = spValues.length >= 200 ? spValues.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;

    return {
      advDecl,
      pctAbove50: latestSp && ma50 ? (latestSp > ma50 ? 100 : 0) : null,
      pctAbove200: latestSp && ma200 ? (latestSp > ma200 ? 100 : 0) : null,
      breadthPct: risingCount + fallingCount > 0 ? (risingCount / (risingCount + fallingCount)) * 100 : null,
    };
  }, [sectors, snapshot]);

  const spSpark = useMemo(() => {
    const values = (snapshot?.series?.sp500?.points ?? [])
      .map((p) => p.value)
      .filter((v): v is number => Number.isFinite(v));
    return values.slice(-24);
  }, [snapshot]);

  const vixSpark = useMemo(() => {
    const values = (snapshot?.series?.vix?.points ?? [])
      .map((p) => p.value)
      .filter((v): v is number => Number.isFinite(v));
    return values.slice(-24);
  }, [snapshot]);

  const tenYSpark = useMemo(() => {
    const values = (snapshot?.series?.treasury10y?.points ?? [])
      .map((p) => p.value)
      .filter((v): v is number => Number.isFinite(v));
    return values.slice(-24);
  }, [snapshot]);

  const dxySpark = useMemo(() => {
    const values = (snapshot?.series?.dxy?.points ?? [])
      .map((p) => p.value)
      .filter((v): v is number => Number.isFinite(v));
    return values.slice(-24);
  }, [snapshot]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    console.debug('[MarketRangeMetrics]', {
      rangeKey,
      candlesLength: candleData.length,
      startPrice: priceStart,
      endPrice: priceNow,
      changePct: pctDelta,
    });
  }, [rangeKey, candleData.length, priceStart, priceNow, pctDelta]);

  return (
    <div className="h-[calc(100vh-72px)] w-full overflow-y-auto overflow-x-hidden bg-zinc-950">
      <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-y-8 px-6 py-6">
        <div className="text-right text-[11px] text-zinc-400">
          As of {new Date(snapshot?.asOf || performanceMeta?.candles?.[performanceMeta.candles.length - 1]?.t || Date.now()).toLocaleString()}
        </div>
        <section className="h-[132px] overflow-hidden rounded-2xl border border-zinc-800/40 bg-zinc-900/25 transition-colors duration-200 ease-out">
          <div className="grid h-full grid-cols-1 divide-y divide-zinc-800/35 md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Market Breadth</div>
              <div className="grid grid-cols-2 gap-4 text-xs leading-relaxed">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Adv / Decl</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
                    {Number.isFinite(breadth.advDecl) ? (breadth.advDecl as number).toFixed(2) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">% Above 50DMA</div>
                  <div className="mt-2 text-lg font-semibold text-zinc-50">{formatPct(breadth.pctAbove50)}</div>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Top Movers</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Gainers</div>
                  {!structureLoading && moversUnavailable && (
                    <div className="text-[11px] text-zinc-400">Temporarily unavailable</div>
                  )}
                  {!structureLoading && (stocks?.rising ?? []).slice(0, 3).map((stock) => (
                    <div key={`g-${stock.ticker}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                      <span className="text-zinc-100">{stock.ticker}</span>
                      <span className="font-medium text-emerald-400">+{stock.returnPct.toFixed(2)}%</span>
                    </div>
                  ))}
                  {structureLoading && <div className="h-8 animate-pulse rounded bg-zinc-800/30" />}
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Losers</div>
                  {!structureLoading && moversUnavailable && (
                    <div className="text-[11px] text-zinc-400">Temporarily unavailable</div>
                  )}
                  {!structureLoading && (stocks?.falling ?? []).slice(0, 3).map((stock) => (
                    <div key={`l-${stock.ticker}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                      <span className="text-zinc-100">{stock.ticker}</span>
                      <span className="font-medium text-rose-400">{stock.returnPct.toFixed(2)}%</span>
                    </div>
                  ))}
                  {structureLoading && <div className="h-8 animate-pulse rounded bg-zinc-800/30" />}
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Sector Performance</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Rising</div>
                {!structureLoading && sectorsUnavailable && (
                  <div className="text-[11px] text-zinc-400">Temporarily unavailable</div>
                )}
                {!structureLoading && (sectors?.rising ?? []).slice(0, 3).map((sector) => (
                  <div key={`sr-${sector.key}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                    <span className="truncate text-zinc-100">{sector.name}</span>
                    <span className="font-medium text-emerald-400">+{sector.returnPct.toFixed(2)}%</span>
                  </div>
                ))}
                {structureLoading && <div className="h-8 animate-pulse rounded bg-zinc-800/30" />}
              </div>
              <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Falling</div>
                {!structureLoading && sectorsUnavailable && (
                  <div className="text-[11px] text-zinc-400">Temporarily unavailable</div>
                )}
                {!structureLoading && (sectors?.falling ?? []).slice(0, 3).map((sector) => (
                  <div key={`sf-${sector.key}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                    <span className="truncate text-zinc-100">{sector.name}</span>
                    <span className="font-medium text-rose-400">{sector.returnPct.toFixed(2)}%</span>
                  </div>
                ))}
                {structureLoading && <div className="h-8 animate-pulse rounded bg-zinc-800/30" />}
                </div>
              </div>
            </div>
          </div>
          {structureError && (
            <div className="border-t border-zinc-800/35 px-5 py-2 text-xs text-rose-300">{structureError}</div>
          )}
          {!structureError && partialDataCount > 0 && (
            <div className="border-t border-zinc-800/35 px-5 py-2 text-xs text-zinc-400">
              <span className="rounded-full border border-zinc-700/50 px-2 py-0.5">partial data</span>{' '}
              {partialDataCount} tickers excluded due to missing candles
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[40%_60%]">
          <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 px-5 py-5 transition-colors duration-200 ease-out">
            <div className="text-sm font-semibold text-zinc-200">S&P 500 (SPY)</div>
            <div className="mt-2 text-[4.9rem] font-semibold tracking-tight text-zinc-50">{formatNumber(priceNow, 2)}</div>
            <div className={cn('mt-2 text-lg font-medium', up === null ? 'text-zinc-300' : up ? 'text-emerald-400' : 'text-rose-400')}>
              {formatNumber(priceDelta, 2)} ({formatPct(pctDelta)})
            </div>

            <div className="mt-4 space-y-2 text-xs text-zinc-300">
              <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Session Range</span>
                <span>{rangeLow !== null && rangeHigh !== null ? `${formatNumber(rangeLow, 2)} - ${formatNumber(rangeHigh, 2)}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Volume</span>
                <span>{compactVolume(volumeForDisplay)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">21D EMA</span>
                <span>{formatNumber(latest?.ema21, 2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">EMA Indicator</span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  latest?.ema21 != null && latest.close >= latest.ema21 ? 'text-emerald-400' : 'text-rose-400'
                )}>
                  {latest?.ema21 != null ? (latest.close >= latest.ema21 ? 'Above EMA' : 'Below EMA') : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="min-h-0 rounded-2xl border border-zinc-800/40 bg-zinc-900/30 px-3 pt-3 pb-3 transition-colors duration-200 ease-out">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">
                <span>S&P 500 (proxy: SPY)</span>
                <span className="normal-case tracking-normal text-zinc-500">
                  {performanceMeta ? performanceMeta.provider : ''}
                </span>
                {performanceMeta?.source && performanceMeta.source !== 'none' && (
                  <span className="rounded-full border border-zinc-700/50 bg-zinc-800/40 px-2 py-0.5 text-[10px] tracking-normal text-zinc-300">
                    {performanceMeta.source === 'cache' ? 'Cached' : 'Live'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {RANGE_OPTIONS.map((range) => (
                  <Button
                    key={range}
                    size="sm"
                    variant={rangeKey === range ? 'default' : 'outline'}
                    className={cn(
                      'h-7 px-2 text-xs transition-colors duration-200 ease-out',
                      rangeKey === range
                        ? 'border-zinc-600/60 bg-zinc-200/10 text-zinc-100 shadow-[0_0_0_1px_rgba(244,244,245,0.14),0_0_16px_rgba(161,161,170,0.14)]'
                        : 'border-zinc-700/50 bg-transparent text-zinc-300 hover:bg-zinc-800/35 hover:text-zinc-100'
                    )}
                    onClick={() => setRangeKey(range)}
                  >
                    {range}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 transition-colors duration-200 ease-out"
                  onClick={() => void fetchPerformance(rangeKey, true)}
                  disabled={refreshing}
                  aria-busy={refreshing}
                >
                  {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <CandleChart
              key={`SPY-${rangeKey}`}
              data={candleData}
              loading={performanceLoading}
              error={performanceError}
              emptyNote={performanceEmptyNote}
              onRetry={() => void fetchPerformance(rangeKey, true)}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800/35 bg-zinc-900/25 p-4 transition-colors duration-200 ease-out hover:border-zinc-700/45 hover:bg-white/[0.02]">
            <div className="mb-3 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Breadth Metrics</div>
            <div className="space-y-3">
              <MetricTile label="% Above 200DMA" value={formatPct(breadth.pctAbove200)} delta={breadth.pctAbove200} spark={spSpark} />
              <MetricTile label="Breadth Participation" value={formatPct(breadth.breadthPct)} delta={breadth.breadthPct} />
              <MetricTile label="SPX Trend" value={formatPct(snapshot?.metrics?.sp500_pct)} delta={snapshot?.metrics?.sp500_pct ?? null} />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800/35 bg-zinc-900/25 p-4 transition-colors duration-200 ease-out hover:border-zinc-700/45 hover:bg-white/[0.02]">
            <div className="mb-3 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Volatility Metrics</div>
            <div className="space-y-3">
              <MetricTile label="VIX" value={formatNumber(snapshot?.metrics?.vix_level, 1)} delta={snapshot?.metrics?.vix_pct ?? null} spark={vixSpark} />
              <MetricTile label="Realized Vol (Ann.)" value={`${formatNumber(snapshot?.metrics?.realized_vol_annual, 1)}%`} delta={snapshot?.metrics?.realized_vol_annual ?? null} />
              <MetricTile label="Risk Regime" value={(snapshot?.metrics?.risk_regime || '—').toUpperCase()} />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800/35 bg-zinc-900/25 p-4 transition-colors duration-200 ease-out hover:border-zinc-700/45 hover:bg-white/[0.02]">
            <div className="mb-3 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Rates & FX</div>
            <div className="space-y-3">
              <MetricTile label="10Y Yield" value={`${formatNumber(snapshot?.metrics?.tenY_level, 2)}%`} delta={snapshot?.metrics?.tenY_change_bps ?? null} spark={tenYSpark} />
              <MetricTile
                label="DXY"
                value={formatNumber(
                  [...(snapshot?.series?.dxy?.points ?? [])]
                    .reverse()
                    .find((point) => Number.isFinite(point.value))?.value,
                  2
                )}
                spark={dxySpark}
              />
              <MetricTile label="10Y Change (bps)" value={formatNumber(snapshot?.metrics?.tenY_change_bps, 0)} delta={snapshot?.metrics?.tenY_change_bps ?? null} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
