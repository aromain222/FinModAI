'use client';

import { useEffect, useState, useCallback } from 'react';
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
  Info,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  buildCompactModelImpactPreview,
  formatSuggestionChip,
  transcribeEventForModeling,
} from '@/lib/model-events/transcribeEventForModeling';
import type { MacroNewsArticle } from '@/types/macro';
import { cn } from '@/lib/utils';

type TimeWindow = 'today' | '1W' | '1M';
type SentimentFilter = 'all' | 'bullish' | 'neutral' | 'bearish';

function buildArticleModelImpactPreview(article: MacroNewsArticle) {
  const rawEventText = [
    article.title,
    ...(article.analysis?.what_happened_sentences ?? []),
    ...(article.analysis?.market_impact_sentences ?? []),
    ...(article.analysis?.second_order_effects ?? []),
    article.summary,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');

  const transcription = transcribeEventForModeling({
    event: {
      sourceType: 'feed_item',
      eventId: article.id,
      title: article.title,
      rawEventText,
      publishedAt: article.publishedAt,
      sourceUrl: article.url,
      sourceLabel: article.source,
      impactedSectors: article.analysis?.affected_channels ?? [],
    },
  }).transcription;

  return buildCompactModelImpactPreview(transcription);
}

export default function MacroNewsPage() {
  const [articles, setArticles] = useState<MacroNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1W');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');

  const fetchNews = useCallback(async () => {
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
      
      console.log(`[MacroNewsPage] ✅ Loaded ${data.articles.length} articles`);
      
    } catch (err) {
      console.error('[MacroNewsPage] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [timeWindow]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const filteredArticles = sentimentFilter === 'all'
    ? articles
    : articles.filter(article => article.sentiment === sentimentFilter);

  const timeWindows: TimeWindow[] = ['today', '1W', '1M'];

  const buildModelCreateHref = (article: MacroNewsArticle): string => {
    const eventText = [
      ...(article.analysis?.what_happened_sentences ?? []),
      ...(article.analysis?.market_impact_sentences ?? []).slice(0, 2),
      article.summary,
    ]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ');

    const params = new URLSearchParams({
      eventSourceType: 'feed_item',
      eventId: article.id,
      eventTitle: article.title,
      eventText,
      eventUrl: article.url,
      eventSource: article.source,
      eventPublishedAt: article.publishedAt,
    });

    return `/models/create?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Macro News & AI Oversight</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recent macro headlines with AI-generated takeaways
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/macro">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Macro
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Time Window Filter */}
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Time Window</label>
              <div className="inline-flex rounded-lg border bg-background p-1">
                {timeWindows.map((window) => (
                  <button
                    key={window}
                    type="button"
                    onClick={() => setTimeWindow(window)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm transition',
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
              <div className="inline-flex rounded-lg border bg-background p-1">
                {(['all', 'bullish', 'neutral', 'bearish'] as SentimentFilter[]).map((sentiment) => (
                  <button
                    key={sentiment}
                    type="button"
                    onClick={() => setSentimentFilter(sentiment)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm transition capitalize',
                      sentimentFilter === sentiment
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {sentiment}
                  </button>
                ))}
              </div>
            </div>

            {/* Refresh Button */}
            <div className="flex items-end">
              <Button onClick={fetchNews} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
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
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No articles found for the selected filters
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredArticles.map((article) => {
              const modelImpactPreview = buildArticleModelImpactPreview(article);
              return (
              <Card key={article.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        <CardTitle className="text-lg">{article.title}</CardTitle>
                      </a>
                      <CardDescription className="mt-2 flex items-center gap-3 flex-wrap">
                        <span>{article.source}</span>
                        <span>•</span>
                        <span>{getRelativeTime(article.publishedAt)}</span>
                        {/* Show affected_channels if available, otherwise legacy tags */}
                        {(article.analysis?.affected_channels && article.analysis.affected_channels.length > 0) ||
                         (article.tags && article.tags.length > 0) ? (
                          <>
                            <span>•</span>
                            <div className="flex gap-1">
                              {(article.analysis?.affected_channels || article.tags || []).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground border border-border"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </CardDescription>
                    </div>
                    <SentimentBadge sentiment={article.sentiment} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">AI model impact</span>
                      {modelImpactPreview.suggestions.slice(0, 3).map((suggestion) => (
                        <span
                          key={suggestion.driver}
                          className="inline-flex items-center rounded-full border border-primary/20 bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground"
                        >
                          {formatSuggestionChip(suggestion)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-foreground leading-relaxed">{modelImpactPreview.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {modelImpactPreview.impacts.slice(0, 3).map((impact) => (
                        <span
                          key={impact.key}
                          className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                        >
                          {impact.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Summary Bullets */}
                  {article.analysis?.what_happened_sentences && article.analysis.what_happened_sentences.length > 0 ? (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                        What Happened
                      </h4>
                      <p className="text-sm text-foreground leading-relaxed">
                        {article.analysis.what_happened_sentences.join(' ')}
                      </p>
                    </div>
                  ) : (
                    // Fallback to legacy summary
                    <p className="text-sm leading-relaxed">{article.summary}</p>
                  )}

                  {/* Potential Market Impact */}
                  {article.analysis?.market_impact_sentences && article.analysis.market_impact_sentences.length > 0 ? (
                    <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-3">
                      <h4 className="text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                        Market Impact
                      </h4>
                      <p className="text-sm text-foreground leading-relaxed">
                        {article.analysis.market_impact_sentences.join(' ')}
                      </p>
                    </div>
                  ) : (
                    // Fallback to legacy AI insight
                    <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-3">
                      <p className="text-sm italic text-muted-foreground">
                        <span className="font-semibold text-foreground">AI Insight:</span>{' '}
                        {article.aiInsight}
                      </p>
                    </div>
                  )}


                  {/* Second-order Effects */}
                  {article.analysis?.second_order_effects && article.analysis.second_order_effects.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                        Second-Order Effects
                      </h4>
                      <ul className="space-y-1">
                        {article.analysis.second_order_effects.map((bullet, idx) => (
                          <li key={idx} className="text-sm text-foreground flex items-start">
                            <span className="mr-2 text-muted-foreground">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key Numbers */}
                  {article.analysis?.key_numbers && article.analysis.key_numbers.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold">Key numbers: </span>
                      {article.analysis.key_numbers.map((num, idx) => (
                        <span key={idx}>
                          {num.label}: {num.value}
                          {idx < article.analysis!.key_numbers!.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Caveat (keep reasoning tooltip, remove confidence badges/labels) */}
                  {article.analysis && (
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div className="flex items-center gap-1.5">
                        {article.analysis.reasoning_short && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-xs">{article.analysis.reasoning_short}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        Directional, depends on follow-through.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button asChild variant="outline" size="sm">
                      <Link href={buildModelCreateHref(article)}>
                        Apply to model
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={article.url} target="_blank" rel="noopener noreferrer">
                        Open source
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
            })
          )}
        </div>
      )}
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
      className: 'bg-green-100 text-green-700 border-green-200',
    },
    bearish: {
      icon: TrendingDown,
      label: 'Bearish',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
    neutral: {
      icon: Minus,
      label: 'Neutral',
      className: 'bg-gray-100 text-gray-700 border-gray-200',
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
