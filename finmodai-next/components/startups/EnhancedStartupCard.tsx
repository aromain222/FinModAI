'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Star, Sparkles, Calendar, Users, Rocket, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Startup } from '@/types/startups';

interface EnhancedStartupCardProps {
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

const THEME_COLORS: Record<string, string> = {
  AI: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  Fintech: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  Security: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  DevTools: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  Enterprise: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  Consumer: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
  Healthcare: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  Climate: 'bg-green-500/10 text-green-300 border-green-500/20',
};

export function EnhancedStartupCard({ startup, isWatchlisted, onToggleWatchlist }: EnhancedStartupCardProps) {
  const momentumScore = startup.momentumScore || 0;
  const isHighMomentum = momentumScore >= 75;
  const isMediumMomentum = momentumScore >= 50 && momentumScore < 75;
  
  // Extract themes from description/signals
  const themes = extractThemes(startup);
  
  // Calculate velocity indicator (7d vs prior 7d)
  const velocity = calculateVelocity(startup);
  
  return (
    <Card className={cn(
      'border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all relative overflow-hidden',
      isHighMomentum && 'border-emerald-800/50 hover:border-emerald-700/50'
    )}>
      {/* Momentum Glow Effect */}
      {isHighMomentum && (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
      )}
      
      <CardHeader className="pb-3 relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Company Name + Sector */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-slate-100">{startup.name}</h3>
              <Badge variant="outline" className="text-xs bg-slate-800/50 text-slate-400 border-slate-700">
                {startup.sector}
              </Badge>
            </div>
            
            {/* What It Does */}
            <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">
              {startup.description || startup.thesis || 'Private company tracking'}
            </p>
            
            {/* Themes */}
            {themes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {themes.map((theme) => (
                  <Badge
                    key={theme}
                    variant="outline"
                    className={cn('text-xs px-2 py-0.5', THEME_COLORS[theme] || 'bg-slate-800/50 text-slate-400')}
                  >
                    {theme}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          {/* Watchlist Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleWatchlist}
            className={cn(
              'h-8 w-8 p-0',
              isWatchlisted && 'text-amber-400 hover:text-amber-300'
            )}
          >
            <Star className={cn('h-4 w-4', isWatchlisted && 'fill-current')} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 pt-0 relative">
        {/* Why It's Trending */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">Why It&apos;s Trending</span>
          </div>
          <ul className="text-xs text-slate-400 space-y-1">
            {generateTrendingReasons(startup).map((reason, i) => (
              <li key={i}>• {reason}</li>
            ))}
          </ul>
        </div>
        
        {/* Signals */}
        {startup.signals && startup.signals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {startup.signals.map((signal) => (
              <Badge
                key={signal}
                variant="outline"
                className={cn('text-xs px-2 py-0.5', SIGNAL_COLORS[signal] || 'bg-slate-800/50 text-slate-400 border-slate-700')}
              >
                {signal}
              </Badge>
            ))}
          </div>
        )}
        
        {/* Metrics Row */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
          <div className="flex items-center gap-4">
            {/* Momentum */}
            <div className="flex items-center gap-1.5">
              <TrendingUp className={cn(
                'h-3.5 w-3.5',
                isHighMomentum ? 'text-emerald-400' : isMediumMomentum ? 'text-blue-400' : 'text-slate-500'
              )} />
              <span className={cn(
                'text-xs font-semibold',
                isHighMomentum ? 'text-emerald-400' : isMediumMomentum ? 'text-blue-400' : 'text-slate-500'
              )}>
                {momentumScore}
              </span>
            </div>
            
            {/* Velocity Indicator */}
            {velocity && (
              <div className="flex items-center gap-1">
                <div className={cn(
                  'text-xs font-medium',
                  velocity > 0 ? 'text-emerald-400' : velocity < 0 ? 'text-rose-400' : 'text-slate-500'
                )}>
                  {velocity > 0 ? '+' : ''}{velocity}%
                </div>
                <span className="text-xs text-slate-600">7d</span>
              </div>
            )}
          </div>
          
          {/* Source */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>{startup.sourceHints?.join(', ') || 'GDELT + SEC'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper: Extract themes from startup data
function extractThemes(startup: Startup): string[] {
  const text = `${startup.name} ${startup.description || ''} ${startup.thesis || ''}`.toLowerCase();
  const themes: string[] = [];
  
  if (text.includes('ai') || text.includes('machine learning') || text.includes('llm')) themes.push('AI');
  if (text.includes('fintech') || text.includes('payment') || text.includes('banking')) themes.push('Fintech');
  if (text.includes('security') || text.includes('cyber')) themes.push('Security');
  if (text.includes('developer') || text.includes('devops') || text.includes('infrastructure')) themes.push('DevTools');
  if (text.includes('enterprise') || text.includes('b2b') || text.includes('saas')) themes.push('Enterprise');
  if (text.includes('consumer') || text.includes('b2c') || text.includes('social')) themes.push('Consumer');
  if (text.includes('health') || text.includes('biotech') || text.includes('medical')) themes.push('Healthcare');
  if (text.includes('climate') || text.includes('sustainability') || text.includes('carbon')) themes.push('Climate');
  
  return themes.slice(0, 3); // Max 3 themes
}

// Helper: Generate trending reasons from signals
function generateTrendingReasons(startup: Startup): string[] {
  const reasons: string[] = [];
  const signals = startup.signals || [];
  const whyTrending = startup.whyTrending || '';
  
  // Use existing whyTrending if available
  if (whyTrending) {
    return [whyTrending];
  }
  
  // Generate from signals
  if (signals.includes('Funding')) {
    reasons.push('Recent funding round or capital raise activity');
  }
  if (signals.includes('Hiring')) {
    reasons.push('Rapid headcount expansion signals growth');
  }
  if (signals.includes('Product')) {
    reasons.push('New product launches or feature releases');
  }
  if (signals.includes('Partnerships')) {
    reasons.push('Strategic partnerships with major players');
  }
  if (signals.includes('Press')) {
    reasons.push('Increased media coverage and visibility');
  }
  
  // Default
  if (reasons.length === 0) {
    reasons.push('Elevated mention velocity in recent coverage');
    reasons.push('Strong sector momentum and market timing');
  }
  
  return reasons.slice(0, 3); // Max 3 reasons
}

// Helper: Calculate velocity (mock for now - would need historical data)
function calculateVelocity(startup: Startup): number | null {
  // This would ideally compare 7d vs prior 7d mention counts
  // For now, derive from momentum score
  const momentum = startup.momentumScore || 0;
  
  if (momentum >= 80) return 45;
  if (momentum >= 70) return 25;
  if (momentum >= 60) return 15;
  if (momentum >= 50) return 5;
  if (momentum >= 40) return -5;
  if (momentum >= 30) return -15;
  
  return null;
}

