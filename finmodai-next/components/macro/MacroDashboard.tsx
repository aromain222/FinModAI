'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Globe2,
  Info,
} from 'lucide-react';
import { LoadingPanel, ErrorState } from '@/components/loading';
import { LOADING_TABS, getEmptyError } from '@/lib/loadingCopy';
import { cn } from '@/lib/utils';
import type { MacroSnapshot, TimeRange } from '@/lib/macroData';
import { MacroChart } from './MacroChart';
import { MacroSeries } from '@/types/macroSeries';
import type { WorldBriefEventCard, WorldBriefResponseV2 } from '@/types/worldBrief';

/**
 * Metric helpers
 */
function formatValue(unit: MacroSeries['meta']['unit'], value?: number | null, decimals = 2): string {
  if (value === undefined || value === null || !isFinite(value)) return '—';
  const rounded = Number(value.toFixed(decimals));
  const safe = Math.abs(rounded) < Math.pow(10, -decimals) ? 0 : rounded;
  if (unit === 'percent') return `${safe.toFixed(decimals)}%`;
  if (unit === 'bps') return `${(safe * 100).toFixed(0)} bps`;
  if (unit === 'index' || unit === 'level') return safe.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return safe.toFixed(decimals);
}

type ChangeDirection = 'up' | 'down' | 'neutral';

function computeChange(
  latest: number | null | undefined,
  first: number | null | undefined,
  unit: MacroSeries['meta']['unit']
): { text: string; direction: ChangeDirection } {
  if (latest === null || first === null || latest === undefined || first === undefined) return { text: '—', direction: 'neutral' as const };
  if (!isFinite(latest) || !isFinite(first)) return { text: '—', direction: 'neutral' as const };
  const delta = latest - first;
  let text: string;
  if (unit === 'percent' || unit === 'bps' || unit === 'level') {
    const displayUnit = unit === 'bps' ? `${(delta * 100).toFixed(0)} bps` : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${unit === 'percent' ? '%' : ''}`;
    text = displayUnit;
  } else {
    const pct = first !== 0 ? (delta / first) * 100 : 0;
    text = `${delta >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }
  const direction: ChangeDirection = Math.abs(delta) < 1e-6 ? 'neutral' : delta > 0 ? 'up' : 'down';
  return { text, direction };
}

function latestAndFirst(series?: MacroSeries) {
  if (!series) return { latest: null, first: null };
  const valid = (series.points || []).filter(p => p.value !== null && isFinite(p.value as number));
  if (valid.length === 0) return { latest: null, first: null };
  return { first: valid[0].value as number, latest: valid[valid.length - 1].value as number };
}

function summarizeWorldItem(item: WorldBriefEventCard): string {
  return item.what_happened;
}

function formatStatusLabel(value?: string | null): string | undefined {
  if (!value) return value ?? undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes('fallback_invalid')) return 'Data unavailable';
  if (normalized.includes('insufficient')) return 'Not enough history';
  return value;
}

// Confidence is retained in the API contract for internal diagnostics, but we intentionally
// do not render confidence badges in the UI (they read as arbitrary and hurt trust).

export default function MacroDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1M');
  const [snapshot, setSnapshot] = useState<MacroSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worldItems, setWorldItems] = useState<WorldBriefEventCard[]>([]);
  const [worldLoading, setWorldLoading] = useState(true);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [worldNote, setWorldNote] = useState<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const timeRanges: TimeRange[] = ['1W', '1M', '3M', '1Y', '5Y', 'MAX'];

  const fetchMacroData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/macro/snapshot?range=${timeRange}`);
      if (!response.ok) {
        throw new Error('Failed to fetch macro snapshot');
      }
      const data = await response.json();
      setSnapshot(data);
      
      console.log('[MacroDashboard] Snapshot loaded:', {
        horizon: data.horizon,
        metricsCount: Object.keys(data.metrics).length,
        quality: data.quality.overall
      });
    } catch (err: any) {
      console.error('[MacroDashboard] Failed to fetch macro data:', err);
      setError(err.message || 'Failed to load macro data');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  // Fetch macro snapshot when time range changes
  useEffect(() => {
    fetchMacroData();
  }, [fetchMacroData]);

  useEffect(() => {
    const stored = localStorage.getItem('worldBriefHidden');
    if (stored) {
      setHiddenKeys(JSON.parse(stored));
    }
  }, []);

  const toggleHide = (key: string) => {
    const next = hiddenKeys.includes(key)
      ? hiddenKeys.filter(k => k !== key)
      : [...hiddenKeys, key];
    setHiddenKeys(next);
    localStorage.setItem('worldBriefHidden', JSON.stringify(next));
  };

  const fetchWorldBrief = useCallback(async () => {
    try {
      setWorldLoading(true);
      setWorldError(null);
      setWorldNote(null);
      const response = await fetch('/api/world-brief?timeframe=72h');
      if (!response.ok) throw new Error('Failed to fetch world brief');
      const data: WorldBriefResponseV2 = await response.json();
      const events = Array.isArray(data.events) ? data.events : [];
      setWorldItems(events);
      setWorldNote((data as any).note || null);
    } catch (err: any) {
      setWorldError(err.message || 'Failed to load world brief');
    } finally {
      setWorldLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorldBrief();
  }, [fetchWorldBrief]);

  const horizonLabel = useMemo(() => {
    switch (timeRange) {
      case '1W': return '1 Week';
      case '1M': return '1 Month';
      case '3M': return '3 Months';
      case '1Y': return '1 Year';
      case '5Y': return '5 Years';
      default: return 'Max';
    }
  }, [timeRange]);

  const renderChangeBadge = (direction: 'up' | 'down' | 'neutral', text: string) => {
    const color =
      direction === 'up' ? 'text-emerald-500 bg-emerald-500/10' :
      direction === 'down' ? 'text-red-500 bg-red-500/10' :
      'text-muted-foreground bg-muted';
    const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Info;
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs', color)}>
        <Icon className="h-3 w-3" />
        {text}
      </span>
    );
  };

  const renderSeriesCard = (key: string, label: string, series?: MacroSeries) => {
    if (!series) return null;
    const { latest, first } = latestAndFirst(series);
    const change = computeChange(latest, first, series.meta.unit);
    return (
      <Card key={key} className="shadow-sm border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{label}</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {formatValue(series.meta.unit, latest)} {renderChangeBadge(change.direction, change.text)}
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <div className="font-medium">{series.meta.frequency === 'monthly' ? 'Monthly' : series.meta.frequency === 'daily' ? 'Daily' : 'Policy'}</div>
              <div className="text-[11px]">{series.meta.source}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2 min-w-0 w-full">
          <MacroChart series={series} range={timeRange} currentValue={latest ?? undefined} />
        </CardContent>
      </Card>
    );
  };

  const macroCopy = LOADING_TABS.macroDashboard;
  const emptyError = getEmptyError('macroDashboard');

  // Show loading state
  if (loading) {
    return (
      <LoadingPanel
        title={macroCopy.title}
        subtitle={macroCopy.subtitle}
        steps={macroCopy.steps}
        variant={macroCopy.variant}
        showProgress={true}
      />
    );
  }

  // Show error state
  if (error || !snapshot) {
    return (
      <div className="space-y-6">
        <ErrorState
          title={error || emptyError.errorTitle('macro data')}
          onRetry={fetchMacroData}
          retryLabel={emptyError.retryLabel}
        />
        <div className="flex gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { metrics, series, quality } = snapshot;
  const sectorBreadth = snapshot.sectorBreadth;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold leading-tight">Macro Dashboard</h1>
              <p className="text-sm text-muted-foreground">Frequency-aware charts; gaps preserved, no over-smoothing.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Time range:</span>
            <div className="flex gap-2 rounded-full bg-muted/60 p-1">
              {timeRanges.map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    'px-3 py-1 text-sm rounded-full transition',
                    timeRange === range ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Horizon: {horizonLabel} • As of {new Date(snapshot.asOf).toLocaleString()}
        </div>
      </div>

      <div className="max-h-[520px] overflow-y-auto pr-2">
        <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2 min-w-0">
          {renderSeriesCard('fedFunds', 'Fed Funds Rate', series.fedFunds)}
          {renderSeriesCard('treasury10y', '10Y Treasury', series.treasury10y)}
          {renderSeriesCard('cpi', 'CPI (YoY)', series.cpi)}
          {renderSeriesCard('sp500', 'S&P 500 (proxy: SPY)', series.sp500)}
          {renderSeriesCard('unemployment', 'Unemployment Rate', series.unemployment)}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">VIX (Volatility)</CardTitle>
                  <CardDescription className="mt-1 text-sm flex flex-wrap items-center gap-2">
                    {formatValue('index', metrics.vix_level)}
                    {renderChangeBadge(
                      computeChange(
                        metrics.vix_level ?? null,
                        series.vix?.points?.find((p) => p.value !== null)?.value as number | null,
                        'index'
                      ).direction,
                      computeChange(
                        metrics.vix_level ?? null,
                        series.vix?.points?.find((p) => p.value !== null)?.value as number | null,
                        'index'
                      ).text
                    )}
                  </CardDescription>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  <div className="font-medium">Daily</div>
                  <div className="text-[11px]">{series.vix?.meta.source}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Realized S&P vol (ann.): {formatValue('percent', metrics.realized_vol_annual)}
              </div>
            </CardHeader>
            <CardContent className="pt-2 min-w-0 w-full">
              <MacroChart series={series.vix} range={timeRange} currentValue={metrics.vix_level ?? undefined} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">Top Rising Sectors</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {sectorBreadth?.rising && sectorBreadth.rising.length > 0 ? (
              <div className="space-y-2">
                {sectorBreadth.rising.slice(0, 10).map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.symbol} • {item.provider}
                      </div>
                    </div>
                    <div className={cn('font-semibold', item.returnPct >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {item.returnPct >= 0 ? '+' : ''}{item.returnPct.toFixed(2)}%
                    </div>
                  </div>
                ))}
                {sectorBreadth.warnings.length > 0 && (
                  <div className="mt-2 text-xs text-amber-600">
                    {formatStatusLabel(sectorBreadth.warnings[0])}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {formatStatusLabel(sectorBreadth?.warnings?.[0]) || 'No rising sectors data available'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <CardTitle className="text-base">Top Falling Sectors</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {sectorBreadth?.falling && sectorBreadth.falling.length > 0 ? (
              <div className="space-y-2">
                {sectorBreadth.falling.slice(0, 10).map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.symbol} • {item.provider}
                      </div>
                    </div>
                    <div className={cn('font-semibold', item.returnPct >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {item.returnPct >= 0 ? '+' : ''}{item.returnPct.toFixed(2)}%
                    </div>
                  </div>
                ))}
                {sectorBreadth.warnings.length > 0 && (
                  <div className="mt-2 text-xs text-amber-600">
                    {formatStatusLabel(sectorBreadth.warnings[0])}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {formatStatusLabel(sectorBreadth?.warnings?.[0]) || 'No falling sectors data available'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-5 w-5" />
              World Brief
            </CardTitle>
            <CardDescription>Top geopolitical and macro developments from the last 3 days.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/world-brief">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {worldLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Fetching world brief...
            </div>
          )}
          {worldError && !worldLoading && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{worldError}</AlertDescription>
            </Alert>
          )}
          {!worldLoading && !worldError && (
            <>
              {worldItems.length === 0 ? (
                <Alert variant="default" className="border-amber-300 bg-amber-50/70 dark:bg-amber-900/20">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {formatStatusLabel(worldNote) || 'No headlines available right now. Try expanding to All World or increasing the range.'}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                  {worldItems
                    .filter((item) => !hiddenKeys.includes(`${item.event_id}`))
                    .slice(0, 3)
                    .map((item) => (
                      <div key={item.event_id} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{item.headline}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {item.sources?.[0]?.published_at
                              ? new Date(item.sources[0].published_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                              : ''}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            {item.primary_regions?.[0] || 'Global'}
                          </span>
                          {(item.tags || []).slice(0, 2).map((tag) => (
                            <span key={tag} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{summarizeWorldItem(item)}</p>
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <button
                            onClick={() => toggleHide(`${item.event_id}`)}
                            className="underline text-muted-foreground"
                          >
                            Hide similar
                          </button>
                          <Link href="/world-brief" className="text-primary hover:underline">
                            Open brief
                          </Link>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bottom Navigation */}
      <div className="flex justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard">
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
