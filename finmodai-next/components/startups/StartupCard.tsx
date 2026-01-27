'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Startup } from '@/lib/startups/data';

interface StartupCardProps {
  startup: Startup;
  isWatchlisted: boolean;
  onToggleWatchlist: () => void;
}

const SIGNAL_COLORS: Record<string, string> = {
  Funding: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  Hiring: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Partnerships: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Product: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  Regulation: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  Competition: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  Press: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
};

export function StartupCard({ startup, isWatchlisted, onToggleWatchlist }: StartupCardProps) {
  const momentumScore = startup.momentum || 0;
  const isHighMomentum = momentumScore >= 75;
  const isMediumMomentum = momentumScore >= 50 && momentumScore < 75;
  
  return (
    <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-lg font-semibold text-slate-100">{startup.name}</h3>
              <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                {startup.sector}
              </Badge>
              {isHighMomentum && (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                  <ArrowUp className="h-3 w-3 mr-1" />
                  Hot
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">{startup.thesis}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleWatchlist}
            className={cn(
              'shrink-0 h-8 w-8 p-0 hover:bg-slate-800',
              isWatchlisted ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'
            )}
            aria-label={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Star className={cn('h-4 w-4', isWatchlisted && 'fill-current')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Signals Row */}
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">Signals</div>
          <div className="flex flex-wrap gap-1.5">
            {startup.signals?.map((signal) => (
              <Badge
                key={signal}
                variant="outline"
                className={cn('text-xs px-2 py-0.5', SIGNAL_COLORS[signal] || 'bg-slate-800/50 text-slate-400 border-slate-700')}
              >
                {signal}
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Why Trending */}
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">Market Signal</div>
          <p className="text-sm text-slate-300 leading-relaxed line-clamp-2">{startup.whyTrending}</p>
        </div>

        {/* Metrics */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={cn(
                'h-3.5 w-3.5',
                isHighMomentum ? 'text-emerald-400' : isMediumMomentum ? 'text-blue-400' : 'text-slate-500'
              )} />
              <span className={cn(
                'text-xs font-medium',
                isHighMomentum ? 'text-emerald-400' : isMediumMomentum ? 'text-blue-400' : 'text-slate-500'
              )}>
                Momentum: {momentumScore}
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-500">
            {startup.sourceHints?.join(', ') || 'GDELT + Public reporting'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

