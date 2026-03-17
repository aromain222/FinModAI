'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDealSize, formatDealSizeWithCurrency, formatWeekDateRange, getDealCategoryLabel } from '@/lib/deal-intelligence/formatters';
import {
  DEAL_FEEDS,
  type DealFeedType,
  type FeedDealItem,
  type MarketSignalTone,
  type WeeklyDealBriefWithResolvedDeal,
} from '@/lib/deal-intelligence/types';
import { cn } from '@/lib/utils';

const MAX_KEY_ITEMS = 6;

function toneBadgeClass(tone: MarketSignalTone): string {
  if (tone === 'Risk-On') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (tone === 'Risk-Off') return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
}

function FeedFeaturedCard({ item }: { item: FeedDealItem | null }) {
  if (!item) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardContent className="p-4 text-xs text-[var(--cb-text-muted)]">
          No featured development was captured for this lens in the selected week.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--cb-border)] bg-[var(--cb-surface)]">
      <CardHeader className="space-y-2 p-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
          >
            {getDealCategoryLabel(item.category)}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
          >
            {item.dealType}
          </Badge>
          {item.dealSize !== null ? (
            <Badge
              variant="outline"
              className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
            >
              {formatDealSize(item.dealSize)} {item.currency}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-base leading-tight text-[var(--cb-text-primary)]">
          {item.company}
        </CardTitle>
        <p className="text-xs text-[var(--cb-text-secondary)]">{item.title}</p>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {item.counterparty ? (
          <p className="text-xs text-[var(--cb-text-muted)]">
            Counterparty: <span className="text-[var(--cb-text-secondary)]">{item.counterparty}</span>
          </p>
        ) : null}
        {item.dealSize !== null ? (
          <p className="text-xs text-[var(--cb-text-muted)]">
            Deal value: <span className="text-[var(--cb-text-secondary)]">{formatDealSizeWithCurrency(item.dealSize, item.currency)}</span>
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-[var(--cb-text-body)]">{item.summary}</p>
        <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">
          <span className="font-semibold text-[var(--cb-text-primary)]">Why it matters:</span> {item.whyItMatters}
        </p>
        {item.inclusionRationale ? (
          <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">
            <span className="font-semibold text-[var(--cb-text-primary)]">Why it is in the brief:</span> {item.inclusionRationale}
          </p>
        ) : null}
        {item.quantitativeContext ? (
          <p className="text-xs leading-relaxed text-[var(--cb-text-muted)]">{item.quantitativeContext}</p>
        ) : null}
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 4).map((tag) => (
              <Badge
                key={`${item.id}-${tag}`}
                variant="outline"
                className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2 py-0 text-[10px] text-[var(--cb-text-muted)]"
              >
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KeyDevelopmentRow({ item }: { item: FeedDealItem }) {
  return (
    <li className="space-y-1 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium leading-tight text-[var(--cb-text-primary)]">{item.company}</p>
          <p className="text-xs text-[var(--cb-text-muted)]">{item.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2 py-0 text-[10px] text-[var(--cb-text-muted)]"
          >
            {getDealCategoryLabel(item.category)}
          </Badge>
          {item.dealSize !== null ? (
            <Badge
              variant="outline"
              className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2 py-0 text-[10px] text-[var(--cb-text-muted)]"
            >
              {formatDealSize(item.dealSize)}
            </Badge>
          ) : null}
        </div>
      </div>

      {item.counterparty ? (
        <p className="text-xs text-[var(--cb-text-muted)]">Counterparty: {item.counterparty}</p>
      ) : null}
      {item.dealSize !== null ? (
        <p className="text-xs text-[var(--cb-text-muted)]">Deal value: {formatDealSizeWithCurrency(item.dealSize, item.currency)}</p>
      ) : null}
      <p className="text-xs leading-relaxed text-[var(--cb-text-body)]">{item.summary}</p>
      <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">
        <span className="font-medium text-[var(--cb-text-primary)]">Why it matters:</span> {item.whyItMatters}
      </p>
      {item.inclusionRationale ? (
        <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">
          <span className="font-medium text-[var(--cb-text-primary)]">Why it is in the brief:</span> {item.inclusionRationale}
        </p>
      ) : null}
      {item.quantitativeContext ? (
        <p className="text-xs leading-relaxed text-[var(--cb-text-muted)]">{item.quantitativeContext}</p>
      ) : null}
      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <Badge
              key={`${item.id}-${tag}`}
              variant="outline"
              className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2 py-0 text-[10px] text-[var(--cb-text-muted)]"
            >
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </li>
  );
}

type FeedPanelProps = {
  brief: WeeklyDealBriefWithResolvedDeal;
  feed: DealFeedType;
};

function FeedPanel({ brief, feed }: FeedPanelProps) {
  const view = brief.feedViews.find((entry) => entry.feed === feed) ?? null;
  const featuredItem = view?.featuredItem ?? null;
  const keyItems = (view?.keyItems ?? []).slice(0, MAX_KEY_ITEMS);
  const hasSingleItemLens = Boolean(view && view.metrics.totalItems === 1 && featuredItem);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] xl:col-span-2">
          <CardHeader className="space-y-2 p-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Lead Insight</p>
            <p className="text-sm leading-relaxed text-[var(--cb-text-primary)]">
              {view?.leadInsight ?? 'No lead insight available for this lens.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <Badge
              variant="outline"
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
                toneBadgeClass(brief.marketSignal.tone)
              )}
            >
              {brief.marketSignal.tone}
            </Badge>
            <p className="text-xs leading-relaxed text-[var(--cb-text-muted)]">
              {hasSingleItemLens
                ? 'This lens is concentrated in one primary transaction, so the read-through is about selectivity rather than breadth.'
                : brief.marketSignal.headline}
            </p>
          </CardContent>
        </Card>

        <div className="xl:col-span-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Featured Item</p>
          <FeedFeaturedCard item={featuredItem} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Disclosed Volume</p>
            <p className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">
              {view ? formatDealSize(view.metrics.disclosedVolume) : 'n/a'}
            </p>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
              {view ? `${view.metrics.disclosedItems} of ${view.metrics.totalItems} items disclosed economics` : 'No metrics'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Average Size</p>
            <p className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">
              {view?.metrics.avgDisclosedSize !== null && view?.metrics.avgDisclosedSize !== undefined
                ? formatDealSize(view.metrics.avgDisclosedSize)
                : 'Undisclosed'}
            </p>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
              {view?.metrics.disclosedItems === 1 ? 'Single disclosed transaction this week' : 'Average disclosed size in this lens'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Dominant Category</p>
            <p className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">
              {view?.metrics.dominantCategory ? getDealCategoryLabel(view.metrics.dominantCategory) : 'Mixed'}
            </p>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Most common transaction type in this feed</p>
          </CardContent>
        </Card>
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Largest Deal</p>
            <p className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">
              {view?.metrics.largestDealCompany ?? 'n/a'}
            </p>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
              {view?.metrics.largestDealSize ? formatDealSize(view.metrics.largestDealSize) : 'Undisclosed economics'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] xl:col-span-3">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Key Developments</p>
              <Badge
                variant="outline"
                className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--cb-text-muted)]"
              >
                {keyItems.length} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {keyItems.length > 0 ? (
              <ul className="divide-y divide-[var(--cb-border-subtle)]">
                {keyItems.map((item) => (
                  <KeyDevelopmentRow key={`${feed}-${item.id}`} item={item} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--cb-text-muted)]">
                {hasSingleItemLens
                  ? 'No secondary items cleared the threshold for this lens; this week’s signal is concentrated in the featured transaction.'
                  : 'No additional items were mapped into this feed for the selected week.'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] xl:col-span-2">
          <CardHeader className="space-y-2 p-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Trend Snapshot</p>
            <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">
              {view?.trendSnapshot ?? 'No trend signal generated for this lens yet.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Analyst Take</p>
            <p className="text-xs leading-relaxed text-[var(--cb-text-body)]">{view?.analystTake ?? brief.analystTake}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type DealIntelligenceTerminalProps = {
  briefs: WeeklyDealBriefWithResolvedDeal[];
};

export function DealIntelligenceTerminal({ briefs }: DealIntelligenceTerminalProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>(briefs[0]?.week ?? '');
  const [selectedFeed, setSelectedFeed] = useState<DealFeedType>(DEAL_FEEDS[0]);

  const selectedBrief = useMemo(
    () => briefs.find((brief) => brief.week === selectedWeek) ?? briefs[0] ?? null,
    [briefs, selectedWeek]
  );

  const visibleFeeds = useMemo(
    () =>
      selectedBrief
        ? DEAL_FEEDS.filter((feed) => {
            const view = selectedBrief.feedViews.find((entry) => entry.feed === feed);
            return Boolean(view && view.metrics.totalItems > 0);
          })
        : [],
    [selectedBrief]
  );

  useEffect(() => {
    if (visibleFeeds.length === 0) return;
    if (!visibleFeeds.includes(selectedFeed)) {
      setSelectedFeed(visibleFeeds[0]);
    }
  }, [selectedFeed, visibleFeeds]);

  if (!selectedBrief) return null;

  return (
    <div className="space-y-4">
      <Card className="border-[var(--cb-border)] bg-[var(--cb-surface)]">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">Weekly Header</p>
            <p className="mt-1 text-lg font-semibold leading-tight text-[var(--cb-text-primary)]">{selectedBrief.title}</p>
            <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
              {selectedBrief.week} • {formatWeekDateRange(selectedBrief.startDate, selectedBrief.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
                toneBadgeClass(selectedBrief.marketSignal.tone)
              )}
            >
              {selectedBrief.marketSignal.tone}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--cb-text-muted)]"
            >
              {selectedBrief.allDeals.length} total items
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--cb-border)] bg-[var(--cb-surface)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">Week Selector</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          <div className="flex min-w-max gap-2 pb-1">
            {briefs.map((brief) => (
              <button
                type="button"
                key={brief.week}
                onClick={() => setSelectedWeek(brief.week)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left transition-colors',
                  selectedWeek === brief.week
                    ? 'border-[var(--cb-border)] bg-[var(--cb-surface-subtle)]'
                    : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] hover:border-[var(--cb-border)]'
                )}
              >
                <p className="text-xs font-semibold text-[var(--cb-text-primary)]">{brief.week}</p>
                <p className="text-[10px] text-[var(--cb-text-muted)]">{formatWeekDateRange(brief.startDate, brief.endDate)}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs value={selectedFeed} onValueChange={(value) => setSelectedFeed(value as DealFeedType)} className="w-full">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] p-1">
          {visibleFeeds.map((feed) => (
            <TabsTrigger
              key={feed}
              value={feed}
              className="rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--cb-text-muted)] data-[state=active]:border-[var(--cb-border)] data-[state=active]:bg-[var(--cb-surface-subtle)] data-[state=active]:text-[var(--cb-text-primary)]"
            >
              {feed}
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleFeeds.map((feed) => (
          <TabsContent key={`${selectedBrief.week}-${feed}`} value={feed} className="mt-3">
            <FeedPanel brief={selectedBrief} feed={feed} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
