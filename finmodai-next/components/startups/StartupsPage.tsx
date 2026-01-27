'use client';

import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, TrendingUp, Calendar, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STARTUPS, IPO_CANDIDATES, LAST_UPDATED, type StartupSector } from '@/lib/startups/data';
import { StartupCard } from './StartupCard';
import { IPOCard } from './IPOCard';

const SECTORS: StartupSector[] = ['AI', 'Fintech', 'DevTools', 'Healthcare', 'Climate', 'Consumer', 'Enterprise', 'Crypto'];

export default function StartupsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<StartupSector | 'all'>('all');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // Load watchlist from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('startup-watchlist');
        if (saved) {
          setWatchlist(new Set(JSON.parse(saved)));
        }
      } catch (err) {
        console.error('[StartupsPage] Failed to load watchlist:', err);
      }
    }
  }, []);

  // Save watchlist to localStorage
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
          console.error('[StartupsPage] Failed to save watchlist:', err);
        }
      }
      
      return next;
    });
  };

  // Deterministic rotation based on date
  const rotatedStartups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    const shuffled = [...STARTUPS];
    let currentIndex = shuffled.length;
    
    const seededRandom = (s: number) => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
    
    let seedValue = seed;
    while (currentIndex > 0) {
      const randomIndex = Math.floor(seededRandom(seedValue++) * currentIndex);
      currentIndex--;
      [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
    }
    
    return shuffled;
  }, []);

  const rotatedIPOs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + 1000; // Different seed
    
    const shuffled = [...IPO_CANDIDATES];
    let currentIndex = shuffled.length;
    
    const seededRandom = (s: number) => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
    
    let seedValue = seed;
    while (currentIndex > 0) {
      const randomIndex = Math.floor(seededRandom(seedValue++) * currentIndex);
      currentIndex--;
      [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
    }
    
    return shuffled;
  }, []);

  // Filter and sort startups
  const filteredStartups = useMemo(() => {
    const filtered = rotatedStartups.filter((startup) => {
      const matchesSearch = !searchQuery || 
        startup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        startup.thesis.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSector = selectedSector === 'all' || startup.sector === selectedSector;
      
      return matchesSearch && matchesSector;
    });
    
    // Sort by momentum DESC, then name ASC (stable tie-breaker)
    return filtered.sort((a, b) => {
      const momentumDiff = (b.momentum || 0) - (a.momentum || 0);
      if (momentumDiff !== 0) return momentumDiff;
      return a.name.localeCompare(b.name);
    });
  }, [rotatedStartups, searchQuery, selectedSector]);

  // Filter and sort IPO candidates
  const filteredIPOs = useMemo(() => {
    const filtered = rotatedIPOs.filter((ipo) => {
      const matchesSearch = !searchQuery || 
        ipo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ipo.riskNotes.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSector = selectedSector === 'all' || ipo.sector === selectedSector;
      
      return matchesSearch && matchesSector;
    });
    
    // Sort by momentum DESC, then name ASC (stable tie-breaker)
    return filtered.sort((a, b) => {
      const momentumDiff = (b.momentum || 0) - (a.momentum || 0);
      if (momentumDiff !== 0) return momentumDiff;
      return a.name.localeCompare(b.name);
    });
  }, [rotatedIPOs, searchQuery, selectedSector]);

  // Calculate sector momentum
  const sectorMomentum = useMemo(() => {
    const momentum: Record<string, number> = {};
    STARTUPS.forEach((startup) => {
      if (!momentum[startup.sector]) momentum[startup.sector] = 0;
      momentum[startup.sector] += startup.momentum;
    });
    
    const sorted = Object.entries(momentum)
      .map(([sector, score]) => ({ sector, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    return sorted;
  }, []);

  // Extract trending themes
  const trendingThemes = useMemo(() => {
    const themes: Record<string, number> = {};
    STARTUPS.forEach((startup) => {
      startup.signals.forEach((signal) => {
        themes[signal] = (themes[signal] || 0) + 1;
      });
    });
    
    return Object.entries(themes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }, []);

  return (
    <div className="space-y-6">
      {/* Pulse Strip */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-slate-200">This Week&apos;s Themes</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {trendingThemes.map((theme) => (
                  <Badge key={theme} variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">
                    {theme}
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
                {sectorMomentum.map(({ sector }) => (
                  <Badge key={sector} variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">
                    {sector}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 text-slate-400">
                Demo seed data
              </Badge>
              <span className="text-slate-500">
                <Sparkles className="h-3 w-3 inline mr-1" />
                Rotated daily
              </span>
            </div>
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
                  No startups found for the selected filters
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredStartups.map((startup) => (
              <StartupCard
                key={startup.id}
                startup={startup}
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
                  No IPO candidates found for the selected filters
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredIPOs.map((ipo) => (
              <IPOCard
                key={ipo.id}
                ipo={ipo}
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

