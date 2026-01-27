"use client";

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Star, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Startup {
  id: string;
  name: string;
  description: string;
  sector: string;
  momentumScore: number;
  velocityChange: number;
  whyTrending: string;
  themes?: string[];
}

interface StartupsLeaderboardProps {
  startups: Startup[];
  watchlist: Set<string>;
  onToggleWatchlist: (id: string) => void;
}

const THEME_COLORS: Record<string, string> = {
  AI: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Fintech: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Security: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DevTools: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Healthcare: 'bg-red-500/10 text-red-400 border-red-500/20',
  Climate: 'bg-green-500/10 text-green-400 border-green-500/20',
  Enterprise: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  Crypto: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Consumer: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

export function StartupsLeaderboard({ startups, watchlist, onToggleWatchlist }: StartupsLeaderboardProps) {
  const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');
  
  const { trendingUp, trendingDown } = useMemo(() => {
    const sorted = [...startups].sort((a, b) => b.momentumScore - a.momentumScore);
    return {
      trendingUp: sorted.slice(0, 25),
      trendingDown: sorted.slice(-25).reverse(),
    };
  }, [startups]);
  
  const displayList = activeTab === 'up' ? trendingUp : trendingDown;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-1">Startups Intelligence</h1>
          <p className="text-body-muted mt-1">
            Real-time momentum tracking across private markets
          </p>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('up')}
          className={cn(
            activeTab === 'up' ? 'tab-institutional-active' : 'tab-institutional'
          )}
        >
          <TrendingUp className="inline-block w-4 h-4 mr-2" />
          Trending Up
          <span className="ml-2 text-xs opacity-60">Top 25</span>
        </button>
        <button
          onClick={() => setActiveTab('down')}
          className={cn(
            activeTab === 'down' ? 'tab-institutional-active' : 'tab-institutional'
          )}
        >
          <TrendingDown className="inline-block w-4 h-4 mr-2" />
          Trending Down
          <span className="ml-2 text-xs opacity-60">Bottom 25</span>
        </button>
      </div>
      
      {/* Leaderboard */}
      <div className="space-y-3">
        {displayList.map((startup, index) => {
          const rank = index + 1;
          const isTop3 = rank <= 3;
          const isWatchlisted = watchlist.has(startup.id);
          const isPositive = startup.velocityChange > 0;
          
          return (
            <div
              key={startup.id}
              className={cn(
                isTop3 ? 'leaderboard-card-top' : 'leaderboard-card',
                isTop3 && 'glow-emerald'
              )}
            >
              {/* Rank */}
              <div className={cn(
                isTop3 ? 'leaderboard-rank-top' : 'leaderboard-rank'
              )}>
                {rank}
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-heading-4 truncate">{startup.name}</h3>
                      {isTop3 && (
                        <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-body-muted text-xs line-clamp-1">
                      {startup.description}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => onToggleWatchlist(startup.id)}
                    className={cn(
                      'flex-shrink-0 p-2 rounded-lg transition-all duration-200',
                      isWatchlisted
                        ? 'text-yellow-400 bg-yellow-500/10'
                        : 'text-slate-500 hover:text-yellow-400 hover:bg-slate-900/40'
                    )}
                  >
                    <Star className={cn('w-5 h-5', isWatchlisted && 'fill-current')} />
                  </button>
                </div>
                
                {/* Themes */}
                {startup.themes && startup.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {startup.themes.slice(0, 3).map((theme) => (
                      <span
                        key={theme}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium border',
                          THEME_COLORS[theme] || 'bg-slate-800/50 text-slate-400 border-slate-700/50'
                        )}
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
                
	                {/* Why Trending */}
	                <div className="mb-3 p-3 rounded-lg bg-slate-900/40 border border-white/5">
	                  <div className="text-label mb-1.5">Why It&apos;s Trending</div>
	                  <p className="text-body text-xs leading-relaxed">
	                    {startup.whyTrending || 'Increased market activity and signals'}
	                  </p>
	                </div>
                
                {/* Metrics Row */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="text-label">Momentum</div>
                    <div className={cn(
                      'text-sm font-semibold tabular-nums',
                      startup.momentumScore >= 70 ? 'signal-bullish' : 'text-slate-400'
                    )}>
                      {startup.momentumScore}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-label">Velocity (7d)</div>
                    <div className={cn(
                      'flex items-center gap-1 text-sm font-semibold tabular-nums',
                      isPositive ? 'signal-bullish' : 'signal-bearish'
                    )}>
                      {isPositive ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )}
                      {isPositive ? '+' : ''}{(startup.velocityChange * 100).toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="text-label">Sector</div>
                    <div className="text-sm text-slate-300">{startup.sector}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {displayList.length === 0 && (
        <div className="panel-institutional p-12 text-center">
          <p className="text-body-muted">No startups data available</p>
        </div>
      )}
    </div>
  );
}
