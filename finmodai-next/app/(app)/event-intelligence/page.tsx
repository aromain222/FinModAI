'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Range = '1D' | '1W' | '1M';
type Region = 'us' | 'europe' | 'asia' | 'global';
type Category = 'Geopolitics' | 'Macro' | 'Tech' | 'Energy' | 'Healthcare' | 'Disasters' | 'Policy';
type ImpactDirection = 'bullish' | 'bearish' | 'mixed' | 'unclear';
type ImpactTimeframe = 'hours' | 'days' | 'weeks' | 'months';

type EventIntel = {
  id: string;
  title: string;
  source: string;
  url?: string;
  publishedAt?: string;
  summary: string;
  category: string;
  themeTags: string[];
  affectedTickers: string[];
  affectedSectors: string[];
  impact: {
    direction: ImpactDirection;
    timeframe: ImpactTimeframe;
    confidence: number;
    reasoning: string;
    whyItMatters?: string[];
    likelyMarketChannels?: string[];
    watchlistAssets?: string[];
    baseCase?: string;
    riskCase?: string;
  };
  marketReaction?: {
    spy1d?: number | null;
    tickers: Array<{ symbol: string; pct1d: number | null; deltaVsSpy: number | null }>;
  };
};

type WatchItem = {
  symbol: string;
  label: 'beneficiary' | 'headwind';
  catalysts: string[];
  thesis: string;
  confidence: number;
};

type Dashboard = {
  themes: Array<{ theme: string; count: number }>;
  sectors: Array<{ sector: string; count: number }>;
  tickers: Array<{ symbol: string; count: number }>;
};

type EventsIntelResponse = {
  updatedAt: string;
  source: 'finnhub' | 'webz' | 'fallback' | string;
  data: {
    events: EventIntel[];
    watchlist: WatchItem[];
    dashboards: Dashboard;
  };
  warnings: string[];
};

const RANGE_OPTIONS: Range[] = ['1D', '1W', '1M'];
const REGION_OPTIONS: Array<{ label: string; value: Region }> = [
  { label: 'Global', value: 'global' },
  { label: 'US', value: 'us' },
  { label: 'Europe', value: 'europe' },
  { label: 'Asia', value: 'asia' },
];
const CATEGORY_OPTIONS: Category[] = ['Geopolitics', 'Macro', 'Tech', 'Energy', 'Healthcare', 'Disasters', 'Policy'];

const safeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const safeNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function formatTs(iso?: string) {
  const value = typeof iso === 'string' ? iso : '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date unavailable';
  return format(d, 'MMM dd, HH:mm');
}

function formatPct(pct: number | null | undefined) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function impactBadgeClass(direction: ImpactDirection) {
  if (direction === 'bullish') return 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30';
  if (direction === 'bearish') return 'bg-rose-500/10 text-rose-200 border border-rose-500/30';
  if (direction === 'mixed') return 'bg-amber-500/10 text-amber-200 border border-amber-500/30';
  return 'bg-white/5 text-slate-200 border border-white/10';
}

function labelBadgeClass(label: WatchItem['label']) {
  return label === 'beneficiary'
    ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30'
    : 'bg-rose-500/10 text-rose-200 border border-rose-500/30';
}

export default function EventIntelligencePage() {
  const [range, setRange] = useState<Range>('1W');
  const [region, setRegion] = useState<Region>('global');
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(() => new Set());
  const [forceNonce, setForceNonce] = useState(0);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['event-intelligence', range, region, forceNonce],
    queryFn: async () => {
      const force = forceNonce > 0 ? 1 : 0;
      try {
        const res = await fetch(`/api/events/intelligence?range=${range}&region=${region}&force=${force}&_ts=${forceNonce}`);
        const json = (await res.json()) as EventsIntelResponse;
        return (
          json ?? {
            updatedAt: new Date().toISOString(),
            source: 'fallback',
            data: { events: [], watchlist: [], dashboards: { themes: [], sectors: [], tickers: [] } },
            warnings: ['events_unavailable'],
          }
        );
      } catch {
        return {
          updatedAt: new Date().toISOString(),
          source: 'fallback',
          data: { events: [], watchlist: [], dashboards: { themes: [], sectors: [], tickers: [] } },
          warnings: ['events_unavailable'],
        } satisfies EventsIntelResponse;
      }
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loading = isLoading || isFetching;
  const warnings = useMemo(() => (Array.isArray(data?.warnings) ? data.warnings : []), [data?.warnings]);
  const aiUnavailable = warnings.includes('ai_unavailable');

  const events = useMemo(() => (Array.isArray(data?.data?.events) ? data.data.events : []), [data?.data?.events]);
  const dashboards = data?.data?.dashboards ?? { themes: [], sectors: [], tickers: [] };
  const watchlist = Array.isArray(data?.data?.watchlist) ? data.data.watchlist : [];

  const filteredEvents = useMemo(() => {
    if (!selectedCategories.size) return events;
    return events.filter((event) => selectedCategories.has(safeText(event.category) as Category));
  }, [events, selectedCategories]);

  const statusLine = useMemo(() => {
    if (loading) return '';
    if (events.length === 0) {
      return warnings.includes('events_unavailable') ? 'Events temporarily unavailable.' : 'No major events detected for this window.';
    }
    if (events.length > 0 && filteredEvents.length === 0) return 'No events match the selected categories.';
    return '';
  }, [events.length, filteredEvents.length, loading, warnings]);

  const toggleCategory = (category: Category) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white">Event Intelligence</h1>
            <p className="mt-2 text-slate-400">Major real-world events and their potential market impacts.</p>
            {aiUnavailable ? (
              <p className="mt-1 text-xs text-slate-500">AI enrichment unavailable — showing deterministic tagging.</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Badge className="bg-white/5 text-slate-200 border border-white/10">
              Source: {safeText(data?.source, 'fallback')}
            </Badge>
            <button
              onClick={() => setForceNonce((n) => n + 1)}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-slate-900/60 px-4 py-2 text-slate-300 transition-all hover:bg-slate-800/60 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Range:</span>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                    range === r
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                      : 'border border-white/5 bg-slate-950/60 text-slate-400 hover:border-emerald-400/30 hover:text-white'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Region:</span>
            <div className="flex gap-1">
              {REGION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRegion(opt.value)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                    region === opt.value
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'border border-white/5 bg-slate-950/60 text-slate-400 hover:border-blue-400/30 hover:text-white'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">Category:</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => {
                const active = selectedCategories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-all',
                      active
                        ? 'border-white/20 bg-white/10 text-white'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Events</h2>
              <div className="text-xs text-slate-500">Updated {formatTs(data?.updatedAt)}</div>
            </div>

            {statusLine ? (
              <Card className="rounded-2xl border border-white/5 bg-slate-950/60 p-8 text-center backdrop-blur-sm">
                <div className="text-sm text-slate-300">{statusLine}</div>
              </Card>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="h-36 rounded-2xl border border-white/5 bg-slate-900/30 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEvents.slice(0, 8).map((event) => {
                  const eventId = safeText(event.id) || safeText(event.title);
                  const confidence = safeNumber(event.impact?.confidence);
                  const direction = safeText(event.impact?.direction) as ImpactDirection;
                  const timeframe = safeText(event.impact?.timeframe);
                  const isExpanded = expandedEvents.has(eventId);
                  
                  // New structured fields
                  const whyItMatters = Array.isArray(event.impact?.whyItMatters) ? event.impact.whyItMatters : [];
                  const likelyMarketChannels = Array.isArray(event.impact?.likelyMarketChannels) ? event.impact.likelyMarketChannels : [];
                  const watchlistAssets = Array.isArray(event.impact?.watchlistAssets) ? event.impact.watchlistAssets : [];
                  const baseCase = safeText(event.impact?.baseCase);
                  const riskCase = safeText(event.impact?.riskCase);

                  const reactionTickers = Array.isArray(event.marketReaction?.tickers) ? event.marketReaction!.tickers : [];
                  const spy1d = safeNumber(event.marketReaction?.spy1d);

                  return (
                    <Card
                      key={eventId}
                      className="rounded-2xl border border-white/5 bg-slate-950/60 p-5 backdrop-blur-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <Badge className="bg-white/5 text-slate-200 border border-white/10 text-xs">
                              {safeText(event.category) || 'Event'}
                            </Badge>
                            <div className="truncate text-xs text-slate-500">
                              {safeText(event.source) ? `${safeText(event.source)} • ` : ''}
                              {formatTs(event.publishedAt)}
                            </div>
                          </div>

                          {safeText(event.url) ? (
                            <a
                              href={safeText(event.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-sm font-semibold text-white leading-snug hover:underline"
                            >
                              {safeText(event.title)}
                            </a>
                          ) : (
                            <div className="text-sm font-semibold text-white leading-snug">{safeText(event.title)}</div>
                          )}

                          {/* Compact 1-line summary */}
                          <div className="mt-2 text-sm text-slate-300 leading-relaxed line-clamp-1">
                            {safeText(event.summary)}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Badge className={cn('text-xs', impactBadgeClass(direction || 'unclear'))}>
                            {(direction || 'unclear').toUpperCase()}
                          </Badge>
                          <button
                            onClick={() => toggleEventExpanded(eventId)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <span>Less</span>
                                <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                <span>More</span>
                                <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expandable details */}
                      {isExpanded ? (
                        <div className="mt-4 space-y-4 border-t border-white/5 pt-4">
                          {/* Full summary */}
                          <div className="text-sm text-slate-300 leading-relaxed">
                            {safeText(event.summary)}
                          </div>

                          {/* Why it matters */}
                          {whyItMatters.length > 0 ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Why It Matters</div>
                              <ul className="space-y-1">
                                {whyItMatters.map((point, idx) => (
                                  <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                                    <span className="text-slate-500 mt-1">•</span>
                                    <span>{safeText(point)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {/* Market channels */}
                          {likelyMarketChannels.length > 0 ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Likely Market Channels</div>
                              <div className="flex flex-wrap gap-2">
                                {likelyMarketChannels.map((channel) => (
                                  <Badge
                                    key={channel}
                                    className="bg-purple-500/10 text-purple-200 border border-purple-500/30 text-xs"
                                  >
                                    {safeText(channel).toUpperCase()}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Watchlist assets */}
                          {watchlistAssets.length > 0 ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Watchlist Assets</div>
                              <div className="flex flex-wrap gap-2">
                                {watchlistAssets.map((asset) => (
                                  <Badge
                                    key={asset}
                                    className="bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 text-xs"
                                  >
                                    {safeText(asset).toUpperCase()}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Base case & Risk case */}
                          {(baseCase || riskCase) ? (
                            <div className="space-y-3">
                              {baseCase ? (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Base Case</div>
                                  <div className="text-sm text-slate-300">{baseCase}</div>
                                </div>
                              ) : null}
                              {riskCase ? (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Risk Case</div>
                                  <div className="text-sm text-slate-300">{riskCase}</div>
                                </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Original tags and sectors (only show in expanded or if no structured fields) */}
                      {(!isExpanded || (!whyItMatters.length && !likelyMarketChannels.length && !watchlistAssets.length && !baseCase && !riskCase)) && 
                      (event.themeTags?.length || event.affectedSectors?.length || event.affectedTickers?.length) ? (
                        <div className="mt-4 space-y-2">
                          {event.themeTags?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {event.themeTags.slice(0, 5).map((tag) => (
                                <Badge
                                  key={`${event.id}-theme-${tag}`}
                                  className="bg-white/5 text-slate-200 border border-white/10 text-xs"
                                >
                                  {safeText(tag)}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          {event.affectedSectors?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {event.affectedSectors.slice(0, 4).map((sector) => (
                                <Badge
                                  key={`${event.id}-sector-${sector}`}
                                  className="bg-blue-500/10 text-blue-200 border border-blue-500/30 text-xs"
                                >
                                  {safeText(sector)}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          {event.affectedTickers?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {event.affectedTickers.slice(0, 8).map((ticker) => (
                                <Badge
                                  key={`${event.id}-ticker-${ticker}`}
                                  className="bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 text-xs"
                                >
                                  {safeText(ticker).toUpperCase()}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {reactionTickers.length ? (
                        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                          <div className="text-xs text-slate-500">Market reaction (1D): SPY {formatPct(spy1d)}</div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            {reactionTickers.slice(0, 3).map((row) => {
                              const pct = safeNumber(row.pct1d);
                              const delta = safeNumber(row.deltaVsSpy);
                              return (
                                <div key={`${event.id}-rx-${row.symbol}`} className="flex items-center gap-2">
                                  <span className="font-medium text-slate-200">{safeText(row.symbol).toUpperCase()}</span>
                                  <span className={cn('tabular-nums', typeof pct === 'number' && pct < 0 ? 'text-rose-200' : 'text-emerald-200')}>
                                    {formatPct(pct)}
                                  </span>
                                  {typeof delta === 'number' ? (
                                    <span className="text-slate-500 tabular-nums">Δ {formatPct(delta)}</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card className="rounded-2xl border border-white/5 bg-slate-950/60 p-5 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Impact Dashboard</div>
                <div className="text-xs text-slate-500">{events.length} events</div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sector sensitivity</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(dashboards.sectors ?? []).slice(0, 10).map((row) => (
                      <Badge
                        key={`sector-${row.sector}`}
                        className="bg-white/5 text-slate-200 border border-white/10 text-xs"
                      >
                        {safeText(row.sector)} <span className="ml-1 text-slate-500 tabular-nums">{row.count}</span>
                      </Badge>
                    ))}
                    {!dashboards.sectors?.length ? <span className="text-xs text-slate-500">—</span> : null}
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Most mentioned tickers</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {(dashboards.tickers ?? []).slice(0, 10).map((row) => (
                      <div key={`ticker-${row.symbol}`} className="flex items-center justify-between text-slate-300">
                        <span className="font-medium">{safeText(row.symbol).toUpperCase()}</span>
                        <span className="text-xs text-slate-500 tabular-nums">{row.count}</span>
                      </div>
                    ))}
                    {!dashboards.tickers?.length ? <div className="text-xs text-slate-500">—</div> : null}
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Themes</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {(dashboards.themes ?? []).slice(0, 6).map((row) => (
                      <div key={`theme-${row.theme}`} className="flex items-center justify-between text-slate-300">
                        <span className="truncate">{safeText(row.theme)}</span>
                        <span className="text-xs text-slate-500 tabular-nums">{row.count}</span>
                      </div>
                    ))}
                    {!dashboards.themes?.length ? <div className="text-xs text-slate-500">—</div> : null}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Watchlist Candidates</h2>
            <div className="text-xs text-slate-500">{watchlist.length} symbols</div>
          </div>

          <Card className="rounded-2xl border border-white/5 bg-slate-950/60 p-0 backdrop-blur-sm overflow-hidden">
            {watchlist.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Symbol</th>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-right font-medium">Conf</th>
                      <th className="px-4 py-3 text-left font-medium">Thesis</th>
                      <th className="px-4 py-3 text-left font-medium">Catalysts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {watchlist.slice(0, 10).map((row) => (
                      <tr key={`watch-${row.symbol}`}>
                        <td className="px-4 py-3 text-slate-200 font-medium">{safeText(row.symbol).toUpperCase()}</td>
                        <td className="px-4 py-3">
                          <Badge className={cn('text-xs', labelBadgeClass(row.label))}>{row.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{safeNumber(row.confidence) ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-300">
                          <div className="line-clamp-2">{safeText(row.thesis)}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          <div className="line-clamp-2">{Array.isArray(row.catalysts) ? row.catalysts.join(', ') : '—'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">No watchlist candidates yet.</div>
            )}
          </Card>

          <Card className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 text-xs text-slate-500 backdrop-blur-sm">
            Educational / informational. Not investment advice.
          </Card>
        </div>
      </div>
    </div>
  );
}
