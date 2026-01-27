'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ImpactTag } from '@/lib/view_models/headlineTagger';
import type { EventImpact } from '@/lib/view_models/eventImpact';
export type EventItem = {
  title: string;
  source?: string;
  publishedAt: string;
  tag: ImpactTag;
  impact: EventImpact;
  relatedSources?: Array<{ source: string; publishedAt: string }>; // Related headlines in same cluster
};

type NewsEventCardProps = {
  item: EventItem;
  index: number;
  defaultOpen?: boolean;
};

const tagColors: Record<ImpactTag, string> = {
  Geopolitics: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  Energy: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  Rates: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Earnings: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  'Financial Stress': 'bg-red-500/10 text-red-300 border-red-500/30',
  Macro: 'bg-slate-700/50 text-slate-300 border-slate-600/30',
};

/**
 * Format market impact as short, structured bullets (5-8 lines max)
 * Deterministic format - never uses "may" or "could"
 * Format: Energy: direction + mechanism + tickers
 *         Equities: sectors/style impacted + tickers
 *         Other: defense, banks, airlines, EM, FX + tickers
 * Returns safe fallback if impact is invalid
 */
function formatMarketImpact(impact: EventImpact, tag: ImpactTag): string[] {
  try {
    const lines: string[] = [];
    
    // Add base case (1 line) - states direction and mechanism
    if (impact?.baseCase) {
      lines.push(impact.baseCase);
    } else if (lines.length === 0) {
      lines.push('Impact unavailable');
    }
    
    // Format winners (2-3 lines) - state direction, mechanism, tickers
    if (impact?.winners && Array.isArray(impact.winners) && impact.winners.length > 0) {
      impact.winners.forEach((winner) => {
        if (!winner || !winner.tickers || !Array.isArray(winner.tickers)) return;
        const direction = winner.direction === 'up' ? '↑' : '↓';
        const tickers = winner.tickers.slice(0, 3).join(', ');
        if (tickers) {
          // Format based on category
          const category = (winner.category || '').toLowerCase();
          if (category.includes('energy') || category.includes('oil')) {
            lines.push(`Energy ${direction}: ${tickers}`);
          } else if (category.includes('growth') || category.includes('duration') || category.includes('equities')) {
            lines.push(`Equities ${direction}: ${tickers}`);
          } else {
            lines.push(`${winner.category || 'Assets'} ${direction}: ${tickers}`);
          }
        }
      });
    }
    
    // Format losers (2-3 lines) - state direction, mechanism, tickers
    if (impact?.losers && Array.isArray(impact.losers) && impact.losers.length > 0) {
      impact.losers.forEach((loser) => {
        if (!loser || !loser.tickers || !Array.isArray(loser.tickers)) return;
        const direction = loser.direction === 'down' ? '↓' : '↑';
        const tickers = loser.tickers.slice(0, 3).join(', ');
        if (tickers) {
          const category = (loser.category || '').toLowerCase();
          if (category.includes('energy') || category.includes('oil')) {
            lines.push(`Energy ${direction}: ${tickers}`);
          } else if (category.includes('growth') || category.includes('duration') || category.includes('equities')) {
            lines.push(`Equities ${direction}: ${tickers}`);
          } else {
            lines.push(`${loser.category || 'Assets'} ${direction}: ${tickers}`);
          }
        }
      });
    }
    
    // If no impact lines generated, return fallback
    if (lines.length === 0) {
      return ['Impact unavailable'];
    }
    
    // Limit to 8 lines max
    return lines.slice(0, 8);
  } catch (error) {
    console.warn('Error formatting market impact:', error);
    return ['Impact unavailable'];
  }
}

/**
 * Get all affected assets (sectors + tickers) from impact
 * Falls back to default list if impact is empty or unavailable
 */
function getAffectedAssets(impact: EventImpact): string[] {
  const DEFAULT_ASSETS = ['SPY', 'QQQ', 'XLE', 'GLD'];
  
  try {
    const assets = new Set<string>();
    
    // Add all tickers from winners and losers
    if (impact.winners && Array.isArray(impact.winners)) {
      impact.winners.forEach((w) => {
        if (w.tickers && Array.isArray(w.tickers)) {
          w.tickers.forEach((t) => assets.add(t));
        }
      });
    }
    
    if (impact.losers && Array.isArray(impact.losers)) {
      impact.losers.forEach((l) => {
        if (l.tickers && Array.isArray(l.tickers)) {
          l.tickers.forEach((t) => assets.add(t));
        }
      });
    }
    
    // Add key tickers
    if (impact.keyTickers && Array.isArray(impact.keyTickers)) {
      impact.keyTickers.forEach((t) => assets.add(t));
    }
    
    // If no assets found, use default
    if (assets.size === 0) {
      return DEFAULT_ASSETS;
    }
    
    // Convert to array and limit to 8
    return Array.from(assets).slice(0, 8);
  } catch (error) {
    console.warn('Error extracting affected assets, using defaults:', error);
    return DEFAULT_ASSETS;
  }
}

export function NewsEventCard({ item, index, defaultOpen = false }: NewsEventCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  // Safely format impact with error handling
  let impactLines: string[] = [];
  try {
    impactLines = formatMarketImpact(item.impact, item.tag);
  } catch (error) {
    console.warn('Error formatting market impact:', error);
    impactLines = ['Impact unavailable'];
  }
  
  const affectedAssets = getAffectedAssets(item.impact);
  
  // Top Stocks Mentioned: use keyTickers from impact (3-6 stocks) with fallback
  const topStocks = (item.impact?.keyTickers && Array.isArray(item.impact.keyTickers) && item.impact.keyTickers.length > 0)
    ? item.impact.keyTickers.slice(0, 6)
    : ['SPY', 'QQQ', 'XLE', 'GLD'].slice(0, 6);

  const handleTickerClick = (ticker: string) => {
    // Navigate to stock analysis page
    window.open(`/stocks/${ticker}`, '_blank');
  };

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden hover:border-emerald-500/20 transition-colors">
      {/* Card Header */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <Badge className={cn('text-xs px-2 py-0.5 flex-shrink-0', tagColors[item.tag])}>
            {item.tag}
          </Badge>
          <div className="flex-1 min-w-0">
            {/* Headline */}
            <h4 className="text-base font-semibold text-white mb-2 leading-snug">{item.title}</h4>
            
            {/* Source + Time */}
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {item.source && item.source !== 'Unknown' && (
                <span>{item.source}</span>
              )}
              <span>{format(new Date(item.publishedAt), 'MMM dd, HH:mm')}</span>
            </div>
            
            {/* Related Sources (Also reported by...) */}
            {item.relatedSources && item.relatedSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <div className="text-xs text-slate-400 italic">
                  Also reported by:{' '}
                  {item.relatedSources.slice(0, 3).map((rs, idx) => (
                    <span key={idx}>
                      {idx > 0 && ', '}
                      <span className="text-slate-300">{rs.source}</span>
                    </span>
                  ))}
                  {item.relatedSources.length > 3 && (
                    <span> and {item.relatedSources.length - 3} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Stocks Mentioned */}
      {topStocks.length > 0 && (
        <div className="px-4 pb-3 border-b border-white/5">
          <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
            Top Stocks Mentioned
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topStocks.map((ticker) => (
              <button
                key={ticker}
                onClick={() => handleTickerClick(ticker)}
                className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-md hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors cursor-pointer"
              >
                {ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Market Impact (Collapsible) */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
        >
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
            Market Impact
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>
        
        {isOpen && (
          <div className="px-4 pb-4 pt-0">
            <div className="space-y-1.5 text-xs text-slate-300 leading-relaxed">
              {impactLines.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
            
            {/* Affected Assets (Chips) */}
            {affectedAssets.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                  Affected Assets
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {affectedAssets.map((asset) => (
                    <Badge
                      key={asset}
                      className="bg-slate-700/50 text-slate-300 border-slate-600/30 text-xs px-2 py-0.5"
                    >
                      {asset}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

