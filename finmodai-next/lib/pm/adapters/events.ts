import type { InterpretableEvent } from '@/lib/pm/types';
import type { EventItem } from '@/lib/ranking/types';

export function rankingEventToPMEvent(event: EventItem, fallbackTicker?: string): InterpretableEvent {
  const tickers = event.impacted_tickers?.flatMap(item => item.ticker ? [item.ticker] : []) ?? [];
  return {
    title: event.title ?? event.headline ?? 'Market event',
    summary: event.what_happened ?? event.why_it_matters ?? event.impact ?? 'Event summary unavailable.',
    source: event.sources?.[0]?.source ?? event.kind ?? 'ranking_event',
    url: event.sources?.[0]?.url ?? null,
    publishedAt: event.published_at ?? event.sources?.[0]?.published_at ?? null,
    eventType: event.kind === 'earnings' ? 'earnings' : event.kind === 'macro' ? 'macro' : 'news',
    tickers: tickers.length > 0 ? tickers : fallbackTicker ? [fallbackTicker] : [],
    impactDirection:
      event.direction === 'positive' ? 'bullish' :
      event.direction === 'negative' ? 'bearish' :
      event.direction === 'neutral' ? 'neutral' : undefined,
    confidence: event.eventForecast?.confidence != null ? event.eventForecast.confidence * 100 : undefined,
    materiality: event.rank?.score,
  };
}
