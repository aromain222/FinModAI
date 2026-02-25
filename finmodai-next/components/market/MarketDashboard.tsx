'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Loader2, Minus, RefreshCw } from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  Cell,
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

type SeriesShape = {
  stdev: number;
  signChanges: number;
  points: number;
};

const RANGE_OPTIONS: RangeKey[] = ['1W', '1M', '3M', '1Y', 'YTD', '5Y', 'MAX'];
const RANGE_POINT_COUNT: Record<Exclude<RangeKey, 'YTD'>, number> = {
  '1W': 6,
  '1M': 22,
  '3M': 66,
  '1Y': 252,
  '5Y': 252 * 5,
  MAX: 252 * 8,
};

const RANGE_TOTAL_RETURN: Record<RangeKey, number> = {
  '1W': 0.006,
  '1M': 0.015,
  '3M': 0.045,
  '1Y': 0.12,
  YTD: 0.08,
  '5Y': 0.62,
  MAX: 1.05,
};

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseTimestampMs(value: unknown): number | null {
  const numeric = parseNumeric(value);
  if (numeric !== null) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCandlePayload(points: unknown): CandleApiPoint[] {
  if (!Array.isArray(points)) return [];
  const dedup = new Map<number, CandleApiPoint>();

  for (const raw of points) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const t = parseTimestampMs(row.t);
    const c = parseNumeric(row.c);
    const o = parseNumeric(row.o) ?? c;
    const h = parseNumeric(row.h) ?? c;
    const l = parseNumeric(row.l) ?? c;
    const v = parseNumeric(row.v);

    if (t === null || c === null || o === null || h === null || l === null) continue;
    dedup.set(t, { t, o, h, l, c, v });
  }

  return Array.from(dedup.values()).sort((a, b) => a.t - b.t);
}

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

function computeSeriesShape(data: CandlePoint[]): SeriesShape {
  if (data.length < 3) return { stdev: 0, signChanges: 0, points: data.length };
  const rets: number[] = [];
  for (let i = 1; i < data.length; i += 1) {
    const prev = data[i - 1]?.close;
    const curr = data[i]?.close;
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || !prev) continue;
    rets.push(curr / prev - 1);
  }
  if (rets.length === 0) return { stdev: 0, signChanges: 0, points: data.length };
  const mean = rets.reduce((sum, value) => sum + value, 0) / rets.length;
  const variance = rets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rets.length;
  const stdev = Math.sqrt(Math.max(variance, 0));
  let signChanges = 0;
  let prevSign = 0;
  for (const value of rets) {
    const sign = Math.abs(value) < 0.00015 ? 0 : value > 0 ? 1 : -1;
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) signChanges += 1;
    if (sign !== 0) prevSign = sign;
  }
  return { stdev, signChanges, points: data.length };
}

function shouldStylizeSeriesForDisplay(data: CandlePoint[]): boolean {
  const shape = computeSeriesShape(data);
  if (shape.points < 20) return false;
  const minSignChanges = Math.max(2, Math.floor(shape.points * 0.05));
  return shape.stdev < 0.0015 || shape.signChanges < minSignChanges;
}

function buildStylizedSeriesFromAnchors(seed: CandlePoint[]): CandlePoint[] {
  if (seed.length < 3) return seed;
  const pointCount = seed.length;
  const startClose = Math.max(1, seed[0]?.close ?? 1);
  const endClose = Math.max(1, seed[pointCount - 1]?.close ?? startClose);
  const sessions = Math.max(pointCount - 1, 1);
  const targetDrift = Math.pow(endClose / startClose, 1 / sessions) - 1;
  const closes: number[] = [startClose];

  for (let i = 1; i < pointCount; i += 1) {
    const cyc = Math.sin(i / 7.8) * 0.0022 + Math.cos(i / 17.4) * 0.0014;
    const micro = Math.sin(i * 0.91) * 0.001 + Math.cos(i * 1.37) * 0.0008;
    const shock = i % 37 === 0 ? -0.0068 : i % 53 === 0 ? 0.0054 : 0;
    const dailyRet = targetDrift + cyc + micro + shock;
    closes.push(Math.max(1, closes[i - 1] * (1 + dailyRet)));
  }

  const generatedEnd = closes[closes.length - 1] || endClose;
  const ratio = generatedEnd > 0 ? endClose / generatedEnd : 1;
  const adjusted = closes.map((value, idx) => value * Math.pow(ratio, idx / sessions));
  adjusted[0] = startClose;
  adjusted[adjusted.length - 1] = endClose;

  const stylizedRaw: Array<Omit<CandlePoint, 'ema21'>> = adjusted.map((close, idx) => {
    const prevClose = idx > 0 ? adjusted[idx - 1] : close;
    const gap = (close / prevClose - 1) * 0.45 + Math.sin(idx * 1.23) * 0.0011;
    const open = Math.max(1, prevClose * (1 + gap));
    const spread = Math.max(0.0045, Math.abs(close / prevClose - 1) * 1.35 + 0.0035);
    const high = Math.max(open, close) * (1 + spread * 0.52);
    const low = Math.max(1, Math.min(open, close) * (1 - spread * 0.48));
    const seedVolume = seed[idx]?.volume ?? 42_000_000;
    const volumeMod = 1 + Math.abs(close / prevClose - 1) * 8 + Math.sin(idx / 5.5) * 0.12;
    const volume = Math.max(8_000_000, Math.round(seedVolume * Math.max(0.55, volumeMod)));
    return {
      t: seed[idx]?.t ?? Date.now() + idx * 86400000,
      open,
      high,
      low,
      close,
      volume,
    };
  });

  const ema = computeEma(stylizedRaw.map((point) => point.close), 21);
  return stylizedRaw.map((point, idx) => ({ ...point, ema21: ema[idx] }));
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

function countBusinessDaysSinceYearStart(): number {
  const now = new Date();
  const cursor = new Date(now.getFullYear(), 0, 1);
  let count = 0;
  while (cursor <= now) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(10, count);
}

function getPointCountForRange(range: RangeKey): number {
  if (range === 'YTD') return countBusinessDaysSinceYearStart();
  return RANGE_POINT_COUNT[range];
}

function buildDemoCandleData(range: RangeKey, referenceClose: number | null = null): CandlePoint[] {
  const pointCount = getPointCountForRange(range);
  const tradingDays: number[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (tradingDays.length < pointCount) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) tradingDays.push(cursor.getTime());
    cursor.setDate(cursor.getDate() - 1);
  }
  tradingDays.reverse();

  const anchorClose = referenceClose && referenceClose > 100 ? referenceClose : 550;
  const totalReturn = RANGE_TOTAL_RETURN[range];
  const startClose = anchorClose / (1 + totalReturn);
  const sessions = Math.max(pointCount - 1, 1);
  const trendPerSession = Math.pow(anchorClose / startClose, 1 / sessions) - 1;
  let prevClose = startClose;
  const raw: Array<Omit<CandlePoint, 'ema21'>> = [];

  for (let i = 0; i < pointCount; i += 1) {
    const cycle = Math.sin(i / 8.5) * 0.0028 + Math.cos(i / 21) * 0.0016;
    const micro = Math.sin(i * 0.83) * 0.0014 + Math.cos(i * 1.27) * 0.0011;
    const event = i % 41 === 0 ? -0.009 : i % 57 === 0 ? 0.007 : 0;
    const dailyRet = trendPerSession + cycle + micro + event;

    const close = Math.max(40, prevClose * (1 + dailyRet));
    const gapRet = dailyRet * 0.35 + Math.sin(i * 1.43) * 0.0012;
    const open = Math.max(40, prevClose * (1 + gapRet));
    const intradaySpread = Math.max(0.0038, Math.abs(dailyRet) * 1.4 + 0.0045 + Math.abs(Math.cos(i / 5.2)) * 0.0015);
    const high = Math.max(open, close) * (1 + intradaySpread * 0.52);
    const low = Math.min(open, close) * (1 - intradaySpread * 0.48);
    const volume =
      38_000_000 +
      Math.round((Math.sin(i / 6.2) + 1) * 10_000_000 + (Math.cos(i / 13.1) + 1) * 7_000_000 + Math.abs(dailyRet) * 310_000_000);

    raw.push({
      t: tradingDays[i],
      open,
      high,
      low: Math.max(1, low),
      close,
      volume,
    });

    prevClose = close;
  }

  const ema = computeEma(raw.map((point) => point.close), 21);
  return raw.map((point, idx) => ({ ...point, ema21: ema[idx] }));
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
  isDemo,
  demoNote,
  onRetry,
}: {
  data: CandlePoint[];
  loading: boolean;
  isDemo: boolean;
  demoNote: string | null;
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

  if (data.length < 2) {
    return (
      <div className="flex min-h-[510px] w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-zinc-900/20 text-sm text-zinc-300">
        <span>Chart unavailable</span>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
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
    up: point.close >= point.open,
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
    <div className="w-full min-w-0">
      {isDemo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          <div className="truncate">
            <span className="font-semibold uppercase tracking-[0.12em] text-amber-100">Demo chart</span>
            <span className="ml-2 text-amber-200/90">{demoNote || 'Using simulated market path'}</span>
          </div>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      <div className="h-[560px] rounded-xl bg-zinc-900/20 p-2">
        <div className="grid h-full min-h-0 grid-rows-[4fr_1.35fr] gap-2">
          <div className="min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                key={`spy-price-${chartData[0]?.t ?? 0}-${chartData[chartData.length - 1]?.t ?? 0}-${chartData.length}`}
                data={chartData}
                syncId="spy-market-chart"
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="spyAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isDemo ? '#f59e0b' : '#93c5fd'} stopOpacity={0.28} />
                    <stop offset="70%" stopColor={isDemo ? '#f59e0b' : '#93c5fd'} stopOpacity={0.06} />
                    <stop offset="100%" stopColor={isDemo ? '#f59e0b' : '#93c5fd'} stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Area type="monotone" dataKey="close" stroke="none" fill="url(#spyAreaFill)" />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={isDemo ? '#fbbf24' : '#d4d4d8'}
                  strokeWidth={2.1}
                  dot={chartData.length <= 12 ? { r: 2, strokeWidth: 0, fill: isDemo ? '#fbbf24' : '#e4e4e7' } : false}
                  name="close"
                />
                <Line
                  type="monotone"
                  dataKey="ema21"
                  stroke={isDemo ? '#fde68a' : '#60a5fa'}
                  strokeWidth={1.35}
                  strokeDasharray="4 4"
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
                <Bar dataKey="volume" opacity={0.66} barSize={6} name="volume">
                  {chartData.map((point, index) => (
                    <Cell
                      key={`vol-${point.t}-${index}`}
                      fill={point.up ? (isDemo ? '#b45309' : '#0f766e') : isDemo ? '#92400e' : '#334155'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketDashboard() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('1M');

  const [performanceData, setPerformanceData] = useState<CandleApiPoint[]>([]);
  const [performanceMeta, setPerformanceMeta] = useState<CandleApiSuccessResponse | null>(null);
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
  const performanceRequestIdRef = useRef(0);
  const structureRequestIdRef = useRef(0);

  const fetchPerformance = async (range: RangeKey, isRefresh = false) => {
    const requestId = ++performanceRequestIdRef.current;
    setPerformanceLoading(true);
    if (isRefresh) setRefreshing(true);
    setPerformanceError(null);
    setPerformanceEmptyNote(null);
    setPerformanceData([]);

    try {
      const res = await fetch(`/api/market/candles?symbol=SPY&timeframe=${range}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch chart data');

      const payload = (await res.json()) as CandleApiSuccessResponse | CandleApiErrorResponse;
      if (requestId !== performanceRequestIdRef.current) return;
      if (!payload.ok) {
        setPerformanceData([]);
        setPerformanceMeta(null);
        setPerformanceEmptyNote(payload.error.message || 'No data returned for selected range');
        return;
      }

      const points = normalizeCandlePayload(payload.candles);
      setPerformanceData(points);
      setPerformanceMeta({ ...payload, candles: points });
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
      if (requestId !== performanceRequestIdRef.current) return;
      setPerformanceError(error?.message || 'Data unavailable');
      setPerformanceData([]);
      setPerformanceMeta(null);
    } finally {
      if (requestId === performanceRequestIdRef.current) {
        setPerformanceLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    }
  };

  const fetchStructure = async (range: RangeKey) => {
    const requestId = ++structureRequestIdRef.current;
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
    if (requestId !== structureRequestIdRef.current) return;

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

    if (requestId === structureRequestIdRef.current) {
      setStructureLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance(rangeKey);
    fetchStructure(rangeKey);
  }, [rangeKey]);

  const liveCandleData = useMemo(() => buildCandleData(performanceData), [performanceData]);
  const demoCandleData = useMemo(
    () => buildDemoCandleData(rangeKey, liveCandleData[liveCandleData.length - 1]?.close ?? null),
    [rangeKey, liveCandleData]
  );
  const isDemoChart =
    !performanceLoading && (performanceError !== null || performanceEmptyNote !== null || liveCandleData.length < 2);
  const demoReason = isDemoChart
    ? performanceError ||
      performanceEmptyNote ||
      (liveCandleData.length === 1
        ? `Only one live candle returned for ${rangeKey}`
        : `Live candles unavailable for ${rangeKey}`)
    : null;
  const shouldStylizeDemoFeed =
    !isDemoChart &&
    performanceMeta?.provider === 'demo' &&
    liveCandleData.length >= 20 &&
    shouldStylizeSeriesForDisplay(liveCandleData);
  const stylizedDemoFeed = useMemo(
    () => (shouldStylizeDemoFeed ? buildStylizedSeriesFromAnchors(liveCandleData) : liveCandleData),
    [shouldStylizeDemoFeed, liveCandleData]
  );
  const candleData = isDemoChart ? demoCandleData : stylizedDemoFeed;

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
    const risingCount = stocks?.rising?.length ?? sectors?.rising?.length ?? 0;
    const fallingCount = stocks?.falling?.length ?? sectors?.falling?.length ?? 0;
    const advDeclRatio = fallingCount > 0 ? risingCount / fallingCount : null;

    const sp500Series = snapshot?.series?.sp500?.points?.filter((p) => Number.isFinite(p.value)) ?? [];
    const spValues = sp500Series.map((p) => p.value as number);
    const latestSp = spValues[spValues.length - 1];
    const ma50 = spValues.length >= 50 ? spValues.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    const ma200 = spValues.length >= 200 ? spValues.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;

    return {
      advanceCount: risingCount,
      declineCount: fallingCount,
      advDeclRatio,
      pctAbove50: latestSp && ma50 ? (latestSp > ma50 ? 100 : 0) : null,
      pctAbove200: latestSp && ma200 ? (latestSp > ma200 ? 100 : 0) : null,
      breadthPct: risingCount + fallingCount > 0 ? (risingCount / (risingCount + fallingCount)) * 100 : null,
    };
  }, [sectors, snapshot, stocks]);

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
          As of {new Date(
            snapshot?.asOf ||
              performanceMeta?.candles?.[performanceMeta.candles.length - 1]?.t ||
              candleData[candleData.length - 1]?.t ||
              Date.now()
          ).toLocaleString()}
        </div>
        <section className="h-[132px] overflow-hidden rounded-2xl border border-zinc-800/40 bg-zinc-900/25 transition-colors duration-200 ease-out">
          <div className="grid h-full grid-cols-1 divide-y divide-zinc-800/35 md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Market Breadth</div>
              <div className="grid grid-cols-2 gap-4 text-xs leading-relaxed">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Adv / Decl</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
                    {`${breadth.advanceCount} / ${breadth.declineCount}`}
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
                  {!structureLoading && !moversUnavailable && (stocks?.rising ?? []).length === 0 && (
                    <div className="text-[11px] text-zinc-400">No gainers in selected range</div>
                  )}
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
                  {!structureLoading && !moversUnavailable && (stocks?.falling ?? []).length === 0 && (
                    <div className="text-[11px] text-zinc-400">No losers in selected range</div>
                  )}
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
                {!structureLoading && !sectorsUnavailable && (sectors?.rising ?? []).length === 0 && (
                  <div className="text-[11px] text-zinc-400">No rising sectors in selected range</div>
                )}
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
                {!structureLoading && !sectorsUnavailable && (sectors?.falling ?? []).length === 0 && (
                  <div className="text-[11px] text-zinc-400">No falling sectors in selected range</div>
                )}
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
                  {isDemoChart
                    ? 'Simulated feed'
                    : shouldStylizeDemoFeed
                      ? 'Demo feed (refined path)'
                      : performanceMeta
                        ? performanceMeta.provider
                        : ''}
                </span>
                {isDemoChart && (
                  <span className="rounded-full border border-amber-500/45 bg-amber-500/15 px-2 py-0.5 text-[10px] tracking-normal text-amber-200">
                    Demo
                  </span>
                )}
                {!isDemoChart && performanceMeta?.source && performanceMeta.source !== 'none' && (
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
              isDemo={isDemoChart}
              demoNote={demoReason}
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
