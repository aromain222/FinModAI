'use client';

import { useMemo, useState, useEffect, useCallback, startTransition } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  ArrowLeft,
  Newspaper,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { MacroLineChart } from '@/components/charts/MacroLineChart';
import { cn } from '@/lib/utils';
import type { MacroDetail, MacroOverviewResponse } from '@/types/macro';

type TimeRange = '1D' | '1W' | '1M' | '6M' | '1Y' | '5Y';

// Normalize range to '1Y' or '5Y' for chart component
function normalizeRangeForChart(range: TimeRange): '1Y' | '5Y' {
  return range === '5Y' ? '5Y' : '1Y';
}

type MacroPoint = {
  date: string;
  value: number;
};

/**
 * Generate scaled fake history so lines actually move
 * FIXED: Creates proper date ranges spanning the full time period
 */
function generateSeries(
  base: number,
  volatility: number,
  range: TimeRange
): MacroPoint[] {
  const data: MacroPoint[] = [];
  let current = base;
  const now = new Date();
  
  // Determine date increment and number of points based on range
  let dateIncrement: number; // in days
  let points: number;
  
  switch (range) {
    case '1D':
      dateIncrement = 1; // daily
      points = 24; // hourly would be too many, use daily for 1D
      break;
    case '1W':
      dateIncrement = 1; // daily
      points = 7;
      break;
    case '1M':
      dateIncrement = 1; // daily
      points = 30;
      break;
    case '6M':
      dateIncrement = 7; // weekly
      points = 26;
      break;
    case '1Y':
      dateIncrement = 7; // weekly (52 weeks)
      points = 52;
      break;
    case '5Y':
      dateIncrement = 30; // monthly (60 months)
      points = 60;
      break;
  }
  
  // Generate data points going backwards from now
  for (let i = points - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - (i * dateIncrement));
    
    // Add some volatility
    const shock = (Math.random() - 0.5) * volatility;
    current = Math.max(0, current + shock);
    
    data.push({ 
      date: date.toISOString(), 
      value: Number(current.toFixed(2)) 
    });
  }
  
  return data;
}

// REMOVED: formatXAxisLabel - now handled by MacroLineChart component

/**
 * Calculate percent change in a series
 */
function percentChange(series: MacroPoint[]): number {
  if (!series.length) return 0;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

/**
 * Generate AI narrative based on time range and data
 */
function getMacroNarrative(
  range: TimeRange,
  spx: MacroPoint[],
  vix: MacroPoint[],
  fed: MacroPoint[]
): string {
  const spxChg = percentChange(spx);
  const vixChg = percentChange(vix);
  const fedChg = percentChange(fed);

  const riskOn = spxChg > 0 && vixChg <= 0;
  const riskOff = spxChg < 0 && vixChg > 0;

  const horizon =
    range === '1D' ? 'today' :
    range === '1W' ? 'this week' :
    range === '1M' ? 'this month' :
    range === '6M' ? 'the last 6 months' :
    range === '1Y' ? 'the last year' :
    'the last five years';

  if (riskOn) {
    return `Over ${horizon}, risk sentiment has been constructive: the S&P is up roughly ${spxChg.toFixed(
      1
    )}% while the VIX has drifted lower. Fed policy has moved by about ${fedChg.toFixed(
      1
    )}bps over the same window, suggesting markets are comfortable with the current rate path.`;
  }

  if (riskOff) {
    return `Over ${horizon}, markets have traded defensively: the S&P is down about ${Math.abs(
      spxChg
    ).toFixed(
      1
    )}% while the VIX has risen, pointing to higher risk aversion. Shifts in the policy rate of roughly ${fedChg.toFixed(
      1
    )}bps are contributing to the volatility.`;
  }

  return `Over ${horizon}, price action has been more mixed: the S&P has moved about ${spxChg.toFixed(
    1
  )}% and volatility is little changed. This suggests a more range-bound tape while investors wait for clearer signals on growth, inflation, and the Fed.`;
}

export default function MacroDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [expanded, setExpanded] = useState(false);
  const [macroDetail, setMacroDetail] = useState<MacroDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const timeRanges: TimeRange[] = ['1D', '1W', '1M', '6M', '1Y', '5Y'];

  // Memoize fetch function to prevent recreation on every render
  const fetchDetailedBreakdown = useCallback(async () => {
    try {
      console.time('[MacroDashboard] fetchDetailedBreakdown');
      setLoadingDetail(true);
      setDetailError(null);

      const response = await fetch(`/api/macro/overview?horizon=${timeRange}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch detailed breakdown');
      }

      const data: MacroOverviewResponse = await response.json();
      startTransition(() => {
        setMacroDetail(data.detailedBreakdown);
      });
    } catch (error) {
      console.error('[MacroDashboard] Failed to fetch detail:', error);
      setDetailError('Couldn\'t load full breakdown, showing high-level view only.');
    } finally {
      setLoadingDetail(false);
      console.timeEnd('[MacroDashboard] fetchDetailedBreakdown');
    }
  }, [timeRange]);

  // Fetch detailed breakdown when expanded or horizon changes
  useEffect(() => {
    if (expanded) {
      fetchDetailedBreakdown();
    }
  }, [expanded, fetchDetailedBreakdown]);

  const handleToggleExpand = useCallback(() => {
    startTransition(() => {
      setExpanded(prev => !prev);
    });
  }, []);

  // Generate dynamic data based on time range
  // FIXED: Pass range directly to generateSeries so it creates proper date spans
  const fedFundsData = useMemo(
    () => generateSeries(5.33, 0.08, timeRange),
    [timeRange]
  );

  const tenYearData = useMemo(
    () => generateSeries(4.45, 0.15, timeRange),
    [timeRange]
  );

  const cpiData = useMemo(
    () => generateSeries(3.2, 0.12, timeRange),
    [timeRange]
  );

  const sp500Data = useMemo(
    () => generateSeries(4800, 40, timeRange),
    [timeRange]
  );

  const unemploymentData = useMemo(
    () => generateSeries(3.9, 0.06, timeRange),
    [timeRange]
  );

  const vixData = useMemo(
    () => generateSeries(13, 0.35, timeRange),
    [timeRange]
  );

  // Generate AI narrative (memoized to prevent recalculation on every render)
  const aiNarrative = useMemo(
    () => getMacroNarrative(timeRange, sp500Data, vixData, fedFundsData),
    [timeRange, sp500Data, vixData, fedFundsData]
  );

  // Get horizon label for display
  const getHorizonLabel = (range: TimeRange): string => {
    switch (range) {
      case '1D': return '1 Day';
      case '1W': return '1 Week';
      case '1M': return '1 Month';
      case '6M': return '6 Months';
      case '1Y': return '1 Year';
      case '5Y': return '5 Years';
    }
  };

  // Memoize calculation functions to prevent recreation
  const getCurrentValue = useCallback((data: MacroPoint[]) => data[data.length - 1]?.value || 0, []);
  const getChange = useCallback((data: MacroPoint[]) => percentChange(data), []);

  return (
    <div className="space-y-6">
      {/* Header with Back Button and Time Range Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Time range:</span>
          <div className="flex gap-2">
            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => {
                  startTransition(() => {
                    setTimeRange(range);
                  });
                }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs border transition',
                  timeRange === range
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground hover:border-primary/40'
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Macro Overview - Expandable */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Macro Overview
              </CardTitle>
              <CardDescription className="mt-1">
                Summary is automatically tailored to the selected horizon ({getHorizonLabel(timeRange)})
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleExpand}
              className="flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary (always visible) */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {aiNarrative}
          </p>

          {/* Expanded content */}
          {expanded && (
            <>
              <div className="h-px w-full bg-border" />

              {loadingDetail && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Fetching detailed view…</span>
                </div>
              )}

              {detailError && !loadingDetail && (
                <p className="text-xs text-destructive py-2">
                  {detailError}
                </p>
              )}

              {!loadingDetail && !detailError && macroDetail && (
                <div className="grid gap-6 md:grid-cols-2">
                  {/* What's Working */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      What&apos;s Working
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {macroDetail.whatsWorking.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-green-600 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* What's Struggling */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      What&apos;s Struggling
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {macroDetail.whatsStruggling.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-red-600 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Cross-Asset Read */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                      Cross-Asset Read
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {macroDetail.crossAssetRead.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-blue-600 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Risk Flags / Watchlist */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <span className="text-amber-600">⚠</span>
                      Risk Flags / Watchlist
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {macroDetail.riskFlags.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-amber-600 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Fed Funds Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fed Funds Rate
            </CardTitle>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {getCurrentValue(fedFundsData).toFixed(2)}%
              </span>
              <ChangeIndicator change={getChange(fedFundsData)} />
            </div>
          </CardHeader>
          <CardContent>
            <MacroLineChart 
              data={fedFundsData} 
              range={normalizeRangeForChart(timeRange)}
              height={60}
            />
          </CardContent>
        </Card>

        {/* 10Y Treasury */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              10Y Treasury
            </CardTitle>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {getCurrentValue(tenYearData).toFixed(2)}%
              </span>
              <ChangeIndicator change={getChange(tenYearData)} />
            </div>
          </CardHeader>
          <CardContent>
            <MacroLineChart 
              data={tenYearData} 
              range={normalizeRangeForChart(timeRange)}
              height={60}
            />
          </CardContent>
        </Card>

        {/* CPI */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              CPI (YoY)
            </CardTitle>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {getCurrentValue(cpiData).toFixed(1)}%
              </span>
              <ChangeIndicator change={getChange(cpiData)} />
            </div>
          </CardHeader>
          <CardContent>
            <MacroLineChart 
              data={cpiData} 
              range={normalizeRangeForChart(timeRange)}
              height={60}
            />
          </CardContent>
        </Card>
      </div>

      {/* Large Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* S&P 500 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">S&P 500</CardTitle>
            <CardDescription>
              {getCurrentValue(sp500Data).toLocaleString()} 
              <ChangeIndicator change={getChange(sp500Data)} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MacroLineChart 
              data={sp500Data} 
              range={normalizeRangeForChart(timeRange)}
              height={260}
            />
          </CardContent>
        </Card>

        {/* Unemployment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unemployment Rate</CardTitle>
            <CardDescription>
              {getCurrentValue(unemploymentData).toFixed(1)}% 
              <ChangeIndicator change={getChange(unemploymentData)} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MacroLineChart 
              data={unemploymentData} 
              range={normalizeRangeForChart(timeRange)}
              height={260}
            />
          </CardContent>
        </Card>

        {/* VIX */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">VIX (Volatility Index)</CardTitle>
            <CardDescription>
              {getCurrentValue(vixData).toFixed(1)} 
              <ChangeIndicator change={getChange(vixData)} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MacroLineChart 
              data={vixData} 
              range={normalizeRangeForChart(timeRange)}
              height={260}
            />
          </CardContent>
        </Card>
      </div>

      {/* Macro News Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-5 w-5" />
            Macro Headlines
          </CardTitle>
          <CardDescription>
            Recent macro news and market insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 pb-3 border-b">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-green-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Fed Signals Potential Rate Cuts in 2025
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bloomberg • 2h ago
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 pb-3 border-b">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Labor Market Shows Resilience
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  WSJ • 5h ago
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-green-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Treasury Yields Fall on Policy Pivot Bets
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Reuters • 8h ago
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full mt-3">
              <Link href="/macro/news">
                View all macro news
              </Link>
            </Button>
          </div>
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

/**
 * Change Indicator Component
 */
function ChangeIndicator({ change }: { change: number }) {
  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.01;

  if (isNeutral) {
    return (
      <span className="text-xs text-muted-foreground">
        (—)
      </span>
    );
  }

  return (
    <span className={`text-xs flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {isPositive ? '+' : ''}{change.toFixed(1)}%
    </span>
  );
}
