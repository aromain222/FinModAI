'use client';

import type { MarketEvent } from '@/lib/view_models/marketEventClustering';
import { MarketEventCard } from '@/components/market-brief/MarketEventCard';

type MarketEventsFeedProps = {
  events: MarketEvent[];
  returnsByTicker?: Record<string, number | null>;
  rangeLabel?: '1D' | '1W' | '1M';
};

export function MarketEventsFeed({ events, returnsByTicker, rangeLabel }: MarketEventsFeedProps) {
  if (!events.length) {
    return <div className="text-center py-8 text-sm text-slate-500">No events available for the selected time horizon</div>;
  }

  return (
    <div className="space-y-4">
      {events.map((event, idx) => (
        <MarketEventCard key={event.id || `${event.title}-${idx}`} event={event} returnsByTicker={returnsByTicker} rangeLabel={rangeLabel} />
      ))}
    </div>
  );
}
