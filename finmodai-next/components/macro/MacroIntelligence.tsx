'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Globe, BarChart3, RefreshCw, Clock } from 'lucide-react';
import { MarketPulse } from './MarketPulse';
import type { MacroNewsArticle } from '@/types/macro';

type TimeWindow = 'today' | '1W' | '1M';
type SentimentFilter = 'all' | 'bullish' | 'neutral' | 'bearish';

/**
 * MacroIntelligence - Split into Market Pulse + Macro IQ
 * 
 * Market Pulse: Markets-first (indices, rates, Fed, inflation, oil)
 * Macro IQ: World-events → market translation (wars, tariffs, supply chain)
 */
export default function MacroIntelligence() {
  const [articles, setArticles] = useState<MacroNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1W');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchNews();
  }, [timeWindow]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/macro/news?window=${timeWindow}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }
      
      const data = await response.json();
      setArticles(data.articles);
      setLastUpdated(new Date());
      
    } catch (err) {
      console.error('[MacroIntelligence] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  };

  // Split articles into Market Pulse vs Macro IQ
  const { marketPulseArticles, macroIQArticles } = useMemo(() => {
    const marketKeywords = ['fed', 'rate', 'inflation', 'cpi', 'ppi', 'treasury', 'yield', 'dollar', 'oil', 'crude', 'gold', 'bond', 'fomc', 'powell', 'yellen', 'gdp', 'jobs', 'unemployment', 'earnings', 'ipo', 'm&a'];
    const macroKeywords = ['war', 'conflict', 'tariff', 'trade', 'sanction', 'supply chain', 'energy', 'election', 'policy', 'regulation', 'geopolitical', 'china', 'russia', 'ukraine', 'taiwan', 'opec'];
    
    const marketPulse: MacroNewsArticle[] = [];
    const macroIQ: MacroNewsArticle[] = [];
    
    articles.forEach(article => {
      const titleLower = article.title.toLowerCase();
      const summaryLower = article.summary?.toLowerCase() || '';
      const text = `${titleLower} ${summaryLower}`;
      
      const hasMarketKeyword = marketKeywords.some(kw => text.includes(kw));
      const hasMacroKeyword = macroKeywords.some(kw => text.includes(kw));
      
      // Prioritize market pulse if both match
      if (hasMarketKeyword) {
        marketPulse.push(article);
      } else if (hasMacroKeyword) {
        macroIQ.push(article);
      } else {
        // Default to macro IQ for world events
        macroIQ.push(article);
      }
    });
    
    return { marketPulseArticles: marketPulse, macroIQArticles: macroIQ };
  }, [articles]);

  const filteredMarketPulse = sentimentFilter === 'all'
    ? marketPulseArticles
    : marketPulseArticles.filter(a => a.sentiment === sentimentFilter);

  const filteredMacroIQ = sentimentFilter === 'all'
    ? macroIQArticles
    : macroIQArticles.filter(a => a.sentiment === sentimentFilter);

  const getTimeAgo = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-50">Market Brief</h1>
          <p className="text-sm text-slate-400 mt-1">
            High-level market context and drivers
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <span>Updated {getTimeAgo()}</span>
            </div>
          )}
          <Button
            onClick={fetchNews}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Time Window Selector */}
      <div className="flex gap-2">
        {(['today', '1W', '1M'] as TimeWindow[]).map((window) => (
          <Button
            key={window}
            onClick={() => setTimeWindow(window)}
            variant={timeWindow === window ? 'default' : 'outline'}
            size="sm"
          >
            {window === 'today' ? 'Today' : window}
          </Button>
        ))}
      </div>

      {/* Sentiment Filter */}
      <div className="flex gap-2">
        <Button
          onClick={() => setSentimentFilter('all')}
          variant={sentimentFilter === 'all' ? 'default' : 'outline'}
          size="sm"
        >
          All
        </Button>
        <Button
          onClick={() => setSentimentFilter('bullish')}
          variant={sentimentFilter === 'bullish' ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
        >
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Bullish
        </Button>
        <Button
          onClick={() => setSentimentFilter('neutral')}
          variant={sentimentFilter === 'neutral' ? 'default' : 'outline'}
          size="sm"
        >
          Neutral
        </Button>
        <Button
          onClick={() => setSentimentFilter('bearish')}
          variant={sentimentFilter === 'bearish' ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
        >
          <TrendingDown className="h-4 w-4 text-rose-500" />
          Bearish
        </Button>
      </div>

      {error && (
        <Card className="border-rose-800 bg-rose-950/20">
          <CardContent className="py-6">
            <p className="text-sm text-rose-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Content - Tabs */}
      <Tabs defaultValue="market-pulse" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 bg-slate-900">
          <TabsTrigger value="market-pulse" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Market Pulse
            <Badge variant="secondary" className="ml-2">
              {filteredMarketPulse.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="macro-iq" className="gap-2">
            <Globe className="h-4 w-4" />
            Macro IQ
            <Badge variant="secondary" className="ml-2">
              {filteredMacroIQ.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Market Pulse Tab */}
        <TabsContent value="market-pulse" className="space-y-6">
          {/* Market Indices Widget */}
          <MarketPulse />

          {/* Market Pulse Articles */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-200">Market Headlines</h2>
            {loading ? (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-12 text-center">
                  <RefreshCw className="mx-auto h-8 w-8 animate-spin text-slate-600" />
                  <p className="mt-3 text-sm text-slate-500">Loading market signals...</p>
                </CardContent>
              </Card>
            ) : filteredMarketPulse.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-slate-500">No market headlines for selected filters</p>
                </CardContent>
              </Card>
            ) : (
              filteredMarketPulse.map((article) => (
                <MarketPulseArticleCard key={article.id} article={article} />
              ))
            )}
          </div>
        </TabsContent>

        {/* Macro IQ Tab */}
        <TabsContent value="macro-iq" className="space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-200">Global Events → Market Impact</h2>
              <p className="text-sm text-slate-500 mt-1">
                How world events translate to market opportunities and risks
              </p>
            </div>
            {loading ? (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-12 text-center">
                  <RefreshCw className="mx-auto h-8 w-8 animate-spin text-slate-600" />
                  <p className="mt-3 text-sm text-slate-500">Analyzing global events...</p>
                </CardContent>
              </Card>
            ) : filteredMacroIQ.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-slate-500">No macro events for selected filters</p>
                </CardContent>
              </Card>
            ) : (
              filteredMacroIQ.map((article) => (
                <MacroIQArticleCard key={article.id} article={article} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Market Pulse Article Card
 * Focus: Indices, rates, Fed, inflation, earnings, IPOs
 */
function MarketPulseArticleCard({ article }: { article: MacroNewsArticle }) {
  const impactDirection = getImpactDirection(article);
  const affectedSectors = getAffectedSectors(article);
  
  return (
    <Card className="border-slate-800 bg-slate-900 hover:border-slate-700 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              <CardTitle className="text-lg text-slate-200">{article.title}</CardTitle>
            </a>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-500">
              <span>{article.source}</span>
              <span>•</span>
              <span>{getRelativeTime(article.publishedAt)}</span>
            </div>
          </div>
          <SentimentBadge sentiment={article.sentiment} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400 leading-relaxed">{article.summary}</p>
        
        {/* Why This Matters */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-300">Why This Matters:</p>
          <p className="text-xs text-slate-400">{getWhyItMatters(article)}</p>
        </div>

        {/* Impact Direction */}
        {impactDirection && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${getImpactColor(impactDirection)} text-xs`}>
              {impactDirection}
            </Badge>
          </div>
        )}

        {/* Affected Sectors */}
        {affectedSectors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500">Sectors:</span>
            {affectedSectors.map((sector) => (
              <Badge key={sector} variant="secondary" className="text-xs bg-slate-800 text-slate-300">
                {sector}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Macro IQ Article Card
 * Focus: Wars, tariffs, supply chain, geopolitics
 */
function MacroIQArticleCard({ article }: { article: MacroNewsArticle }) {
  const transmissionChannels = getTransmissionChannels(article);
  const affectedSectors = getAffectedSectors(article);
  
  return (
    <Card className="border-slate-800 bg-slate-900 hover:border-slate-700 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              <CardTitle className="text-lg text-slate-200">{article.title}</CardTitle>
            </a>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-500">
              <span>{article.source}</span>
              <span>•</span>
              <span>{getRelativeTime(article.publishedAt)}</span>
            </div>
          </div>
          <SentimentBadge sentiment={article.sentiment} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400 leading-relaxed">{article.summary}</p>
        
        {/* Market Transmission */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-300">Market Transmission:</p>
          <ul className="text-xs text-slate-400 space-y-1">
            {transmissionChannels.map((channel, i) => (
              <li key={i}>• {channel}</li>
            ))}
          </ul>
        </div>

        {/* Affected Sectors */}
        {affectedSectors.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Likely Impact:</p>
            <div className="flex flex-wrap gap-2">
              {affectedSectors.map((sector) => (
                <Badge key={sector} variant="secondary" className="text-xs bg-slate-800 text-slate-300">
                  {sector}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'bearish' | 'neutral' }) {
  const colors = {
    bullish: 'bg-emerald-900/20 text-emerald-500 border-emerald-800',
    bearish: 'bg-rose-900/20 text-rose-500 border-rose-800',
    neutral: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  const icons = {
    bullish: <TrendingUp className="h-3.5 w-3.5" />,
    bearish: <TrendingDown className="h-3.5 w-3.5" />,
    neutral: null,
  };

  return (
    <Badge variant="outline" className={`${colors[sentiment]} flex items-center gap-1 text-xs font-semibold`}>
      {icons[sentiment]}
      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
    </Badge>
  );
}

// Helper functions
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getImpactDirection(article: MacroNewsArticle): string | null {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  
  if (text.includes('rate cut') || text.includes('dovish') || text.includes('stimulus')) {
    return 'Risk-On';
  }
  if (text.includes('rate hike') || text.includes('hawkish') || text.includes('tightening')) {
    return 'Risk-Off';
  }
  if (text.includes('inflation') && !text.includes('decline')) {
    return 'Inflationary';
  }
  if (text.includes('growth') || text.includes('earnings beat')) {
    return 'Growth-Positive';
  }
  
  return null;
}

function getImpactColor(direction: string): string {
  const colors: Record<string, string> = {
    'Risk-On': 'border-emerald-700 text-emerald-400',
    'Risk-Off': 'border-rose-700 text-rose-400',
    'Inflationary': 'border-amber-700 text-amber-400',
    'Growth-Positive': 'border-blue-700 text-blue-400',
  };
  return colors[direction] || 'border-slate-700 text-slate-400';
}

function getWhyItMatters(article: MacroNewsArticle): string {
  // Use AI insight if available, otherwise generate
  if (article.aiInsight) {
    return article.aiInsight;
  }
  
  const text = `${article.title} ${article.summary}`.toLowerCase();
  
  if (text.includes('fed') || text.includes('rate')) {
    return 'Changes in Fed policy directly impact discount rates, affecting all asset valuations.';
  }
  if (text.includes('inflation')) {
    return 'Inflation data influences Fed decisions and real returns across asset classes.';
  }
  if (text.includes('earnings')) {
    return 'Corporate earnings drive equity valuations and provide insight into economic health.';
  }
  if (text.includes('oil') || text.includes('energy')) {
    return 'Energy prices affect input costs, consumer spending, and inflation expectations.';
  }
  
  return 'This development has implications for market sentiment and asset allocation decisions.';
}

function getAffectedSectors(article: MacroNewsArticle): string[] {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const sectors: string[] = [];
  
  if (text.includes('tech') || text.includes('ai') || text.includes('software')) sectors.push('Technology');
  if (text.includes('bank') || text.includes('financial')) sectors.push('Financials');
  if (text.includes('energy') || text.includes('oil')) sectors.push('Energy');
  if (text.includes('health') || text.includes('pharma')) sectors.push('Healthcare');
  if (text.includes('consumer') || text.includes('retail')) sectors.push('Consumer');
  if (text.includes('industrial') || text.includes('manufacturing')) sectors.push('Industrials');
  
  return sectors.slice(0, 3); // Max 3 sectors
}

function getTransmissionChannels(article: MacroNewsArticle): string[] {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const channels: string[] = [];
  
  if (text.includes('tariff') || text.includes('trade')) {
    channels.push('Trade flows → corporate margins → equity valuations');
  }
  if (text.includes('war') || text.includes('conflict')) {
    channels.push('Risk premium → safe haven demand → asset reallocation');
  }
  if (text.includes('supply chain')) {
    channels.push('Input costs → inflation → central bank policy');
  }
  if (text.includes('sanction')) {
    channels.push('Commodity prices → inflation → real rates');
  }
  if (text.includes('election') || text.includes('policy')) {
    channels.push('Regulatory outlook → sector rotation → valuations');
  }
  
  if (channels.length === 0) {
    channels.push('Global uncertainty → volatility → risk appetite');
  }
  
  return channels.slice(0, 3);
}

