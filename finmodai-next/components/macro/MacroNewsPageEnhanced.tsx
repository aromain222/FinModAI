'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
} from 'lucide-react';
import type { MacroNewsArticle } from '@/types/macro';
import { cn } from '@/lib/utils';
import { MarketPulse } from './MarketPulse';
import { SentimentRankings } from './SentimentRankings';

type TimeWindow = 'today' | '1W' | '1M';
type SentimentFilter = 'all' | 'bullish' | 'neutral' | 'bearish';

export default function MacroNewsPageEnhanced() {
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
      
      console.log(`[MacroNewsPage] Fetching news (window: ${timeWindow})...`);
      const response = await fetch(`/api/macro/news?window=${timeWindow}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }
      
      const data = await response.json();
      setArticles(data.articles);
      setLastUpdated(new Date());
      
      console.log(`[MacroNewsPage] ✅ Loaded ${data.articles.length} articles`);
      
    } catch (err) {
      console.error('[MacroNewsPage] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  };

  // Format "Updated X minutes ago"
  const getTimeAgo = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Updated just now';
    if (diffMins === 1) return 'Updated 1 minute ago';
    if (diffMins < 60) return `Updated ${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return 'Updated 1 hour ago';
    return `Updated ${diffHours} hours ago`;
  };

  // Deterministic rotation: seed shuffle by date
  const rotatedArticles = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Seeded shuffle
    const shuffled = [...articles];
    let currentIndex = shuffled.length;
    let randomIndex: number;
    
    // Simple seeded random function
    const seededRandom = (s: number) => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
    
    let seedValue = seed;
    while (currentIndex > 0) {
      randomIndex = Math.floor(seededRandom(seedValue++) * currentIndex);
      currentIndex--;
      [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
    }
    
    return shuffled;
  }, [articles]);

  const filteredArticles = sentimentFilter === 'all'
    ? rotatedArticles
    : rotatedArticles.filter(article => article.sentiment === sentimentFilter);

  // Count by sentiment
  const sentimentCounts = useMemo(() => {
    const counts = { bullish: 0, neutral: 0, bearish: 0 };
    articles.forEach(article => {
      counts[article.sentiment]++;
    });
    return counts;
  }, [articles]);

  const timeWindows: TimeWindow[] = ['today', '1W', '1M'];

  // Keyboard navigation for sentiment tabs
  const handleSentimentKeyDown = (e: React.KeyboardEvent, sentiment: SentimentFilter) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSentimentFilter(sentiment);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Market Brief</h1>
          <p className="text-sm text-slate-400 mt-2 flex items-center gap-2 flex-wrap">
            High-level market context and drivers
            {lastUpdated && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-500">
                  {getTimeAgo()}
                </span>
              </>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
            <Link href="/macro">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Macro
            </Link>
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Filters */}
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Time Window Filter */}
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Time Window</label>
                  <div className="inline-flex rounded-lg border bg-background p-1" role="tablist">
                    {timeWindows.map((window) => (
                      <button
                        key={window}
                        type="button"
                        role="tab"
                        aria-selected={timeWindow === window}
                        onClick={() => setTimeWindow(window)}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-sm transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                          timeWindow === window
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {window === 'today' ? 'Today' : window}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sentiment Filter */}
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Sentiment</label>
                  <div className="inline-flex rounded-lg border bg-background p-1" role="tablist">
                    {(['all', 'bullish', 'neutral', 'bearish'] as SentimentFilter[]).map((sentiment) => (
                      <button
                        key={sentiment}
                        type="button"
                        role="tab"
                        aria-selected={sentimentFilter === sentiment}
                        onClick={() => setSentimentFilter(sentiment)}
                        onKeyDown={(e) => handleSentimentKeyDown(e, sentiment)}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-sm transition capitalize focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                          sentimentFilter === sentiment
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {sentiment}
                        {sentiment !== 'all' && (
                          <span className="ml-1.5 text-xs opacity-75">
                            ({sentimentCounts[sentiment]})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Refresh Button */}
                <div className="flex items-end">
                  <Button 
                    onClick={fetchNews} 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    disabled={loading}
                  >
                    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center space-y-4">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Loading news...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  Error Loading News
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={fetchNews} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Articles */}
          {!loading && !error && (
            <div className="space-y-4">
              {filteredArticles.length === 0 ? (
                <Card className="border-slate-800 bg-slate-900/50">
                  <CardContent className="py-12 text-center">
                    <AlertCircle className="h-8 w-8 text-slate-500 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">
                      No market-relevant articles for selected filters
                    </p>
                    <p className="text-sm text-slate-500 mt-2">
                      Try adjusting your time window or sentiment filter
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredArticles.map((article) => (
                  <Card key={article.id} className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                          >
                            <CardTitle className="text-lg font-semibold text-slate-100 leading-snug">{article.title}</CardTitle>
                          </a>
                          <CardDescription className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                            <span className="text-slate-500">{article.source}</span>
                            <span className="text-slate-700">•</span>
                            <span className="text-slate-500">{getRelativeTime(article.publishedAt)}</span>
                            {article.tags && article.tags.length > 0 && (
                              <>
                                <span className="text-slate-700">•</span>
                                <div className="flex gap-1">
                                  {article.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-800/50 text-slate-400 border border-slate-700"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}
                          </CardDescription>
                        </div>
                        <SentimentBadge sentiment={article.sentiment} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {/* Why this matters */}
                      {article.marketRelevance && article.marketRelevance.score >= 50 && (
                        <div className="flex items-start gap-2 pb-2 border-b border-slate-800/50">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-sm font-medium text-emerald-400">
                            {article.marketRelevance.reason}
                          </p>
                        </div>
                      )}
                      
                      {/* Summary */}
                      <p className="text-sm leading-relaxed text-slate-300">{article.summary}</p>
                      
                      {/* Market Takeaway */}
                      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                        <p className="text-sm text-slate-400 leading-relaxed">
                          <span className="font-semibold text-slate-300">Market Takeaway:</span>{' '}
                          {article.aiInsight}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <MarketPulse />
          {!loading && articles.length > 0 && (
            <SentimentRankings articles={articles} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sentiment Badge Component
 */
function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'bearish' | 'neutral' }) {
  const config = {
    bullish: {
      icon: TrendingUp,
      label: 'Bullish',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    },
    bearish: {
      icon: TrendingDown,
      label: 'Bearish',
      className: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    },
    neutral: {
      icon: Minus,
      label: 'Neutral',
      className: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    },
  };

  const { icon: Icon, label, className } = config[sentiment];

  return (
    <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}

/**
 * Get relative time string
 */
function getRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

