import { Suspense } from 'react';
import NewsPage from '@/components/news/NewsPage';
import { APP_NAME } from '@/lib/branding';
import type { NewsRange, NewsTopic } from '@/lib/news/types';
import type { ServerHeadlinesPayload } from '@/lib/news/fetchHeadlinesServer';

export const metadata = {
  title: `News | ${APP_NAME}`,
  description: 'Market headlines and macro event summaries',
};

const VALID_RANGES = new Set<NewsRange>(['1D', '3D', '1W', '1M']);
const VALID_TOPICS = new Set<NewsTopic>(['all', 'policy', 'rates', 'inflation', 'energy', 'fx', 'equities']);

function normalizeParam<T extends string>(value: string | string[] | undefined, valid: Set<T>, fallback: T): T {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && valid.has(candidate as T) ? (candidate as T) : fallback;
}

const EMPTY_HEADLINES: ServerHeadlinesPayload = {
  items: [],
  provider: 'none',
};

function NewsSkeleton() {
  return (
    <div className="w-full bg-zinc-950 px-6 py-5 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-800/60" />
        <div className="h-4 w-64 animate-pulse rounded bg-zinc-800/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-800/30 bg-zinc-900/20" />
        ))}
      </div>
    </div>
  );
}

export default function NewsRoute({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const range = normalizeParam(searchParams?.range, VALID_RANGES, '3D');
  const topic = normalizeParam(searchParams?.topic, VALID_TOPICS, 'all');
  return (
    <Suspense fallback={<NewsSkeleton />}>
      <NewsPage initialRange={range} initialTopic={topic} initialHeadlines={EMPTY_HEADLINES} />
    </Suspense>
  );
}
