'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock, Loader2, Minus, RefreshCw, WifiOff } from 'lucide-react';
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RangeKey = '1D' | '5D' | '1W' | '1M' | '3M' | '1Y' | 'YTD' | '5Y' | 'MAX';
type Freshness = 'fresh' | 'stale';

type CandleApiPoint = { t: number; o: number; h: number; l: number; c: number; v: number | null };

type CandleApiSuccessResponse = {
  ok: true;
  symbol: string;
  timeframe: RangeKey;
  provider: string;
  freshness: Freshness;
  asOf: string;
  reason?: string;
  candles: CandleApiPoint[];
};

type CandleApiErrorResponse = {
  ok: false;
  error: { code: string; message: string; symbol?: string; timeframe?: RangeKey };
};

type QuoteItem = {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  volume: number;
  previousClose: number;
  open: number;
  timestamp: number;
};

type QuotesPayload = {
  provider: string;
  asOf: string;
  freshness: Freshness;
  reason?: string;
  quotes: QuoteItem[];
  error?: string;
};

interface StockMove {
  ticker: string;
  returnPct: number;
  lastPrice?: number;
  name?: string;
}

interface SectorRow {
  sector: string;
  ticker: string;
  returnPct: number;
}

interface MoversPayload {
  ok: boolean;
  provider?: string;
  freshness?: Freshness;
  asOf?: string;
  reason?: string;
  rising: StockMove[];
  falling: StockMove[];
  error?: { code: string; message: string };
}

interface SectorsPayload {
  ok: boolean;
  provider?: string;
  freshness?: Freshness;
  asOf?: string;
  reason?: string;
  rising: SectorRow[];
  falling: SectorRow[];
  error?: { code: string; message: string };
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const RANGE_OPTIONS: RangeKey[] = ['1D', '5D', '1W', '1M', '3M', '1Y', 'YTD', '5Y', 'MAX'];

const QUOTE_SYMBOLS = [
  'SPY', '^GSPC', '^VIX',
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA',
  'BTCUSD', 'ETHUSD',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
    .filter((p) => [p.t, p.o, p.h, p.l, p.c].every((v) => Number.isFinite(v)) && p.t > 946684800000 && p.t < now + 86400000)
    .map((p) => ({ t: p.t, open: p.o, high: p.h, low: p.l, close: p.c, volume: Number.isFinite(p.v) ? p.v : null }))
    .sort((a, b) => a.t - b.t);

  const ema = computeEma(clean.map((p) => p.close), 21);
  return clean.map((p, idx) => ({ ...p, ema21: ema[idx] }));
}

/* ------------------------------------------------------------------ */
/*  Small UI components                                                */
/* ------------------------------------------------------------------ */

function ArrowGlyph({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return <Minus className="h-3.5 w-3.5 text-zinc-400" />;
  }
  if (value > 0) return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />;
  return <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />;
}

function FreshnessBadge({ freshness, reason }: { freshness: Freshness; reason?: string }) {
  if (freshness === 'fresh') return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
      title={reason || 'Using cached snapshot'}
    >
      <Clock className="h-3 w-3" />
      Delayed
    </span>
  );
}

function LiveUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800/35 bg-zinc-900/25 px-8 py-16 text-center">
      <WifiOff className="h-8 w-8 text-zinc-500" />
      <div className="text-sm font-medium text-zinc-300">Live market data temporarily unavailable</div>
      <div className="text-xs text-zinc-500">Try refreshing in a few moments</div>
    </div>
  );
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

/* ------------------------------------------------------------------ */
/*  Quote Tiles                                                        */
/* ------------------------------------------------------------------ */

function QuoteTile({ quote }: { quote: QuoteItem }) {
  const up = quote.changesPercentage >= 0;
  return (
    <div className="rounded-lg border border-zinc-800/35 bg-zinc-950/35 px-3 py-2.5 transition-colors duration-200 ease-out hover:border-zinc-700/45 hover:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">{quote.symbol}</div>
        <ArrowGlyph value={quote.changesPercentage} />
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">
        {formatNumber(quote.price, quote.price > 100 ? 2 : quote.price > 1 ? 2 : 4)}
      </div>
      <div className={cn('text-xs font-medium', up ? 'text-emerald-400' : 'text-rose-400')}>
        {formatPct(quote.changesPercentage)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Candle chart                                                       */
/* ------------------------------------------------------------------ */

function CandleChart({
  data,
  loading,
  freshness,
  onRetry,
}: {
  data: CandlePoint[];
  loading: boolean;
  freshness: Freshness;
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
        <WifiOff className="h-6 w-6 text-zinc-500" />
        <span>Chart unavailable</span>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  const chartData = data.map((p) => ({
    t: p.t,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    ema21: p.ema21,
    volume: p.volume ?? 0,
    up: p.close >= p.open,
  }));

  const maxVolume = Math.max(...chartData.map((p) => p.volume), 1);
  const spanMs = Math.max((chartData[chartData.length - 1]?.t ?? 0) - (chartData[0]?.t ?? 0), 1);
  const low = Math.min(...chartData.map((p) => p.low));
  const high = Math.max(...chartData.map((p) => p.high));
  const band = Math.max(high - low, 0.25);
  const pad = band * 0.06;

  const xTickFormatter = (value: number) => {
    const date = new Date(value);
    if (spanMs <= 86400000 * 7) return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
  };

  const tooltipLabelFormatter = (value: number) => new Date(value).toLocaleString();

  return (
    <div className="w-full min-w-0">
      {freshness === 'stale' && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-200">
          <Clock className="h-3.5 w-3.5" />
          <span>Showing cached snapshot — live data temporarily delayed</span>
          <Button variant="outline" size="sm" className="ml-auto h-6 px-2 text-[10px]" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      <div className="h-[560px] rounded-xl bg-zinc-900/20 p-2">
        <div className="grid h-full min-h-0 grid-rows-[4fr_1.35fr] gap-2">
          <div className="min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                key={`spy-price-${chartData[0]?.t ?? 0}-${chartData.length}`}
                data={chartData}
                syncId="spy-market-chart"
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="spyAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.28} />
                    <stop offset="70%" stopColor="#93c5fd" stopOpacity={0.06} />
                    <stop offset="100%" stopColor="#93c5fd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
                <YAxis
                  orientation="right"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  stroke="#3f3f46"
                  domain={[Math.max(0, low - pad), high + pad]}
                  width={56}
                  tickCount={6}
                  tickFormatter={(v) => formatNumber(typeof v === 'number' ? v : Number(v), 2)}
                />
                <Tooltip
                  labelFormatter={tooltipLabelFormatter}
                  formatter={(value: number | string, name: string, item: { payload?: Record<string, number> }) => {
                    if (name === 'close') {
                      const row = item?.payload;
                      return [`O ${formatNumber(row?.open, 2)}  H ${formatNumber(row?.high, 2)}  L ${formatNumber(row?.low, 2)}  C ${formatNumber(row?.close, 2)}`, 'OHLC'];
                    }
                    if (name === 'volume') return [compactVolume(typeof value === 'number' ? value : Number(value)), 'Volume'];
                    return [formatNumber(typeof value === 'number' ? value : Number(value), 2), name === 'ema21' ? '21D EMA' : name];
                  }}
                  contentStyle={{
                    backgroundColor: 'rgba(24, 24, 27, 0.96)',
                    borderColor: 'rgba(63, 63, 70, 0.9)',
                    borderRadius: '8px',
                    color: '#e4e4e7',
                  }}
                />
                <Area type="monotone" dataKey="close" stroke="none" fill="url(#spyAreaFill)" />
                <Line type="monotone" dataKey="close" stroke="#d4d4d8" strokeWidth={2.1} dot={chartData.length <= 12 ? { r: 2, strokeWidth: 0, fill: '#e4e4e7' } : false} name="close" />
                <Line type="monotone" dataKey="ema21" stroke="#60a5fa" strokeWidth={1.35} strokeDasharray="4 4" dot={false} connectNulls={false} name="ema21" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="min-h-0 border-t border-zinc-800/45 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} syncId="spy-market-chart" margin={{ top: 4, right: 12, left: 0, bottom: 10 }}>
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={xTickFormatter} tick={{ fill: '#9ca3af', fontSize: 11 }} stroke="#3f3f46" minTickGap={42} />
                <YAxis orientation="right" tick={false} stroke="#3f3f46" domain={[0, Math.ceil(maxVolume * 1.1)]} width={0} />
                <Tooltip
                  labelFormatter={tooltipLabelFormatter}
                  formatter={(value: number | string) => [compactVolume(typeof value === 'number' ? value : Number(value)), 'Volume']}
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.96)', borderColor: 'rgba(63, 63, 70, 0.9)', borderRadius: '8px', color: '#e4e4e7' }}
                />
                <Bar dataKey="volume" opacity={0.66} barSize={6} name="volume">
                  {chartData.map((p, i) => (
                    <Cell key={`vol-${p.t}-${i}`} fill={p.up ? '#0f766e' : '#334155'} />
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

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                     */
/* ------------------------------------------------------------------ */

export default function MarketDashboard() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('1M');

  // Quotes
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesFreshness, setQuotesFreshness] = useState<Freshness>('fresh');
  const [quotesReason, setQuotesReason] = useState<string | undefined>();
  const [quotesAsOf, setQuotesAsOf] = useState<string | null>(null);

  // Chart
  const [performanceData, setPerformanceData] = useState<CandleApiPoint[]>([]);
  const [chartFreshness, setChartFreshness] = useState<Freshness>('fresh');
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chartAsOf, setChartAsOf] = useState<string | null>(null);

  // Movers
  const [movers, setMovers] = useState<{ rising: StockMove[]; falling: StockMove[] } | null>(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [moversFreshness, setMoversFreshness] = useState<Freshness>('fresh');

  // Sectors
  const [sectors, setSectors] = useState<{ rising: SectorRow[]; falling: SectorRow[] } | null>(null);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [sectorsFreshness, setSectorsFreshness] = useState<Freshness>('fresh');

  const perfRequestId = useRef(0);

  /* --- Fetchers --- */

  const fetchQuotes = async () => {
    setQuotesLoading(true);
    try {
      const res = await fetch(`/api/market/quotes?symbols=${QUOTE_SYMBOLS.join(',')}`, { cache: 'no-store' });
      const payload: QuotesPayload = await res.json();
      setQuotes(payload.quotes ?? []);
      setQuotesFreshness(payload.freshness ?? 'fresh');
      setQuotesReason(payload.reason);
      setQuotesAsOf(payload.asOf ?? null);
    } catch {
      setQuotes([]);
      setQuotesFreshness('stale');
      setQuotesReason('LIVE_UNAVAILABLE');
    } finally {
      setQuotesLoading(false);
    }
  };

  const fetchPerformance = async (range: RangeKey, isRefresh = false) => {
    const reqId = ++perfRequestId.current;
    setPerformanceLoading(true);
    if (isRefresh) setRefreshing(true);
    setPerformanceError(null);
    setPerformanceData([]);
    setChartFreshness('fresh');

    try {
      const res = await fetch(`/api/market/candles?symbol=SPY&timeframe=${range}`, { cache: 'no-store' });
      const payload = (await res.json()) as CandleApiSuccessResponse | CandleApiErrorResponse;
      if (reqId !== perfRequestId.current) return;

      if (!payload.ok) {
        setPerformanceError(payload.error.code === 'LIVE_UNAVAILABLE' ? 'LIVE_UNAVAILABLE' : payload.error.message);
        return;
      }

      setPerformanceData(payload.candles);
      setChartFreshness(payload.freshness);
      setChartAsOf(payload.asOf);
    } catch (err: any) {
      if (reqId !== perfRequestId.current) return;
      setPerformanceError(err?.message || 'Data unavailable');
    } finally {
      if (reqId === perfRequestId.current) {
        setPerformanceLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    }
  };

  const fetchMovers = async () => {
    setMoversLoading(true);
    try {
      const res = await fetch('/api/market/movers', { cache: 'no-store' });
      const payload: MoversPayload = await res.json();
      if (payload.ok) {
        setMovers({ rising: payload.rising ?? [], falling: payload.falling ?? [] });
        setMoversFreshness(payload.freshness ?? 'fresh');
      } else {
        setMovers(null);
      }
    } catch {
      setMovers(null);
    } finally {
      setMoversLoading(false);
    }
  };

  const fetchSectors = async () => {
    setSectorsLoading(true);
    try {
      const res = await fetch('/api/market/sectors', { cache: 'no-store' });
      const payload: SectorsPayload = await res.json();
      if (payload.ok) {
        setSectors({ rising: payload.rising ?? [], falling: payload.falling ?? [] });
        setSectorsFreshness(payload.freshness ?? 'fresh');
      } else {
        setSectors(null);
      }
    } catch {
      setSectors(null);
    } finally {
      setSectorsLoading(false);
    }
  };

  /* --- Effects --- */

  useEffect(() => {
    fetchQuotes();
    fetchMovers();
    fetchSectors();
  }, []);

  useEffect(() => {
    fetchPerformance(rangeKey);
  }, [rangeKey]);

  /* --- Derived data --- */

  const candleData = useMemo(() => buildCandleData(performanceData), [performanceData]);

  const latest = candleData[candleData.length - 1] ?? null;
  const windowStart = candleData[0] ?? null;
  const priceNow = latest?.close ?? null;
  const priceStart = windowStart ? (windowStart.open ?? windowStart.close) : null;
  const priceDelta = priceNow !== null && priceStart !== null ? priceNow - priceStart : null;
  const pctDelta = priceNow !== null && priceStart !== null && priceStart !== 0 ? (priceDelta! / priceStart) * 100 : null;
  const up = priceDelta !== null ? priceDelta >= 0 : null;

  const rangeLow = candleData.length > 0 ? candleData.reduce<number>((min, p) => Math.min(min, p.low), candleData[0].low) : null;
  const rangeHigh = candleData.length > 0 ? candleData.reduce<number>((max, p) => Math.max(max, p.high), candleData[0].high) : null;
  const volumeTotal = candleData.reduce((sum, p) => sum + (p.volume ?? 0), 0);

  const isLiveUnavailable = !performanceLoading && performanceError === 'LIVE_UNAVAILABLE' && candleData.length < 2;

  const overallFreshness: Freshness =
    quotesFreshness === 'stale' || chartFreshness === 'stale' || moversFreshness === 'stale' || sectorsFreshness === 'stale'
      ? 'stale'
      : 'fresh';

  const asOfDisplay = quotesAsOf || chartAsOf || new Date().toISOString();

  return (
    <div className="h-[calc(100vh-72px)] w-full overflow-y-auto overflow-x-hidden bg-zinc-950">
      <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-y-8 px-6 py-6">

        {/* Header bar: As-of + freshness */}
        <div className="flex items-center justify-end gap-3 text-[11px] text-zinc-400">
          <FreshnessBadge freshness={overallFreshness} reason={quotesReason} />
          <span>As of {new Date(asOfDisplay).toLocaleString()}</span>
        </div>

        {/* Quote Tiles */}
        <section>
          {quotesLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-800/30" />
              ))}
            </div>
          ) : quotes.length === 0 ? (
            <LiveUnavailable />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
              {quotes.map((q) => (
                <QuoteTile key={q.symbol} quote={q} />
              ))}
            </div>
          )}
        </section>

        {/* Breadth strip: Movers + Sectors */}
        <section className="overflow-hidden rounded-2xl border border-zinc-800/40 bg-zinc-900/25 transition-colors duration-200 ease-out">
          <div className="grid grid-cols-1 divide-y divide-zinc-800/35 md:grid-cols-2 md:divide-x md:divide-y-0">
            {/* Movers */}
            <div className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Top Movers</div>
                <FreshnessBadge freshness={moversFreshness} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Gainers</div>
                  {moversLoading && <div className="h-12 animate-pulse rounded bg-zinc-800/30" />}
                  {!moversLoading && !movers && <div className="text-[11px] text-zinc-500">Unavailable</div>}
                  {!moversLoading &&
                    (movers?.rising ?? []).slice(0, 5).map((m) => (
                      <div key={`g-${m.ticker}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                        <span className="text-zinc-100">{m.ticker}</span>
                        <span className="font-medium text-emerald-400">+{m.returnPct.toFixed(2)}%</span>
                      </div>
                    ))}
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Losers</div>
                  {moversLoading && <div className="h-12 animate-pulse rounded bg-zinc-800/30" />}
                  {!moversLoading && !movers && <div className="text-[11px] text-zinc-500">Unavailable</div>}
                  {!moversLoading &&
                    (movers?.falling ?? []).slice(0, 5).map((m) => (
                      <div key={`l-${m.ticker}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                        <span className="text-zinc-100">{m.ticker}</span>
                        <span className="font-medium text-rose-400">{m.returnPct.toFixed(2)}%</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Sectors */}
            <div className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">Sector Performance</div>
                <FreshnessBadge freshness={sectorsFreshness} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Rising</div>
                  {sectorsLoading && <div className="h-12 animate-pulse rounded bg-zinc-800/30" />}
                  {!sectorsLoading && !sectors && <div className="text-[11px] text-zinc-500">Unavailable</div>}
                  {!sectorsLoading &&
                    (sectors?.rising ?? []).slice(0, 5).map((s, i) => (
                      <div key={`sr-${i}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                        <span className="truncate text-zinc-100">{s.sector}</span>
                        <span className="font-medium text-emerald-400">+{s.returnPct.toFixed(2)}%</span>
                      </div>
                    ))}
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Falling</div>
                  {sectorsLoading && <div className="h-12 animate-pulse rounded bg-zinc-800/30" />}
                  {!sectorsLoading && !sectors && <div className="text-[11px] text-zinc-500">Unavailable</div>}
                  {!sectorsLoading &&
                    (sectors?.falling ?? []).slice(0, 5).map((s, i) => (
                      <div key={`sf-${i}`} className="grid grid-cols-[1fr_auto] py-0.5 text-xs">
                        <span className="truncate text-zinc-100">{s.sector}</span>
                        <span className="font-medium text-rose-400">{s.returnPct.toFixed(2)}%</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Price + Chart */}
        {isLiveUnavailable ? (
          <LiveUnavailable />
        ) : (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[40%_60%]">
            {/* SPY summary tile */}
            <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 px-5 py-5 transition-colors duration-200 ease-out">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-zinc-200">S&P 500 (SPY)</div>
                <FreshnessBadge freshness={chartFreshness} />
              </div>
              <div className="mt-2 text-[4.9rem] font-semibold tracking-tight text-zinc-50">{formatNumber(priceNow, 2)}</div>
              <div className={cn('mt-2 text-lg font-medium', up === null ? 'text-zinc-300' : up ? 'text-emerald-400' : 'text-rose-400')}>
                {formatNumber(priceDelta, 2)} ({formatPct(pctDelta)})
              </div>

              <div className="mt-4 space-y-2 text-xs text-zinc-300">
                <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Session Range</span>
                  <span>{rangeLow !== null && rangeHigh !== null ? `${formatNumber(rangeLow, 2)} – ${formatNumber(rangeHigh, 2)}` : '—'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">Volume</span>
                  <span>{compactVolume(candleData.length === 0 ? null : volumeTotal)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">21D EMA</span>
                  <span>{formatNumber(latest?.ema21, 2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-300/70">EMA Indicator</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', latest?.ema21 != null && latest.close >= latest.ema21 ? 'text-emerald-400' : 'text-rose-400')}>
                    {latest?.ema21 != null ? (latest.close >= latest.ema21 ? 'Above EMA' : 'Below EMA') : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Chart panel */}
            <div className="min-h-0 rounded-2xl border border-zinc-800/40 bg-zinc-900/30 px-3 pt-3 pb-3 transition-colors duration-200 ease-out">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400/70">
                  <span>S&P 500 (SPY)</span>
                  <span className="rounded-full border border-zinc-700/50 bg-zinc-800/40 px-2 py-0.5 text-[10px] tracking-normal text-zinc-300">
                    FMP
                  </span>
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
                freshness={chartFreshness}
                onRetry={() => void fetchPerformance(rangeKey, true)}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
