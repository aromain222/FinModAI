'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Calendar, AlertTriangle, TrendingUp, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IPOCandidate } from '@/lib/startups/data';

interface IPOCardProps {
  ipo: IPOCandidate;
  isWatchlisted: boolean;
  onToggleWatchlist: () => void;
}

export function IPOCard({ ipo, isWatchlisted, onToggleWatchlist }: IPOCardProps) {
  const ipoScore = ipo.momentum || 0;
  const isHighProbability = ipoScore >= 75;
  
  return (
    <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-lg font-semibold text-slate-100">{ipo.name}</h3>
              <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                {ipo.sector}
              </Badge>
              {ipo.rumoredTimeframe && (
                <Badge variant="outline" className="border-blue-700/50 text-blue-400 bg-blue-950/20 text-xs">
                  <Calendar className="mr-1 h-3 w-3" />
                  {ipo.rumoredTimeframe}
                </Badge>
              )}
              {isHighProbability && (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  High Signal
                </Badge>
              )}
            </div>
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
        {/* Filing Activity */}
        <div className="rounded-lg border border-blue-900/30 bg-blue-950/10 p-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-blue-400 mb-1.5">Filing Activity</div>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Last Funding:</span>
                  <span className="text-slate-300 font-medium">{ipo.lastFundingRound || '—'}</span>
                </div>
                {ipo.publicPeers?.length > 0 && (
                  <div className="flex justify-between">
                    <span>Comps:</span>
                    <span className="text-slate-300 font-medium">{ipo.publicPeers.slice(0, 2).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Market Context */}
        {ipo.riskNotes && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-amber-400 mb-1">Market Context</div>
                <p className="text-sm text-slate-400 leading-relaxed">{ipo.riskNotes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={cn(
                'h-3.5 w-3.5',
                isHighProbability ? 'text-emerald-400' : 'text-slate-500'
              )} />
              <span className={cn(
                'text-xs font-medium',
                isHighProbability ? 'text-emerald-400' : 'text-slate-500'
              )}>
                IPO Signal: {ipoScore}
              </span>
            </div>
            <Badge variant="outline" className="border-slate-700 text-slate-500 text-xs">
              Derived
            </Badge>
          </div>
          <span className="text-xs text-slate-500">SEC EDGAR</span>
        </div>
      </CardContent>
    </Card>
  );
}

