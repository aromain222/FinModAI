'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import HeadlinesPanel from '@/components/news/HeadlinesPanel';
import type { NewsRange, NewsTopic } from '@/lib/news/types';
import type { ServerHeadlinesPayload } from '@/lib/news/fetchHeadlinesServer';

const VALID_RANGES = new Set<NewsRange>(['1D', '3D', '1W', '1M']);
const VALID_TOPICS = new Set<NewsTopic>(['all', 'policy', 'rates', 'inflation', 'energy', 'fx', 'equities']);

function normalizeFilter<T extends string>(value: string | null, valid: Set<T>, fallback: T): T {
  return value && valid.has(value as T) ? (value as T) : fallback;
}

export default function NewsPage({
  initialRange,
  initialTopic,
  initialHeadlines,
}: {
  initialRange: NewsRange;
  initialTopic: NewsTopic;
  initialHeadlines: ServerHeadlinesPayload;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const currentRange = normalizeFilter(searchParams?.get('range') ?? null, VALID_RANGES, initialRange);
  const currentTopic = normalizeFilter(searchParams?.get('topic') ?? null, VALID_TOPICS, initialTopic);

  const currentRange = (searchParams?.get('range') as NewsRange) || initialRange;
  const currentTopic = (searchParams?.get('topic') as NewsTopic) || initialTopic;

  const updateFilters = useCallback(
    (nextRange: NewsRange, nextTopic: NewsTopic) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('range', nextRange);
      params.set('topic', nextTopic);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="w-full bg-zinc-950 px-6 py-5 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <HeadlinesPanel
          range={currentRange}
          topic={currentTopic}
          initialHeadlines={initialHeadlines}
          onRangeChange={(next) => updateFilters(next, currentTopic)}
          onTopicChange={(next) => updateFilters(currentRange, next)}
        />
      </div>
    </div>
  );
}
