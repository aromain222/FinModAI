'use client';

import { NewsEventCard, type EventItem } from './NewsEventCard';

export type { EventItem };

type EventImpactFeedProps = {
  items: EventItem[];
};

export function EventImpactFeed({ items }: EventImpactFeedProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-500">
        No events available for the selected time horizon
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {items.map((item, i) => (
        <NewsEventCard
          key={i}
          item={item}
          index={i}
          defaultOpen={i < 3} // Default open for top 3 items
        />
      ))}
    </div>
  );
}
