'use client';

import MarketEventsPanel from '@/components/market/EventsPanel';
import type { NewsRange, NewsTopic } from '@/lib/news/types';

export default function EventsPanel(_props: {
  range: NewsRange;
  topic: NewsTopic;
  onRangeChange: (next: NewsRange) => void;
  onTopicChange: (next: NewsTopic) => void;
}) {
  return <MarketEventsPanel />;
}
