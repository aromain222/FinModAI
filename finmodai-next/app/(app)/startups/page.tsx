'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, Search, RefreshCw, Flame, Rocket } from 'lucide-react';
import { StartupLeaderboard } from '@/components/startups/StartupLeaderboard';
import { cn } from '@/lib/utils';
import type { StartupsApiResponse, StartupCard } from '@/lib/data/types';

interface StartupWithRank extends StartupCard {
  rank: number;
  direction: 'up' | 'down';
}

async function fetchStartups(): Promise<StartupsApiResponse> {
  const response = await fetch('/api/startups');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch startups');
  }
  return response.json();
}

const TIME_RANGES = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
] as const;

const SECTORS = [
  'AI',
  'Fintech',
  'DevTools',
  'Healthcare',
  'Climate',
  'Consumer',
  'Enterprise',
  'Crypto',
] as const;

export default function StartupsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('startup-watchlist');
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

  // React Query for data fetching
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['startups', timeRange, selectedSector],
    queryFn: fetchStartups,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('startup-watchlist', JSON.stringify(Array.from(next)));
        } catch (error) {
          console.error('[Startups] Failed to save watchlist:', error);
        }
      }

      return next;
    });
  };

  // Process startups (whyTrending is already string[] from API)
  const processedStartups = (() => {
    if (!data?.startups) return { trendingUp: [], trendingDown: [] };

    // Filter by sector if selected
    let allStartups = [...data.startups];
    if (selectedSector) {
      allStartups = allStartups.filter((s) => s.sector === selectedSector);
    }

    // Split into trending up (>0) and trending down (<=0)
    const trendingUp: StartupWithRank[] = allStartups
      .filter((s) => s.momentumScore > 0)
      .sort((a, b) => b.momentumScore - a.momentumScore)
      .slice(0, 25)
      .map((s, idx) => ({
        ...s,
        rank: idx + 1,
        direction: 'up' as const,
      }));

    const trendingDown: StartupWithRank[] = allStartups
      .filter((s) => s.momentumScore <= 0)
      .sort((a, b) => a.momentumScore - b.momentumScore) // Most negative first
      .slice(0, 25)
      .map((s, idx) => ({
        ...s,
        rank: idx + 1,
        direction: 'down' as const,
      }));

    return { trendingUp, trendingDown };
  })();

  const filterStartups = (startups: StartupWithRank[]) => {
    if (!searchQuery) return startups;
    const query = searchQuery.toLowerCase();
    return startups.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.sector.toLowerCase().includes(query)
    );
  };

  const filteredUp = filterStartups(processedStartups.trendingUp);
  const filteredDown = filterStartups(processedStartups.trendingDown);

  const loading = isLoading || isFetching;

  // Debug info (dev only)
  const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isDemoMode = data?.dataMode === 'demo';
  const debugInfo = {
    mode: data?.dataMode || 'unknown',
    count: data?.startups?.length || 0,
    endpoint: '/api/startups',
    hasFilters: selectedSector !== null || searchQuery !== '',
    error: (data as any)?.error,
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedSector(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black">
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
        {/* Debug Banner (Dev Only) */}
        {isDev && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs font-mono">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div><span className="text-yellow-400">Mode:</span> {debugInfo.mode}</div>
                <div><span className="text-yellow-400">Count:</span> {debugInfo.count}</div>
                <div><span className="text-yellow-400">Endpoint:</span> {debugInfo.endpoint}</div>
                {debugInfo.error && <div><span className="text-red-400">Error:</span> {debugInfo.error}</div>}
                {debugInfo.count === 0 && (
                  <div className="text-yellow-300 mt-2">
                    ⚠️ No startups: {debugInfo.hasFilters ? 'Filters active' : debugInfo.error ? 'Request failed' : 'Empty response'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Startup Intelligence</h1>
            <p className="text-slate-400 text-lg">
              Real-time momentum tracking powered by GDELT and SEC filings
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isDemoMode ? (
              <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-3 py-1.5 font-semibold">
                🎭 DEMO MODE
              </Badge>
            ) : data?.dataMode === 'live' ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
                Live Data
              </Badge>
            ) : null}
            <button
              onClick={() => refetch()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/60 border border-white/5 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          {/* Time Range + Search */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Time Range Toggle */}
            <div className="flex items-center gap-2 bg-slate-950/60 border border-white/5 rounded-lg p-1">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-all',
                    timeRange === range.value
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-900/60'
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search startups, sectors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-950/60 border-white/5 text-white placeholder:text-slate-500 focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Sector Filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSector(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                selectedSector === null
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900/60 border border-white/5 text-slate-400 hover:text-slate-300 hover:border-white/10'
              )}
            >
              All Sectors
            </button>
            {SECTORS.map((sector) => (
              <button
                key={sector}
                onClick={() => setSelectedSector(sector)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  selectedSector === sector
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900/60 border border-white/5 text-slate-400 hover:text-slate-300 hover:border-white/10'
                )}
              >
                {sector}
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {isError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <h3 className="text-xl font-semibold text-white">Failed to load startup data</h3>
              <p className="text-rose-400 text-sm">
                {debugInfo.error || 'An error occurred while fetching data from GDELT and SEC EDGAR.'}
              </p>
              <div className="text-slate-400 text-xs space-y-1">
                <p>Possible reasons:</p>
                <ul className="list-disc list-inside text-left inline-block">
                  <li>API rate limits exceeded</li>
                  <li>Network connectivity issues</li>
                  <li>GDELT or SEC EDGAR temporarily unavailable</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => refetch()}
                  className="px-6 py-2.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors font-medium"
                >
                  Try Again
                </button>
                {!isDemoMode && (
                  <button
                    onClick={() => window.location.href = '/startups?demo=true'}
                    className="px-6 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium"
                  >
                    View Demo Data
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboards */}
        <Tabs defaultValue="up" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-950/60 border border-white/5 p-1">
            <TabsTrigger
              value="up"
              className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-md transition-all"
            >
              <Flame className="mr-2 h-4 w-4" />
              Trending Up ({filteredUp.length})
            </TabsTrigger>
            <TabsTrigger
              value="down"
              className="data-[state=active]:bg-rose-600 data-[state=active]:text-white rounded-md transition-all"
            >
              <TrendingDown className="mr-2 h-4 w-4" />
              Trending Down ({filteredDown.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="up" className="mt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400">Loading startups...</p>
              </div>
            ) : filteredUp.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <Rocket className="h-12 w-12 text-slate-600 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No trending up startups</h3>
                <div className="text-center max-w-md space-y-2 mb-6">
                  {searchQuery || selectedSector ? (
                    <>
                      <p className="text-slate-400">
                        No results matching your filters:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
	                        {searchQuery && (
	                          <Badge variant="outline" className="text-slate-300">
	                            Search: &quot;{searchQuery}&quot;
	                          </Badge>
	                        )}
                        {selectedSector && (
                          <Badge variant="outline" className="text-slate-300">
                            Sector: {selectedSector}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-slate-300">
                          Window: {timeRange}
                        </Badge>
                      </div>
                    </>
                  ) : (
	                    <p className="text-slate-400">
	                      No startups with positive momentum in the {timeRange} window.
	                      <br />
	                      Try expanding the time window or check &quot;Trending Down&quot;.
	                    </p>
	                  )}
                </div>
                {(searchQuery || selectedSector) && (
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <StartupLeaderboard
                startups={filteredUp.map((s) => ({
                  ...s,
                  isWatchlisted: watchlist.has(s.id),
                }))}
                direction="up"
                onToggleWatchlist={toggleWatchlist}
              />
            )}
          </TabsContent>

          <TabsContent value="down" className="mt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <div className="h-8 w-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400">Loading startups...</p>
              </div>
            ) : filteredDown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <TrendingDown className="h-12 w-12 text-slate-600 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No trending down startups</h3>
                <div className="text-center max-w-md space-y-2 mb-6">
                  {searchQuery || selectedSector ? (
                    <>
                      <p className="text-slate-400">
                        No results matching your filters:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
	                        {searchQuery && (
	                          <Badge variant="outline" className="text-slate-300">
	                            Search: &quot;{searchQuery}&quot;
	                          </Badge>
	                        )}
                        {selectedSector && (
                          <Badge variant="outline" className="text-slate-300">
                            Sector: {selectedSector}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-slate-300">
                          Window: {timeRange}
                        </Badge>
                      </div>
                    </>
                  ) : (
	                    <p className="text-slate-400">
	                      No startups with negative momentum in the {timeRange} window.
	                      <br />
	                      Try expanding the time window or check &quot;Trending Up&quot;.
	                    </p>
	                  )}
                </div>
                {(searchQuery || selectedSector) && (
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <StartupLeaderboard
                startups={filteredDown.map((s) => ({
                  ...s,
                  isWatchlisted: watchlist.has(s.id),
                }))}
                direction="down"
                onToggleWatchlist={toggleWatchlist}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
