'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { LoadingPanel, EmptyState, ErrorState } from '@/components/loading';
import { TableSkeleton } from '@/components/loading/skeletons';
import { LOADING_TABS, getEmptyError } from '@/lib/loadingCopy';
import { XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from 'recharts';
import { FinanceChart, financeChartMargin, financeXAxisProps, financeTooltipStyle } from '@/components/charts/FinanceChart';
import { yDomainWithPadding } from '@/lib/chartFormat';
import { interpolateSeries, type ChartDataPoint } from '@/lib/chartInterpolation';
import { ema, downsample, SMOOTH_STROKE, RAW_STROKE, RAW_OPACITY } from '@/lib/chartSmoothing';

type ChartRange = '1H' | '1D' | '1W';
type StockRange = '1D' | '1W';

interface PerformanceDataPoint {
  date: string;
  value: number | null;
}

interface PerformanceResponse {
  points: PerformanceDataPoint[];
  source?: string;
  asOf?: string;
  label?: string;
  quality?: {
    level: 'high' | 'medium' | 'low';
    warnings: string[];
    repeatedValuePct?: number;
    maxGapDays?: number;
  };
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  marketImpact: string;
  whatHappened?: string;
  whyItMatters?: string;
  whyIncluded?: string[];
  // Enhanced intelligence fields
  category?: string;
  intelligence?: {
    category: string;
    whatHappened: string;
    whyItMatters: string;
    secondOrderImpacts: string[];
    affectedChannels: string[];
    confidence: 'low' | 'medium' | 'high';
  };
  secondOrderImpacts?: string[];
  affectedChannels?: string[];
}

interface StockMove {
  ticker: string;
  name?: string;
  returnPct: number;
  asOf?: string;
  lastPrice?: number;
  sparkline?: number[];
  provider?: string;
  quality?: { level: 'high' | 'medium' | 'low'; warnings?: string[] };
}

interface StockSummary {
  range: StockRange;
  asOf: string;
  rising: StockMove[];
  falling: StockMove[];
  warnings?: string[];
}

type ImpactLayout = {
  lead: string | null;
  winnersLosers: string[];
  monitoringAnchors: string[];
  invalidationTrigger: string | null;
  remainder: string[];
};

function parseImpactLayout(raw: string | null | undefined): ImpactLayout | null {
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const text = normalized.replace(/^market impact:\s*/i, '').trim();
  const winnersMatch = text.match(
    /likely winners\/losers:\s*([\s\S]*?)(?=(monitoring anchors:|invalidation trigger:|$))/i
  );
  const monitoringMatch = text.match(/monitoring anchors:\s*([\s\S]*?)(?=(invalidation trigger:|$))/i);
  const invalidationMatch = text.match(/invalidation trigger:\s*([\s\S]*)$/i);

  const markers = [
    winnersMatch?.index ?? Infinity,
    monitoringMatch?.index ?? Infinity,
    invalidationMatch?.index ?? Infinity,
  ];
  const firstMarker = Math.min(...markers);
  const core = Number.isFinite(firstMarker) ? text.slice(0, firstMarker).trim() : text;
  const sentences = core
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const winnersLosers = (winnersMatch?.[1] ?? '')
    .split(/\s*;\s*/g)
    .map((entry) => entry.trim().replace(/\.$/, ''))
    .filter(Boolean);
  const monitoringAnchors = (monitoringMatch?.[1] ?? '')
    .replace(/ and /gi, ', ')
    .split(/\s*[;,]\s*/g)
    .map((entry) => entry.trim().replace(/\.$/, ''))
    .filter(Boolean);

  return {
    lead: sentences[0] ?? null,
    remainder: sentences.slice(1),
    winnersLosers,
    monitoringAnchors,
    invalidationTrigger: invalidationMatch?.[1]?.trim() || null,
  };
}

export default function MarketBriefPage() {
  const [chartRange, setChartRange] = useState<ChartRange>('1D');
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([]);
  const [performanceMeta, setPerformanceMeta] = useState<PerformanceResponse | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [stocks, setStocks] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNews, setExpandedNews] = useState<Set<string>>(new Set());
  const fetchPerformance = async (range: ChartRange, symbol: string, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }
    try {
      const apiRange = range === '1H' ? '1D' : range;
      const perfRes = await fetch(`/api/market-brief/performance?range=${apiRange}&symbol=${encodeURIComponent(symbol)}`);
      if (!perfRes.ok) throw new Error('Failed to fetch performance data');
      const perfData: PerformanceResponse = await perfRes.json();
      setPerformanceData(perfData.points || []);
      setPerformanceMeta(perfData);
    } catch (err: any) {
      console.error('Error fetching market brief data:', err);
      setError(err.message || 'Failed to load market data');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchMarket = async (range: ChartRange = chartRange) => {
    setLoading(true);
    setError(null);
    try {
      const stockRange: StockRange = range === '1W' ? '1W' : '1D';
      const [newsRes, stocksRes] = await Promise.all([
        fetch('/api/market-brief/news'),
        fetch(`/api/market-brief/stocks?period=${stockRange}`),
      ]);
      if (!newsRes.ok) throw new Error('Failed to fetch news');
      const newsData = await newsRes.json();
      const stocksData = stocksRes.ok ? await stocksRes.json() : null;
      setNews(newsData);
      setStocks(stocksData);
    } catch (err: any) {
      console.error('Error fetching market brief data:', err);
      setError(err.message || 'Failed to load market data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarket(chartRange);
    fetchPerformance(chartRange, selectedSymbol);
    
    // Auto-refresh every hour
    const interval = setInterval(() => {
      fetchMarket(chartRange);
      fetchPerformance(chartRange, selectedSymbol, true);
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMarket/fetchPerformance intentionally not in deps
  }, [chartRange, selectedSymbol]);

  const handleRefresh = () => {
    fetchMarket(chartRange);
    fetchPerformance(chartRange, selectedSymbol, true);
  };

  // Calculate performance metrics with guards
  const validPerf = performanceData.filter((p): p is { date: string; value: number } => Number.isFinite(p.value));
  const currentValue = validPerf[validPerf.length - 1]?.value ?? 0;
  const startValue = validPerf[0]?.value ?? currentValue;
  const change = currentValue - startValue;
  const changePercent = startValue ? (change / startValue) * 100 : 0;
  const isPositive = change >= 0;
  const hasMovement = validPerf.length >= 2;
  const yDomain = yDomainWithPadding(
    performanceData.map((p) => p.value),
    0.05
  );
  const isDemo = performanceMeta?.source === 'demo';
  const chartPoints: ChartDataPoint[] = performanceData.map((p) => ({
    date: p.date,
    value: p.value,
    isActualPoint: true,
  }));
  const interpolated = isDemo
    ? interpolateSeries(chartPoints, 'quarterly', { allowNegative: true })
    : chartPoints;
  const showInterpolationFootnote = isDemo && interpolated.length > performanceData.length;

  // S&P / equity: 21-day EMA as primary; raw at low opacity. Downsample long series for performance.
  const EQUITY_EMA_DAYS = 21;
  const DOWNSAMPLE_THRESHOLD = 150;
  const rawForChart = interpolated.length > DOWNSAMPLE_THRESHOLD
    ? downsample(interpolated, Math.ceil(interpolated.length / 80))
    : interpolated;
  const smoothedSeries = ema(
    rawForChart.map((p) => ({ date: p.date, value: p.value })),
    EQUITY_EMA_DAYS
  );
  const displayData = rawForChart.map((p, i) => ({
    date: p.date,
    value: p.value,
    valueSmoothed: smoothedSeries[i]?.value ?? null,
    isActualPoint: p.isActualPoint !== false,
  }));
  const allValuesForDomain = [
    ...displayData.map((d) => d.value),
    ...displayData.map((d) => d.valueSmoothed),
  ].filter((v): v is number => v != null && Number.isFinite(v));
  const yDomainSmooth = allValuesForDomain.length > 0
    ? yDomainWithPadding(allValuesForDomain, 0.05)
    : yDomain;

  const marketBriefCopy = LOADING_TABS.marketBrief;
  const emptyError = getEmptyError('marketBrief');

  if (loading) {
    return (
      <LoadingPanel
        title={marketBriefCopy.title}
        subtitle={marketBriefCopy.subtitle}
        steps={marketBriefCopy.steps}
        variant={marketBriefCopy.variant}
        showProgress={true}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title={emptyError.errorTitle('market brief')}
        onRetry={handleRefresh}
        retryLabel={emptyError.retryLabel}
      />
    );
  }

  const sentimentFor = (item: NewsItem) => {
    const text = `${item.marketImpact || ''} ${item.title || ''} ${item.summary || ''} ${item.whyItMatters || ''}`.toLowerCase();
    if (/(rally|gain|surge|upside|bullish|beat|strong|optimism)/.test(text)) return 'Bullish';
    if (/(selloff|drop|plunge|downside|bearish|risk|weak|miss|slump)/.test(text)) return 'Bearish';
    return 'Neutral';
  };

  const sentimentStyle = (sentiment: string) =>
    sentiment === 'Bullish'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : sentiment === 'Bearish'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      : 'bg-slate-500/15 text-slate-200 border-slate-500/30';

  const renderSparkline = (values: number[] | undefined) => {
    if (!values || values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values
      .map((v, idx) => {
        const x = (idx / (values.length - 1)) * 100;
        const y = 100 - ((v - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');
    return (
      <svg viewBox="0 0 100 100" className="h-6 w-16">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          points={points}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  const kpiItems = [
    { label: 'SPY', value: selectedSymbol === 'SPY' ? currentValue : null },
    { label: 'NDX', value: null },
    { label: 'UST10Y', value: null },
    { label: 'VIX', value: null },
  ];

  return (
    <div className="w-full px-6 lg:px-8 2xl:px-10 h-[calc(100vh-72px)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_320px] gap-4 w-full h-full min-h-0">
        {/* Left: News Feed */}
        <section className="flex flex-col min-h-0 w-full overflow-hidden">
          <Card className="p-3 flex flex-col h-full min-h-0 border border-zinc-800/40 bg-transparent">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Market News</h2>
              <span className="text-[11px] text-muted-foreground">{news.length} headlines</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-2">
              {loading ? (
                <TableSkeleton rows={6} />
              ) : news.length === 0 ? (
                <EmptyState title={emptyError.emptyTitle} hint={emptyError.emptyHint} />
              ) : (
                news.map((item, idx) => {
                  const sentiment = sentimentFor(item);
                  const isExpanded = expandedNews.has(item.url);
                  return (
                    <Card key={idx} className="p-2 border border-zinc-800/40 bg-transparent">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sentimentStyle(sentiment)}`}>
                              {sentiment}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{item.source}</span>
                            <span className="text-[11px] text-muted-foreground">•</span>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(item.publishedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold leading-snug">{item.title}</h3>
                          <p className="text-xs text-muted-foreground">
                            {item.summary || item.whatHappened || item.marketImpact || 'Summary unavailable.'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = new Set(expandedNews);
                              if (isExpanded) next.delete(item.url);
                              else next.add(item.url);
                              setExpandedNews(next);
                            }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 border-t border-zinc-800/40 pt-2">
                          {(() => {
                            const impactText = item.whyItMatters || item.marketImpact || '';
                            const parsed = parseImpactLayout(impactText);
                            if (!parsed) {
                              return (
                                <p className="text-xs text-muted-foreground">
                                  Additional analysis unavailable.
                                </p>
                              );
                            }

                            return (
                              <div className="space-y-2 text-xs text-muted-foreground">
                                {parsed.lead && (
                                  <p className="rounded-md border border-zinc-800/50 bg-zinc-900/40 px-2 py-1.5 text-zinc-200">
                                    {parsed.lead}
                                  </p>
                                )}
                                {parsed.remainder.map((line, lineIdx) => (
                                  <p key={`impact-rem-${idx}-${lineIdx}`}>{line}</p>
                                ))}
                                {parsed.winnersLosers.length > 0 && (
                                  <div>
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">
                                      Winners / Losers
                                    </div>
                                    <ul className="space-y-1">
                                      {parsed.winnersLosers.map((entry, entryIdx) => (
                                        <li key={`impact-wl-${idx}-${entryIdx}`} className="text-zinc-300">
                                          {entry}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {parsed.monitoringAnchors.length > 0 && (
                                  <div>
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">
                                      Monitoring Anchors
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {parsed.monitoringAnchors.map((anchor, anchorIdx) => (
                                        <span
                                          key={`impact-anchor-${idx}-${anchorIdx}`}
                                          className="rounded-full border border-zinc-700/70 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-300"
                                        >
                                          {anchor}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {parsed.invalidationTrigger && (
                                  <div>
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">
                                      Invalidation Trigger
                                    </div>
                                    <p>{parsed.invalidationTrigger}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </Card>
        </section>

        {/* Center: Chart */}
        <section className="min-w-0 flex flex-col min-h-0 w-full overflow-hidden">
          <Card className="p-3 flex flex-col h-full min-h-0 border border-zinc-800/40 bg-transparent">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {kpiItems.map((item) => (
                <div key={item.label} className="rounded-md border border-zinc-800/40 px-2 py-2 bg-transparent">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
                  <div className="text-sm font-semibold">
                    {item.value != null && Number.isFinite(item.value) ? item.value.toFixed(2) : '—'}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{performanceMeta?.label || `${selectedSymbol} Performance`}</h2>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-5xl font-semibold tracking-tight">{currentValue.toFixed(2)}</span>
                  <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span className="font-semibold">
                      {isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {performanceMeta?.source || 'Unknown'} • As of {performanceMeta?.asOf ? new Date(performanceMeta.asOf).toLocaleString() : '—'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(['1H', '1D', '1W'] as ChartRange[]).map((range) => (
                  <Button
                    key={range}
                    variant={chartRange === range ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartRange(range)}
                  >
                    {range}
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            <div className="w-full min-h-[520px] flex-1 min-w-0">
              <FinanceChart
                height="100%"
                footnote={
                  showInterpolationFootnote
                    ? 'Demo display may use interpolation for readability.'
                    : performanceMeta?.quality?.warnings?.[0] ||
                      (performanceData.some((p) => p.value === null)
                        ? 'Data gap detected; chart shows gaps.'
                        : undefined) ||
                      'Bold line: 21-day trend (EMA). Light line: raw daily.'
                }
              >
                <LineChart data={displayData} margin={financeChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.25} />
                  <XAxis
                    dataKey="date"
                    type="category"
                    {...financeXAxisProps()}
                    tickFormatter={(value: string) =>
                      new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    }
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fontSize: 11 }}
                    tickCount={6}
                    domain={yDomainSmooth}
                    allowDataOverflow={false}
                    tickFormatter={(v: number) =>
                      Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''
                    }
                  />
                  <Tooltip
                    contentStyle={financeTooltipStyle}
                    formatter={(value: number, name: string) => {
                      const formatted =
                        Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
                      return [formatted, name];
                    }}
                    labelFormatter={(value: string) =>
                      new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Raw"
                    stroke={isPositive ? '#10b981' : '#ef4444'}
                    strokeWidth={RAW_STROKE}
                    strokeOpacity={RAW_OPACITY}
                    dot={false}
                    activeDot={false}
                    connectNulls={true}
                    isAnimationActive={true}
                  />
                  <Line
                    type="monotone"
                    dataKey="valueSmoothed"
                    name="21d trend"
                    stroke={isPositive ? '#10b981' : '#ef4444'}
                    strokeWidth={SMOOTH_STROKE}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 1, stroke: '#fff' }}
                    connectNulls={true}
                    isAnimationActive={true}
                  />
                </LineChart>
              </FinanceChart>
            </div>
          </Card>
        </section>

        {/* Right: Movers */}
        <section className="hidden xl:flex flex-col min-h-0 w-full overflow-hidden">
          <Card className="p-3 flex flex-col h-full min-h-0 border border-zinc-800/40 bg-transparent">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Top Movers</h2>
              <span className="text-[11px] text-muted-foreground">{stocks?.asOf || '—'}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
              {loading ? (
                <TableSkeleton rows={6} />
              ) : !stocks ? (
                <p className="text-sm text-muted-foreground">No movers available.</p>
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Gainers</h3>
                    </div>
                    <div className="space-y-1">
                      {stocks.rising.slice(0, 12).map((stock) => (
                        <button
                          key={stock.ticker}
                          className={`w-full text-left rounded-md border border-zinc-800/40 px-2 py-2 hover:bg-muted/40 transition-colors ${selectedSymbol === stock.ticker ? 'bg-muted/40' : ''}`}
                          onClick={() => setSelectedSymbol(stock.ticker)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">{stock.ticker}</div>
                              <div className="text-xs text-muted-foreground">{stock.name || '—'}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-xs font-semibold text-emerald-400">
                                  +{stock.returnPct.toFixed(2)}%
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {stock.lastPrice != null ? stock.lastPrice.toFixed(2) : '—'}
                                </div>
                              </div>
                              <div className="text-emerald-400">{renderSparkline(stock.sparkline)}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="h-4 w-4 text-rose-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Losers</h3>
                    </div>
                    <div className="space-y-1">
                      {stocks.falling.slice(0, 12).map((stock) => (
                        <button
                          key={stock.ticker}
                          className={`w-full text-left rounded-md border border-zinc-800/40 px-2 py-2 hover:bg-muted/40 transition-colors ${selectedSymbol === stock.ticker ? 'bg-muted/40' : ''}`}
                          onClick={() => setSelectedSymbol(stock.ticker)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">{stock.ticker}</div>
                              <div className="text-xs text-muted-foreground">{stock.name || '—'}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-xs font-semibold text-rose-400">
                                  {stock.returnPct.toFixed(2)}%
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {stock.lastPrice != null ? stock.lastPrice.toFixed(2) : '—'}
                                </div>
                              </div>
                              <div className="text-rose-400">{renderSparkline(stock.sparkline)}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
