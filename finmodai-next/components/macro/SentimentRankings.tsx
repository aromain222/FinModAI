'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Hash } from 'lucide-react';
import type { MacroNewsArticle } from '@/types/macro';
import { cn } from '@/lib/utils';

interface SentimentRankingsProps {
  articles: MacroNewsArticle[];
}

interface SectorSentiment {
  sector: string;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalCount: number;
  netSentiment: number; // bullish - bearish
}

interface ThemeCount {
  theme: string;
  count: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  bullish: number;
  bearish: number;
  neutral: number;
}

export function SentimentRankings({ articles }: SentimentRankingsProps) {
  const { sectorSentiments, topThemes, hasSignal } = useMemo(() => {
    // Extract sectors from tags
    const sectorMap = new Map<string, SectorSentiment>();
    const themeMap = new Map<string, { bullish: number; bearish: number; neutral: number }>();
    
    articles.forEach((article) => {
      const tags = article.tags || [];
      const sentiment = article.sentiment;
      
      // Process sectors (tags that look like sectors)
      const sectorTags = tags.filter(tag => 
        ['Fed', 'Rates', 'Inflation', 'Employment', 'Economy', 'Bonds', 'Yields', 
         'Oil', 'Energy', 'China', 'Global', 'Growth', 'Tech', 'Finance', 'Consumer'].includes(tag)
      );
      
      sectorTags.forEach((sector) => {
        if (!sectorMap.has(sector)) {
          sectorMap.set(sector, {
            sector,
            bullishCount: 0,
            bearishCount: 0,
            neutralCount: 0,
            totalCount: 0,
            netSentiment: 0,
          });
        }
        
        const sectorData = sectorMap.get(sector)!;
        sectorData.totalCount++;
        
        if (sentiment === 'bullish') sectorData.bullishCount++;
        else if (sentiment === 'bearish') sectorData.bearishCount++;
        else sectorData.neutralCount++;
        
        sectorData.netSentiment = sectorData.bullishCount - sectorData.bearishCount;
      });
      
      // Process themes (all tags)
      tags.forEach((theme) => {
        if (!themeMap.has(theme)) {
          themeMap.set(theme, { bullish: 0, bearish: 0, neutral: 0 });
        }
        
        const themeData = themeMap.get(theme)!;
        if (sentiment === 'bullish') themeData.bullish++;
        else if (sentiment === 'bearish') themeData.bearish++;
        else themeData.neutral++;
      });
    });
    
    // Convert to arrays and sort
    // Sort by absolute net sentiment first, then by volume
    const sectorSentiments = Array.from(sectorMap.values())
      .sort((a, b) => {
        const absNetDiff = Math.abs(b.netSentiment) - Math.abs(a.netSentiment);
        if (absNetDiff !== 0) return absNetDiff;
        return b.totalCount - a.totalCount;
      })
      .slice(0, 5);
    
    const topThemes: ThemeCount[] = Array.from(themeMap.entries())
      .map(([theme, counts]) => {
        const total = counts.bullish + counts.bearish + counts.neutral;
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (counts.bullish > counts.bearish && counts.bullish > counts.neutral) sentiment = 'bullish';
        else if (counts.bearish > counts.bullish && counts.bearish > counts.neutral) sentiment = 'bearish';
        
        return { theme, count: total, sentiment, bullish: counts.bullish, bearish: counts.bearish, neutral: counts.neutral };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Signal gating thresholds
    const MIN_SECTOR_VOLUME = 2; // Minimum 2 mentions per sector
    const MIN_THEME_MENTIONS = 2; // Minimum 2 mentions per theme
    const MIN_NET_SENTIMENT = 1; // At least one sector with net != 0
    
    const hasStrongSectorSignal = sectorSentiments.some(s => 
      s.totalCount >= MIN_SECTOR_VOLUME && Math.abs(s.netSentiment) >= MIN_NET_SENTIMENT
    );
    
    const hasStrongThemeSignal = topThemes.some(t => t.count >= MIN_THEME_MENTIONS);
    
    return { 
      sectorSentiments, 
      topThemes, 
      hasSignal: {
        sectors: hasStrongSectorSignal,
        themes: hasStrongThemeSignal
      }
    };
  }, [articles]);

  // Don't render if no strong signals
  if (!hasSignal.sectors && !hasSignal.themes) {
    return (
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-slate-500">No strong signals detected</p>
          <p className="text-xs text-slate-600 mt-1">Check back when more data is available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sector Sentiment Rankings */}
      {hasSignal.sectors && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base font-semibold text-slate-100">Sector Signals</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Directional sentiment by sector
            </p>
          </CardHeader>
          <CardContent>
            {sectorSentiments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                No sector data available
              </p>
            ) : (
            <div className="space-y-2.5">
              {sectorSentiments.map((sector, index) => {
                const isBullish = sector.netSentiment > 0;
                const isNeutral = sector.netSentiment === 0;
                const totalActivity = sector.totalCount;
                
                return (
                  <div key={sector.sector} className="rounded-lg border border-slate-800/50 bg-slate-900/30 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-600 w-4">
                          {index + 1}
                        </span>
                        {isNeutral ? (
                          <div className="h-3 w-3 rounded-full bg-slate-700 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                          </div>
                        ) : isBullish ? (
                          <TrendingUp className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-rose-400" />
                        )}
                        <span className="text-sm font-medium text-slate-200">{sector.sector}</span>
                      </div>
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded',
                        isNeutral ? 'text-slate-500' : isBullish ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                      )}>
                        {isNeutral ? '—' : isBullish ? `+${sector.netSentiment}` : sector.netSentiment}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs pl-6">
                      <span className="text-emerald-500">↑{sector.bullishCount}</span>
                      <span className="text-slate-600">—{sector.neutralCount}</span>
                      <span className="text-rose-500">↓{sector.bearishCount}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500">{totalActivity} total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        </Card>
      )}

      {/* Most Mentioned Themes */}
      {hasSignal.themes && (
        <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-base font-semibold text-slate-100">Active Themes</CardTitle>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Most mentioned topics
          </p>
        </CardHeader>
        <CardContent>
          {topThemes.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No theme data available
            </p>
          ) : (
            <div className="space-y-2">
              {topThemes.map((theme, index) => {
                const sentimentColor = 
                  theme.sentiment === 'bullish' ? 'text-emerald-400' :
                  theme.sentiment === 'bearish' ? 'text-rose-400' :
                  'text-slate-400';
                
                const sentimentBg = 
                  theme.sentiment === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  theme.sentiment === 'bearish' ? 'bg-rose-500/10 border-rose-500/30' :
                  'bg-slate-500/10 border-slate-500/30';
                
                return (
                  <div key={theme.theme} className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-600 w-4">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-200">{theme.theme}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        {theme.count}
                      </span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium capitalize border',
                        sentimentBg,
                        sentimentColor
                      )}>
                        {theme.sentiment}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        </Card>
      )}
    </div>
  );
}

