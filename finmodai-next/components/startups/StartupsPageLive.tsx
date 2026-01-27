/**
 * Startups Page - Live Data Mode
 * Fetches real-time data from /api/startups
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, TrendingUp, Calendar, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StartupCard } from './StartupCard';
import { EnhancedStartupCard } from './EnhancedStartupCard';
import { IPOCard } from './IPOCard';
import type { StartupsApiResponse, StartupSector } from '@/lib/data/types';

const SECTORS: StartupSector[] = ['AI', 'Fintech', 'DevTools', 'Healthcare', 'Climate', 'Consumer', 'Enterprise', 'Crypto'];

export default function StartupsPageLive() {
  const [data, setData] = useState<StartupsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<StartupSector | 'all'>('all');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [window, setWindow] = useState<'1d' | '3d' | '7d' | '30d'>('7d');

  // Load watchlist from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('startup-watchlist');
        if (saved) {
          setWatchlist(new Set(JSON.parse(saved)));
        }
      } catch (err) {
        console.error('[StartupsPageLive] Failed to load watchlist:', err);
      }
    }
  }, []);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`[StartupsPageLive] Fetching data (window: ${window})...`);
      const response = await fetch(`/api/startups?window=${window}&mode=live`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch startups data');
      }
      
      const json = await response.json();
      setData(json);
      
      console.log(`[StartupsPageLive] ✅ Loaded ${json.startups?.length || 0} startups`);
    } catch (err) {
      console.error('[StartupsPageLive] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [window]);

  // Save watchlist
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
        } catch (err) {
          console.error('[StartupsPageLive] Failed to save watchlist:', err);
        }
      }
      
      return next;
    });
  };

  // Filter and sort startups
  const filteredStartups = useMemo(() => {
    if (!data?.startups) return [];
    
    const filtered = data.startups.filter((startup) => {
      const matchesSearch = !searchQuery || 
        startup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        startup.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSector = selectedSector === 'all' || startup.sector === selectedSector;
      
      return matchesSearch && matchesSector;
    });
    
    // Sort by momentumScore DESC, then name ASC (stable tie-breaker)
    return filtered.sort((a, b) => {
      const momentumDiff = (b.momentumScore || 0) - (a.momentumScore || 0);
      if (momentumDiff !== 0) return momentumDiff;
      return a.name.localeCompare(b.name);
    });
  }, [data?.startups, searchQuery, selectedSector]);

  // Filter and sort IPO candidates
  const filteredIPOs = useMemo(() => {
    if (!data?.ipoWatch) return [];
    
    const filtered = data.ipoWatch.filter((ipo) => {
      const matchesSearch = !searchQuery || 
        ipo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ipo.issuer.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSector = selectedSector === 'all' || ipo.sector === selectedSector;
      
      return matchesSearch && matchesSector;
    });
    
    // Sort by ipoProbabilityScore DESC, then lastFilingDate DESC, then name ASC
    return filtered.sort((a, b) => {
      const scoreDiff = (b.ipoProbabilityScore || 0) - (a.ipoProbabilityScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      
      const dateA = new Date(a.lastFilingDate || 0).getTime();
      const dateB = new Date(b.lastFilingDate || 0).getTime();
      const dateDiff = dateB - dateA;
      if (dateDiff !== 0) return dateDiff;
      
      return a.name.localeCompare(b.name);
    });
  }, [data?.ipoWatch, searchQuery, selectedSector]);

  // Format last updated
  const formatLastUpdated = () => {
    if (!data?.updatedAt) return '';
    const date = new Date(data.updatedAt);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="inline-block h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Loading live data...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take 30-60 seconds</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-12 text-center">
          <AlertCircle className="inline-block h-8 w-8 text-destructive mb-3" />
          <p className="text-destructive font-medium">{error}</p>
          <Button onClick={fetchData} className="mt-4" variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pulse Strip */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-slate-200">Trending Themes</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data?.themes?.slice(0, 5).map((theme) => (
                  <Badge key={theme.theme} variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">
                    {theme.theme} ({theme.count})
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-slate-200">Most Active Sectors</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data?.activeSectors?.slice(0, 3).map((sector) => (
                  <Badge key={sector.sector} variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">
                    {sector.sector} ({sector.startupCount})
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {data?.dataMode === 'live' ? (
                <Badge variant="outline" className="border-emerald-700/50 text-emerald-400 bg-emerald-950/20">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                  Live data
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-700 text-slate-400">
                  Demo seed data
                </Badge>
              )}
              {data?.dataMode === 'live' && (
                <span className="text-slate-500">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {formatLastUpdated()}
                </span>
              )}
            </div>
            <Button
              onClick={fetchData}
              disabled={loading}
              variant="ghost"
              size="sm"
              className="h-7 text-xs hover:bg-slate-800"
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search startups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedSector('all')}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-2 text-sm transition',
              selectedSector === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            All
          </button>
          {SECTORS.map((sector) => (
            <button
              key={sector}
              onClick={() => setSelectedSector(sector)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-2 text-sm transition',
                selectedSector === sector
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {sector}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="hot" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hot">
            <TrendingUp className="mr-2 h-4 w-4" />
            Hot Startups ({filteredStartups.length})
          </TabsTrigger>
          <TabsTrigger value="ipo">
            <Calendar className="mr-2 h-4 w-4" />
            IPO Watch ({filteredIPOs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hot" className="mt-6 space-y-4">
          {filteredStartups.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {loading ? 'Loading startups...' : 'No startups found for the selected filters'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredStartups.map((startup, idx) => (
              <EnhancedStartupCard
                key={startup.id}
                startup={startup as any}
                isWatchlisted={watchlist.has(startup.id)}
                onToggleWatchlist={() => toggleWatchlist(startup.id)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="ipo" className="mt-6 space-y-4">
          {filteredIPOs.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {loading ? 'Loading IPO candidates...' : 'No IPO candidates found for the selected filters'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredIPOs.map((ipo) => (
              <IPOCard
                key={ipo.id}
                ipo={ipo as any}
                isWatchlisted={watchlist.has(ipo.id)}
                onToggleWatchlist={() => toggleWatchlist(ipo.id)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

