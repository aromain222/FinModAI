'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StartupRow } from '@/types/startups';
import { ImpactBar } from './ImpactBar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StartupImpactCardProps {
  startup: StartupRow;
  isWatchlisted?: boolean;
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

export function StartupImpactCard({
  startup,
  isWatchlisted = false,
  onToggleWatchlist,
}: StartupImpactCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { impact, rank = 0 } = startup;

  const isTop5 = rank <= 5;
  const isTop1 = rank === 1;

  const getStrengthColor = () => {
    if (impact.direction === 'up') {
      return impact.strength === 'strong'
        ? 'text-emerald-400'
        : impact.strength === 'moderate'
        ? 'text-emerald-500'
        : 'text-emerald-600';
    } else if (impact.direction === 'down') {
      return impact.strength === 'strong'
        ? 'text-rose-400'
        : impact.strength === 'moderate'
        ? 'text-rose-500'
        : 'text-rose-600';
    }
    return 'text-slate-400';
  };

  const getStrengthLabel = () => {
    const label = impact.strength.charAt(0).toUpperCase() + impact.strength.slice(1);
    return `${label} ${
      impact.direction === 'up' ? 'Upward' : impact.direction === 'down' ? 'Downward' : 'Neutral'
    }`;
  };

  const maxImpact = Math.max(
    ...impact.bullDrivers.map((d) => Math.abs(d.contribution)),
    ...impact.bearDrivers.map((d) => Math.abs(d.contribution)),
    1
  );

  return (
    <Card
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
          {rank}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white truncate">{startup.name}</h3>
                {isTop1 && <Sparkles className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
              </div>
              <p className="text-slate-400 line-clamp-1 text-sm">{startup.oneLiner}</p>
            </div>

            {/* Watchlist Star */}
            {onToggleWatchlist && (
              <button
                onClick={() => onToggleWatchlist(startup.id)}
                className={cn(
                  'flex-shrink-0 p-1.5 rounded-lg transition-all',
                  isWatchlisted ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-600 hover:text-slate-400'
                )}
                aria-label={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Star className={cn('h-5 w-5', isWatchlisted && 'fill-current')} />
              </button>
            )}
          </div>

          {/* Sector + Momentum Badge */}
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
                {impact.direction === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : impact.direction === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-rose-400" />
                ) : (
                  <BarChart3 className="h-4 w-4 text-slate-400" />
                )}
                <span className={cn('text-base font-bold', getStrengthColor())}>
                  {impact.netImpact > 0 ? '+' : ''}
                  {impact.netImpact.toFixed(0)}
                </span>
                <span className="text-xs text-slate-500 uppercase tracking-wide">impact</span>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="p-1 hover:bg-slate-800/50 rounded transition-colors">
                      <Info className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700">
                    <p className="text-xs text-slate-300">
                      <strong>What this means:</strong> Impact reflects magnitude & relevance of signals vs
                      baseline. Not stock price performance. Scores range from -100 (strong negative) to +100
                      (strong positive).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

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

            {/* Delta Badge */}
            {impact.delta !== undefined && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs px-2.5 py-0.5 font-medium',
                  impact.delta > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : impact.delta < 0
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                )}
              >
                Δ {impact.delta > 0 ? '+' : ''}
                {impact.delta.toFixed(0)} vs prior {impact.timeframe}
              </Badge>
            )}
          </div>

          {/* Net Push vs Drag */}
          <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4 space-y-2">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-slate-500 mb-1">Positive Impact</div>
                <div className="text-lg font-bold text-emerald-400">
                  +{impact.totalPositiveImpact.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Negative Impact</div>
                <div className="text-lg font-bold text-rose-400">
                  -{impact.totalNegativeImpact.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Net Impact</div>
                <div
                  className={cn(
                    'text-lg font-bold',
                    impact.netImpact > 0
                      ? 'text-emerald-400'
                      : impact.netImpact < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  )}
                >
                  {impact.netImpact > 0 ? '+' : ''}
                  {impact.netImpact.toFixed(0)}
                </div>
              </div>
            </div>

            {/* Market vs Company Split */}
            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Market: </span>
                <span className="text-slate-300 font-medium">
                  {impact.marketImpact > 0 ? '+' : ''}
                  {impact.marketImpact.toFixed(0)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Company: </span>
                <span className="text-slate-300 font-medium">
                  {impact.companyImpact > 0 ? '+' : ''}
                  {impact.companyImpact.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
            <p className="text-sm text-slate-300 leading-relaxed">{impact.explanation}</p>
          </div>

          {/* Bull Drivers */}
          {impact.bullDrivers.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Bullish Drivers
              </div>
              <div className="space-y-3">
                {impact.bullDrivers.map((driver) => (
                  <ImpactBar key={driver.id} signal={driver} maxImpact={maxImpact} />
                ))}
              </div>
            </div>
          )}

          {/* Bear Drivers */}
          {impact.bearDrivers.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-rose-400 font-semibold flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5" />
                Bearish Drivers
              </div>
              <div className="space-y-3">
                {impact.bearDrivers.map((driver) => (
                  <ImpactBar key={driver.id} signal={driver} maxImpact={maxImpact} />
                ))}
              </div>
            </div>
          )}

          {/* Expand Timeline Button */}
          {impact.timeline.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full border-white/5 hover:bg-slate-800/50"
            >
              <Calendar className="h-4 w-4 mr-2" />
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Hide Timeline
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  View Timeline ({impact.timeline.length} events)
                </>
              )}
            </Button>
          )}

          {/* Expanded Timeline */}
          {isExpanded && (
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 space-y-4">
              <div className="text-sm font-semibold text-white mb-3">Signal Timeline</div>
              {impact.timeline.map((group) => (
                <div key={group.date} className="space-y-2">
                  <div className="text-xs text-slate-500 font-medium">
                    {new Date(group.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  <div className="space-y-2 pl-4 border-l-2 border-slate-800">
                    {group.items.map((signal) => (
                      <div key={signal.id} className="text-sm">
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              'text-xs font-medium',
                              signal.direction === 'positive'
                                ? 'text-emerald-400'
                                : signal.direction === 'negative'
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            )}
                          >
                            {signal.direction === 'positive' ? '↑' : signal.direction === 'negative' ? '↓' : '•'}
                          </span>
                          <div className="flex-1">
                            <p className="text-slate-300">{signal.description}</p>
                            {signal.sources && signal.sources.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {signal.sources.slice(0, 2).map((source, idx) => (
                                  <span
                                    key={idx}
                                    className="text-xs px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-400"
                                  >
                                    {source.domain}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

