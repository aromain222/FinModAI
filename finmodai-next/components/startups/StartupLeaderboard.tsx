'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Star, Sparkles, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MomentumBreakdown } from '@/lib/momentum/types';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Startup {
  id: string;
  rank: number;
  name: string;
  description: string;
  sector: string;
  momentumScore: number;
  momentumBreakdown?: MomentumBreakdown;
  direction: 'up' | 'down';
  whyTrending: string[]; // ALWAYS string[] after normalization
  sources?: string[]; // Source attribution (GDELT, SEC, etc.)
  themes?: string[]; // Theme tags
  isWatchlisted?: boolean;
}

interface StartupLeaderboardProps {
  startups: Startup[];
  direction: 'up' | 'down';
  onToggleWatchlist?: (id: string) => void;
}

const SECTOR_COLORS: Record<string, string> = {
  AI: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Fintech: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  DevTools: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Healthcare: 'bg-red-500/10 text-red-400 border-red-500/30',
  Climate: 'bg-green-500/10 text-green-400 border-green-500/30',
  Enterprise: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  Crypto: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  Consumer: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
};

export function StartupLeaderboard({ startups, direction, onToggleWatchlist }: StartupLeaderboardProps) {
  const isUp = direction === 'up';
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {startups.map((startup) => {
        const isTop5 = startup.rank <= 5;
        const isTop1 = startup.rank === 1;
        const isExpanded = expandedCards.has(startup.id);
        const breakdown = startup.momentumBreakdown;

        // Ensure whyTrending is always an array (defensive programming)
        const trendingReasons = Array.isArray(startup.whyTrending)
          ? startup.whyTrending
          : ['No specific signals detected'];

        // Get strength label and color
        const getStrengthLabel = () => {
          if (!breakdown) return '';
          const { strength, direction: dir } = breakdown;
          const label = strength.charAt(0).toUpperCase() + strength.slice(1);
          return `${label} ${dir === 'up' ? 'Upward' : dir === 'down' ? 'Downward' : 'Neutral'}`;
        };

        const getStrengthColor = () => {
          if (!breakdown) return 'text-slate-400';
          if (breakdown.direction === 'up') {
            return breakdown.strength === 'strong' ? 'text-emerald-400' :
                   breakdown.strength === 'moderate' ? 'text-emerald-500' :
                   'text-emerald-600';
          } else if (breakdown.direction === 'down') {
            return breakdown.strength === 'strong' ? 'text-rose-400' :
                   breakdown.strength === 'moderate' ? 'text-rose-500' :
                   'text-rose-600';
          }
          return 'text-slate-400';
        };

        return (
          <Card
            key={startup.id}
            className={cn(
              'bg-slate-950/60 border-white/5 backdrop-blur-sm rounded-2xl p-5 relative overflow-hidden transition-all hover:border-white/10',
              isTop1 && 'border-emerald-500/30 shadow-lg shadow-emerald-500/10',
              isTop5 && !isTop1 && 'border-emerald-500/20'
            )}
          >
            {/* Animated background for top performers */}
            {isTop5 && (
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
            )}

            <div className="relative flex items-start gap-4">
              {/* Rank */}
              <div
                className={cn(
                  'flex-shrink-0 flex items-center justify-center rounded-xl font-bold transition-all',
                  isTop5
                    ? 'w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 text-black text-xl shadow-lg shadow-emerald-500/20'
                    : 'w-10 h-10 bg-slate-900/60 border border-white/5 text-slate-400 text-lg'
                )}
              >
                {startup.rank}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-white truncate">{startup.name}</h3>
                      {isTop1 && (
                        <Sparkles className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-slate-400 line-clamp-1 text-sm">{startup.description}</p>
                  </div>

                  {/* Watchlist Star */}
                  {onToggleWatchlist && (
                    <button
                      onClick={() => onToggleWatchlist(startup.id)}
                      className={cn(
                        'flex-shrink-0 p-1.5 rounded-lg transition-all',
                        startup.isWatchlisted
                          ? 'text-yellow-400 hover:text-yellow-300'
                          : 'text-slate-600 hover:text-slate-400'
                      )}
                      aria-label={startup.isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
                    >
                      <Star
                        className={cn(
                          'h-5 w-5',
                          startup.isWatchlisted && 'fill-current'
                        )}
                      />
                    </button>
                  )}
                </div>

                {/* Sector + Momentum */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs px-2.5 py-0.5 font-medium',
                      SECTOR_COLORS[startup.sector] || 'bg-slate-700/50 text-slate-300 border-slate-600/30'
                    )}
                  >
                    {startup.sector}
                  </Badge>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      {isUp ? (
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-rose-400" />
                      )}
                      <span
                        className={cn(
                          'text-base font-bold',
                          isUp ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {startup.momentumScore > 0 ? '+' : ''}{startup.momentumScore}
                      </span>
                      <span className="text-xs text-slate-500 uppercase tracking-wide">momentum</span>
                    </div>

                    {breakdown && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="p-1 hover:bg-slate-800/50 rounded transition-colors">
                              <Info className="h-3.5 w-3.5 text-slate-500" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700">
                            <p className="text-xs text-slate-300">
                              <strong>What this means:</strong> Momentum measures net news signal strength vs baseline. 
                              It is not stock price performance. Scores range from -100 (strong negative) to +100 (strong positive).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {breakdown && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs px-2.5 py-0.5 font-medium',
                        getStrengthColor(),
                        'border-current/30 bg-current/5'
                      )}
                    >
                      {getStrengthLabel()}
                    </Badge>
                  )}
                </div>

                {/* Momentum Explanation */}
                {breakdown && (
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
                    <p className="text-sm text-slate-300 leading-relaxed mb-3">
                      {breakdown.explanation}
                    </p>
                    
                    <button
                      onClick={() => toggleExpanded(startup.id)}
                      className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Hide breakdown
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          Show detailed breakdown
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Detailed Breakdown (Expandable) */}
                {isExpanded && breakdown && (
                  <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 space-y-4">
                    {/* Bull Drivers */}
                    {breakdown.bullDrivers.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold mb-2 flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Bullish Drivers
                        </div>
                        <div className="space-y-2">
                          {breakdown.bullDrivers.map((driver, idx) => (
                            <div key={idx} className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="text-sm text-slate-200 font-medium">{driver.label}</div>
                                {driver.detail && (
                                  <div className="text-xs text-slate-400 mt-0.5">{driver.detail}</div>
                                )}
                              </div>
                              <div className="text-sm font-bold text-emerald-400">
                                +{driver.contribution.toFixed(1)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bear Drivers */}
                    {breakdown.bearDrivers.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-rose-400 font-semibold mb-2 flex items-center gap-2">
                          <TrendingDown className="h-3.5 w-3.5" />
                          Bearish Drivers
                        </div>
                        <div className="space-y-2">
                          {breakdown.bearDrivers.map((driver, idx) => (
                            <div key={idx} className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="text-sm text-slate-200 font-medium">{driver.label}</div>
                                {driver.detail && (
                                  <div className="text-xs text-slate-400 mt-0.5">{driver.detail}</div>
                                )}
                              </div>
                              <div className="text-sm font-bold text-rose-400">
                                {driver.contribution.toFixed(1)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Formula Reference */}
                    <div className="pt-3 border-t border-white/5">
                      <div className="text-xs text-slate-500">
                        <strong>Score Formula:</strong> 15×mentions(z-score) + 10×funding + 6×hiring - 12×negativeTone - 8×regulation - 6×lawsuits - 5×layoffs
                      </div>
                    </div>
                  </div>
                )}

                {/* Why Trending */}
	                <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4 space-y-2">
	                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
	                    Why it&apos;s trending
	                  </div>
	                  {trendingReasons.map((reason, idx) => (
	                    <div key={idx} className="flex items-start gap-2">
	                      <div
	                        className={cn(
                          'h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0',
                          isUp ? 'bg-emerald-400' : 'bg-rose-400'
                        )}
                      />
                      <p className="text-sm text-slate-300 leading-relaxed">{reason}</p>
                    </div>
                  ))}
                  
                  {/* Source Attribution */}
                  {startup.sources && startup.sources.length > 0 && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                      <span className="text-xs text-slate-500">Sources:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {startup.sources.slice(0, 3).map((source, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-0.5 rounded bg-slate-800/50 text-slate-400 border border-white/5"
                          >
                            {source}
                          </span>
                        ))}
                        {startup.sources.length > 3 && (
                          <span className="text-xs text-slate-500">
                            +{startup.sources.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Theme Tags */}
                {startup.themes && startup.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {startup.themes.slice(0, 4).map((theme, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 rounded-md bg-slate-800/30 text-slate-400 border border-white/5"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
