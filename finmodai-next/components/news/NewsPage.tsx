'use client';

import { useState } from 'react';
import HeadlinesPanel from '@/components/news/HeadlinesPanel';
import type { NewsRange, NewsTopic } from '@/lib/news/types';

export default function NewsPage() {
  const [range, setRange] = useState<NewsRange>('3D');
  const [topic, setTopic] = useState<NewsTopic>('all');

  return (
    <div className="w-full bg-zinc-950 px-6 py-5 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <HeadlinesPanel
          range={range}
          topic={topic}
          onRangeChange={setRange}
          onTopicChange={setTopic}
        />
      </div>
    </div>
  );
}
