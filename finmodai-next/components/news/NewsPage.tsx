'use client';

import { useState } from 'react';
import HeadlinesPanel from '@/components/news/HeadlinesPanel';
import EventsPanel from '@/components/news/EventsPanel';
import type { NewsRange, NewsTopic } from '@/lib/news/types';

export default function NewsPage() {
  const [range, setRange] = useState<NewsRange>('3D');
  const [topic, setTopic] = useState<NewsTopic>('all');

  return (
    <div className="h-[calc(100vh-72px)] w-full overflow-hidden bg-zinc-950 px-6 py-6 lg:px-8">
      <div className="mx-auto grid h-full min-h-0 max-w-[1400px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HeadlinesPanel
          range={range}
          topic={topic}
          onRangeChange={setRange}
          onTopicChange={setTopic}
        />
        <EventsPanel
          range={range}
          topic={topic}
          onRangeChange={setRange}
          onTopicChange={setTopic}
        />
      </div>
    </div>
  );
}

