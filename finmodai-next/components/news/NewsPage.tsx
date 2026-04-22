'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import HeadlinesPanel from '@/components/news/HeadlinesPanel';
import type { NewsRange, NewsTopic } from '@/lib/news/types';
import type { ServerHeadlinesPayload } from '@/lib/news/fetchHeadlinesServer';

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
          range={initialRange}
          topic={initialTopic}
          initialHeadlines={initialHeadlines}
          onRangeChange={(next) => updateFilters(next, initialTopic)}
          onTopicChange={(next) => updateFilters(initialRange, next)}
        />
      </div>
    </div>
  );
}
