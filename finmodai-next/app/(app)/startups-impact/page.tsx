'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Search, RefreshCw, Flame, Filter } from 'lucide-react';
import { StartupImpactCard } from '@/components/startups/StartupImpactCard';
import { cn } from '@/lib/utils';
import type { StartupsApiResponse } from '@/lib/data/types';
import type { StartupRow, Timeframe, SignalType, SignalConfidence } from '@/types/startups';
import { convertToStartupRows } from '@/lib/data/normalizeStartups';

const TIME_RANGES: { value: Timeframe; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
];

const SECTORS = ['AI', 'Fintech', 'DevTools', 'Healthcare', 'Climate', 'Consumer', 'Enterprise', 'Crypto'];

const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'mentions', label: 'Mentions' },
  { value: 'funding', label: 'Funding' },
  { value: 'hiring', label: 'Hiring' },
  { value: 'layoffs', label: 'Layoffs' },
  { value: 'regulation', label: 'Regulation' },
  { value: 'lawsuit', label: 'Legal' },
  { value: 'partnership', label: 'Partnerships' },
  { value: 'product', label: 'Product' },
  { value: 'press', label: 'Press' },
];

const CONFIDENCE_LEVELS: SignalConfidence[] = ['high', 'medium', 'low'];

async function fetchStartups(): Promise<StartupsApiResponse> {
  const response = await fetch('/api/startups?mode=live');
  if (!response.ok) {
    throw new Error('Failed to fetch startups');
  }
  return response.json();
}

export default function StartupsImpactPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<SignalType[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<SignalConfidence[]>(['high', 'medium', 'low']);
  const [showFilters, setShowFilters] = useState(false);
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
    queryKey: ['startups', timeframe],
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

  const toggleSignalType = (type: SignalType) => {
    setSelectedSignalTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleConfidence = (confidence: SignalConfidence) => {
    setSelectedConfidence((prev) =>
      prev.includes(confidence) ? prev.filter((c) => c !== confidence) : [...prev, confidence]
    );
  };

  // Convert to StartupRow format with impact scoring
  const startupRows: StartupRow[] = data?.startups
    ? convertToStartupRows(data.startups, timeframe)
    : [];

  // Apply filters
  const filterStartups = (startups: StartupRow[]) => {
    let filtered = startups;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.oneLiner.toLowerCase().includes(query) ||
          s.sector.toLowerCase().includes(query)
      );
    }

    // Sector filter
    if (selectedSector) {
      filtered = filtered.filter((s) => s.sector === selectedSector);
    }

    // Signal type filter
    if (selectedSignalTypes.length > 0) {
      filtered = filtered.filter((s) =>
        s.signals.some((signal) => selectedSignalTypes.includes(signal.type))
      );
    }

    // Confidence filter
    if (selectedConfidence.length > 0 && selectedConfidence.length < 3) {
      filtered = filtered.filter((s) =>
        s.signals.some((signal) => selectedConfidence.includes(signal.confidence))
      );
    }

    return filtered;
  };

  const filteredStartups = filterStartups(startupRows);

  // Split into trending up and down
  const trendingUp = filteredStartups
    .filter((s) => s.impact.netImpact > 0)
    .sort((a, b) => b.impact.netImpact - a.impact.netImpact)
    .slice(0, 25)
    .map((s, idx) => ({ ...s, rank: idx + 1 }));

  const trendingDown = filteredStartups
    .filter((s) => s.impact.netImpact <= 0)
    .sort((a, b) => a.impact.netImpact - b.impact.netImpact)
    .slice(0, 25)
    .map((s, idx) => ({ ...s, rank: idx + 1 }));

  const loading = isLoading || isFetching;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black">
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Impact-Weighted Signals</h1>
            <p className="text-slate-400 text-lg">
              Institutional-grade momentum tracking with transparent, explainable scoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.dataMode === 'live' ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
                Live Data
              </Badge>
            ) : (
              <Badge className="bg-slate-700/50 text-slate-300 border border-slate-600/30 px-3 py-1">
                Demo Data
              </Badge>
            )}
            <Button
              onClick={() => refetch()}
              disabled={loading}
              variant="outline"
              size="sm"
              className="border-white/5"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          {/* Time Range + Search + Filter Toggle */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Time Range Toggle */}
            <div className="flex items-center gap-2 bg-slate-950/60 border border-white/5 rounded-lg p-1">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeframe(range.value)}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-all',
                    timeframe === range.value
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-900/60'
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Search startups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-950/60 border-white/5 text-white placeholder:text-slate-500 focus:border-emerald-500/50"
                />
              </div>

              {/* Filter Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'border-white/5',
                  showFilters && 'bg-emerald-600 text-white border-emerald-500'
                )}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {(selectedSignalTypes.length > 0 || selectedConfidence.length < 3 || selectedSector) && (
                  <Badge className="ml-2 bg-emerald-500 text-white">
                    {(selectedSignalTypes.length > 0 ? 1 : 0) +
                      (selectedConfidence.length < 3 ? 1 : 0) +
                      (selectedSector ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Advanced Filters (Expandable) */}
          {showFilters && (
            <div className="bg-slate-950/60 border border-white/5 rounded-xl p-4 space-y-4">
              {/* Sector Filters */}
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Sector</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedSector(null)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      selectedSector === null
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900/60 border border-white/5 text-slate-400 hover:text-slate-300'
                    )}
                  >
                    All
                  </button>
                  {SECTORS.map((sector) => (
                    <button
                      key={sector}
                      onClick={() => setSelectedSector(sector)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                        selectedSector === sector
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900/60 border border-white/5 text-slate-400 hover:text-slate-300'
                      )}
                    >
                      {sector}
                    </button>
                  ))}
                </div>
              </div>

              {/* Signal Type Filters */}
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                  Signal Types
                </div>
                <div className="flex flex-wrap gap-2">
                  {SIGNAL_TYPES.map((signal) => (
                    <button
                      key={signal.value}
                      onClick={() => toggleSignalType(signal.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                        selectedSignalTypes.includes(signal.value)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900/60 border border-white/5 text-slate-400 hover:text-slate-300'
                      )}
                    >
                      {signal.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Confidence Filters */}
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                  Confidence
                </div>
                <div className="flex flex-wrap gap-2">
                  {CONFIDENCE_LEVELS.map((confidence) => (
                    <button
                      key={confidence}
                      onClick={() => toggleConfidence(confidence)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
                        selectedConfidence.includes(confidence)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900/60 border border-white/5 text-slate-400 hover:text-slate-300'
                      )}
                    >
                      {confidence}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error State */}
        {isError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center">
            <p className="text-rose-400 mb-4">Failed to load startup data</p>
            <Button onClick={() => refetch()} variant="outline" className="border-rose-500">
              Try Again
            </Button>
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
              Trending Up ({trendingUp.length})
            </TabsTrigger>
            <TabsTrigger
              value="down"
              className="data-[state=active]:bg-rose-600 data-[state=active]:text-white rounded-md transition-all"
            >
              <TrendingDown className="mr-2 h-4 w-4" />
              Trending Down ({trendingDown.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="up" className="mt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400">Loading startups...</p>
              </div>
            ) : trendingUp.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <Flame className="h-12 w-12 text-slate-600 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No startups found</h3>
                <p className="text-slate-400">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trendingUp.map((startup) => (
                  <StartupImpactCard
                    key={startup.id}
                    startup={startup}
                    isWatchlisted={watchlist.has(startup.id)}
                    onToggleWatchlist={toggleWatchlist}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="down" className="mt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <div className="h-8 w-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400">Loading startups...</p>
              </div>
            ) : trendingDown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
                <TrendingDown className="h-12 w-12 text-slate-600 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No startups found</h3>
                <p className="text-slate-400">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trendingDown.map((startup) => (
                  <StartupImpactCard
                    key={startup.id}
                    startup={startup}
                    isWatchlisted={watchlist.has(startup.id)}
                    onToggleWatchlist={toggleWatchlist}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

