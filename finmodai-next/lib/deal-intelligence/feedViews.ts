import {
  DEAL_FEEDS,
  type DealEntry,
  type DealFeedFrame,
  type DealFeedType,
  type FeedMetrics,
  type FeedDealItem,
  type WeeklyDealBrief,
  type WeeklyFeedSnapshot,
  type WeeklyFeedView,
} from '@/lib/deal-intelligence/types';
import { formatDealSize } from '@/lib/deal-intelligence/formatters';

function compactText(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function uniqueFeeds(values: DealFeedType[]): DealFeedType[] {
  return [...new Set(values)];
}

function inferFeedsByCategory(deal: DealEntry): DealFeedType[] {
  switch (deal.category) {
    case 'Venture Funding':
      return ['VC'];
    case 'M&A':
      return ['IB'];
    case 'Private Equity / Buyouts':
      return ['PE / Buyouts', 'IB'];
    case 'ECM':
      return ['Capital Markets', 'IB'];
    case 'DCM':
      return ['Capital Markets', 'Macro / Markets'];
    case 'Strategic Partnership':
      return ['Consulting'];
    case 'Restructuring':
      return ['Macro / Markets', 'IB'];
    default:
      return ['IB'];
  }
}

function inferFeedsBySectorAndTags(deal: DealEntry): DealFeedType[] {
  const text = `${deal.sector} ${deal.tags.join(' ')}`.toLowerCase();
  const feeds: DealFeedType[] = [];
  if (deal.category === 'Venture Funding' && /ai infrastructure|software|cloud|series|venture|seed|growth equity/.test(text)) {
    feeds.push('VC');
  }
  if ((deal.category === 'ECM' || deal.category === 'DCM') && /capital markets|market data|exchange|offering|ipo|notes|refinancing/.test(text)) {
    feeds.push('Capital Markets');
  }
  if (deal.category === 'Private Equity / Buyouts' && /buyout|private equity|sponsor|lbo|take-private|private credit/.test(text)) {
    feeds.push('PE / Buyouts');
  }
  if ((deal.category === 'Strategic Partnership' || deal.category === 'M&A') && /workflow|transformation|integration|automation|partnership|operating/.test(text)) {
    feeds.push('Consulting');
  }
  if ((deal.category === 'DCM' || deal.category === 'Restructuring') && /rates|macro|credit|restructuring|distressed|liability|refinancing/.test(text)) {
    feeds.push('Macro / Markets');
  }
  return feeds;
}

function buildDefaultFeedFrames(deal: DealEntry): DealFeedFrame[] {
  const inferredFeeds = uniqueFeeds([...inferFeedsByCategory(deal), ...inferFeedsBySectorAndTags(deal)]);
  const fallbackFeeds: DealFeedType[] = inferredFeeds.length > 0 ? inferredFeeds : ['IB'];
  return fallbackFeeds.map((feed) => ({
    feed,
    summary: compactText(deal.summary, 110),
    whyItMatters: compactText(deal.whyItMatters, 110),
    tags: deal.tags.slice(0, 4),
    featured: deal.featured && (feed === 'IB' || feed === fallbackFeeds[0]),
  }));
}

function normalizeFeedFrames(deal: DealEntry): DealFeedFrame[] {
  if (!deal.feedFrames || deal.feedFrames.length === 0) {
    return buildDefaultFeedFrames(deal);
  }

  const withDefaults = deal.feedFrames
    .filter((frame) => DEAL_FEEDS.includes(frame.feed))
    .map((frame) => ({
      ...frame,
      summary: compactText(frame.summary ?? deal.summary, 110),
      whyItMatters: compactText(frame.whyItMatters ?? deal.whyItMatters, 110),
      tags: (frame.tags ?? deal.tags).slice(0, 4),
      featured: frame.featured ?? false,
    }));

  if (withDefaults.length > 0) return withDefaults;
  return buildDefaultFeedFrames(deal);
}

function frameForFeed(deal: DealEntry, feed: DealFeedType): DealFeedFrame | null {
  const frames = normalizeFeedFrames(deal);
  return frames.find((frame) => frame.feed === feed) ?? null;
}

function projectDealForFeed(deal: DealEntry, feed: DealFeedType): FeedDealItem | null {
  const frame = frameForFeed(deal, feed);
  if (!frame) return null;

  return {
    id: deal.id,
    week: deal.week,
    title: compactText(deal.title, 110),
    company: deal.company,
    counterparty: deal.counterparty,
    category: deal.category,
    dealType: deal.dealType,
    dealSize: deal.dealSize,
    currency: deal.currency,
    summary: compactText(frame.summary ?? deal.summary, 110),
    whyItMatters: compactText(frame.whyItMatters ?? deal.whyItMatters, 110),
    tags: (frame.tags ?? deal.tags).slice(0, 4),
    feed,
  };
}

function buildFeedMetrics(items: FeedDealItem[]): FeedMetrics {
  const disclosedItems = items.filter((item) => (item.dealSize ?? 0) > 0);
  const disclosedVolume = disclosedItems.reduce((sum, item) => sum + (item.dealSize ?? 0), 0);
  const categoryCounts = new Map<string, number>();
  let largestDealCompany: string | null = null;
  let largestDealSize: number | null = null;

  items.forEach((item) => {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    if ((item.dealSize ?? -1) > (largestDealSize ?? -1)) {
      largestDealSize = item.dealSize;
      largestDealCompany = item.company;
    }
  });

  const dominantCategory =
    [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  return {
    totalItems: items.length,
    disclosedItems: disclosedItems.length,
    undisclosedItems: Math.max(items.length - disclosedItems.length, 0),
    disclosedVolume,
    avgDisclosedSize: disclosedItems.length > 0 ? disclosedVolume / disclosedItems.length : null,
    dominantCategory: dominantCategory as FeedMetrics['dominantCategory'],
    largestDealCompany,
    largestDealSize,
  };
}

function sortDealsBySignificance(a: FeedDealItem, b: FeedDealItem): number {
  const aSize = a.dealSize ?? -1;
  const bSize = b.dealSize ?? -1;
  if (aSize !== bSize) return bSize - aSize;
  return a.title.localeCompare(b.title);
}

function pickFeaturedItem(items: FeedDealItem[], sourceDeals: DealEntry[], feed: DealFeedType): FeedDealItem | null {
  if (items.length === 0) return null;

  const frameFeatured = sourceDeals.find((deal) => frameForFeed(deal, feed)?.featured);
  if (frameFeatured) {
    return items.find((item) => item.id === frameFeatured.id) ?? null;
  }

  const globallyFeatured = sourceDeals.find((deal) => deal.featured);
  if (globallyFeatured) {
    const projected = items.find((item) => item.id === globallyFeatured.id);
    if (projected) return projected;
  }

  return [...items].sort(sortDealsBySignificance)[0] ?? null;
}

function pickSnapshotByFeed(snapshots: WeeklyFeedSnapshot[] | undefined, feed: DealFeedType): WeeklyFeedSnapshot | null {
  return snapshots?.find((snapshot) => snapshot.feed === feed) ?? null;
}

function defaultLeadInsight(brief: WeeklyDealBrief, feed: DealFeedType, items: FeedDealItem[]): string {
  const metrics = buildFeedMetrics(items);
  if (items.length === 0) {
    return `No major ${feed.toLowerCase()} developments were captured this week; monitor carryover pipeline and financing windows.`;
  }

  const lead = items[0];
  if (metrics.totalItems === 1) {
    if (feed === 'PE / Buyouts') {
      return `${lead.company} was the only mapped sponsor transaction this week, which makes the lens narrow but still useful: it shows private capital can still finance predictable software cash flows when revenue durability is clear.`;
    }
    if (feed === 'Capital Markets') {
      return `${lead.company} was the only financing transaction in this lens this week, so the read-through is about window quality rather than issuance breadth.`;
    }
    if (feed === 'VC') {
      return `${lead.company} was the only funding signal in this lens this week, suggesting capital remains available but highly selective rather than broadly reopened.`;
    }
    return `${lead.company} was the only transaction mapped into this lens this week, so the signal is concentrated in one high-information situation rather than broad activity.`;
  }

  const volumeText =
    metrics.disclosedItems > 0
      ? `${formatDealSize(metrics.disclosedVolume)} of disclosed value across ${metrics.disclosedItems} priced items`
      : `${metrics.totalItems} tracked items with mostly undisclosed economics`;
  if (feed === 'VC') {
    return `${volumeText} was concentrated in venture-adjacent funding signals, led by ${lead.company}; the lens is in the brief because funding appetite remains selective but open for scalable software and infrastructure stories.`;
  }
  if (feed === 'PE / Buyouts') {
    return `${volumeText} points to sponsor activity staying concentrated in cash-flow-visible assets, with ${lead.company} setting the buyout tone for the week.`;
  }
  if (feed === 'Capital Markets') {
    return `${volumeText} kept the financing window open across ECM and DCM, with ${lead.company} providing the clearest read on pricing and demand quality.`;
  }
  if (feed === 'Macro / Markets') {
    return `${brief.marketSignal.headline} ${volumeText} also shows that balance-sheet quality and refinancing optionality are still the main drivers of risk appetite.`;
  }
  if (feed === 'Consulting') {
    return `${volumeText} clustered around strategy-heavy situations, which is why ${lead.company} and adjacent workflow or partnership items are included as execution-readiness signals.`;
  }
  return `${volumeText} shaped advisory priorities this week, led by ${lead.company}; the included items are the transactions most directly testing financing durability, execution quality, and strategic appetite.`;
}

function defaultTrendSnapshot(feed: DealFeedType, items: FeedDealItem[]): string {
  const metrics = buildFeedMetrics(items);
  if (items.length === 0) {
    return 'Trend snapshot: pipeline activity is light in this lens; watch for catalyst-driven reacceleration.';
  }

  if (metrics.totalItems === 1) {
    const loneItem = items[0];
    if (loneItem.dealSize !== null) {
      return `Trend snapshot: one disclosed transaction at ${formatDealSize(loneItem.dealSize)}, so the takeaway is selectivity rather than breadth.`;
    }
    return 'Trend snapshot: one strategically relevant but undisclosed transaction, so the takeaway is directional rather than volume-based.';
  }

  if (metrics.avgDisclosedSize !== null) {
    const dominantCategory = metrics.dominantCategory ? metrics.dominantCategory : 'mixed categories';
    return `Trend snapshot: ${metrics.totalItems} tracked items, ${metrics.disclosedItems} disclosed, ${formatDealSize(metrics.disclosedVolume)} disclosed volume, average disclosed size ${formatDealSize(metrics.avgDisclosedSize)}, led by ${dominantCategory.toLowerCase()}.`;
  }

  return `Trend snapshot: ${items.length} tracked items, mostly strategic developments with undisclosed economics.`;
}

function buildAnalystTake(feed: DealFeedType, brief: WeeklyDealBrief, items: FeedDealItem[]): string {
  const metrics = buildFeedMetrics(items);
  if (items.length === 0) return brief.analystTake;

  const largestDealText =
    metrics.largestDealCompany && metrics.largestDealSize
      ? `${metrics.largestDealCompany} at ${formatDealSize(metrics.largestDealSize)}`
      : metrics.largestDealCompany ?? 'the lead item';

  if (metrics.totalItems === 1) {
    if (feed === 'PE / Buyouts') {
      return `Breadth is thin, so this should be read as a proof point rather than a broad sponsor reopening. ${largestDealText} matters because it shows financing is still available for defensive, renewal-heavy software assets, but the lack of follow-on sponsor activity says underwriting remains selective.`;
    }
    if (feed === 'Capital Markets') {
      return `This is a narrow window signal, not a broad issuance surge. ${largestDealText} matters because it shows the market can still clear quality paper, but one transaction is not enough to call the financing backdrop fully open.`;
    }
    return `This lens is being driven by one primary transaction, so the right read is about signal quality rather than transaction count. ${largestDealText} is informative, but it does not yet establish broad-based momentum.`;
  }

  if (feed === 'VC') {
    return `The venture lens is in the brief because capital is still clearing for scaled themes, but not broadly. ${largestDealText} anchors the week, while smaller rounds matter mainly as proof that investors will still fund clear retention, payback, or infrastructure scarcity.`;
  }
  if (feed === 'Capital Markets') {
    return `Capital markets remain open, but only for issuers with a clean use-of-proceeds story and durable cash flow. ${largestDealText} is the best read on current window quality, while the rest of the feed shows whether issuance breadth is deepening or still narrow.`;
  }
  if (feed === 'PE / Buyouts') {
    return `Sponsors are still active, but the included deals suggest underwriting is staying concentrated in predictable software and resilient cash flows. ${largestDealText} matters because it says more about financing availability and sponsor confidence than raw deal count alone.`;
  }
  if (feed === 'Macro / Markets') {
    return `This lens matters because deal flow is doubling as a credit-and-risk barometer. ${largestDealText} and the surrounding refinancings or restructurings show where balance-sheet pressure is easing versus where markets are still forcing liability management.`;
  }
  if (feed === 'Consulting') {
    return `The consulting lens is included to show where strategy, integration, and operating execution are becoming the bottleneck after the transaction closes. ${largestDealText} is relevant less for price alone and more for what it implies about post-deal execution complexity.`;
  }
  return `The IB lens is carrying the heaviest information content this week because advisory, financing, and restructuring activity are all interacting. ${largestDealText} is the anchor transaction, and the rest of the list earns inclusion because it tests whether markets will fund scale, refinance risk, or strategic consolidation.`;
}

function buildInclusionContext(item: FeedDealItem, metrics: FeedMetrics, rank: number, feed: DealFeedType): Pick<FeedDealItem, 'inclusionRationale' | 'quantitativeContext'> {
  const rankLabel = rank === 0 ? 'largest' : rank === 1 ? 'second-largest' : rank === 2 ? 'third-largest' : `#${rank + 1}`;
  const shareOfVolume =
    item.dealSize && metrics.disclosedVolume > 0 ? (item.dealSize / metrics.disclosedVolume) * 100 : null;

  const feedReason: Record<DealFeedType, string> = {
    VC: 'it is a valuation and funding signal for private-market risk appetite',
    IB: 'it is a material advisory, financing, or restructuring signal',
    Consulting: 'it changes execution, integration, or operating priorities',
    'Capital Markets': 'it is a live read on issuance conditions and investor demand',
    'PE / Buyouts': 'it informs sponsor appetite and financing availability',
    'Macro / Markets': 'it informs credit conditions, funding stress, or broader market sentiment',
  };

  if (item.dealSize && item.dealSize > 0) {
    if (metrics.totalItems === 1) {
      return {
        inclusionRationale: `Included because ${feedReason[feed]}. It is the only transaction that met this lens threshold this week.`,
        quantitativeContext: `Only disclosed item in this lens this week at ${formatDealSize(item.dealSize)}.`,
      };
    }
    return {
      inclusionRationale:
        rank === 0
          ? `Included as the lead item because ${feedReason[feed]}. It is the largest disclosed item in this lens this week.`
          : `Included because ${feedReason[feed]} and it ranks as the ${rankLabel} disclosed item in this lens.`,
      quantitativeContext: shareOfVolume !== null
        ? `${formatDealSize(item.dealSize)} accounts for ${shareOfVolume.toFixed(1)}% of disclosed lens volume.`
        : `${formatDealSize(item.dealSize)} disclosed value.`,
    };
  }

  return {
    inclusionRationale: `Included because ${feedReason[feed]} even though economics were undisclosed.`,
    quantitativeContext: 'Economics were undisclosed, so inclusion is driven by strategic relevance rather than deal size.',
  };
}

function mergeFeedFramesIntoDeal(deal: DealEntry): DealEntry {
  return {
    ...deal,
    feedFrames: normalizeFeedFrames(deal),
  };
}

export function buildWeeklyFeedViews(brief: WeeklyDealBrief): WeeklyFeedView[] {
  const deals = brief.deals.map(mergeFeedFramesIntoDeal);

  return DEAL_FEEDS.map((feed) => {
    const projectedBase = deals
      .map((deal) => projectDealForFeed(deal, feed))
      .filter((item): item is FeedDealItem => item !== null)
      .sort(sortDealsBySignificance);

    const metrics = buildFeedMetrics(projectedBase);
    const projected = projectedBase.map((item, index) => ({
      ...item,
      ...buildInclusionContext(item, metrics, index, feed),
    }));

    const featured = pickFeaturedItem(projected, deals, feed);
    const keyItems = projected.filter((item) => item.id !== featured?.id).slice(0, 8);
    const snapshot = pickSnapshotByFeed(brief.feedSnapshots, feed);

    return {
      feed,
      leadInsight: snapshot?.leadInsight ?? defaultLeadInsight(brief, feed, projected),
      featuredItem: featured,
      keyItems,
      trendSnapshot: snapshot?.trendSnapshot ?? defaultTrendSnapshot(feed, projected),
      analystTake: buildAnalystTake(feed, brief, projected),
      metrics,
    };
  });
}

export function normalizeWeeklyBriefFeeds(brief: WeeklyDealBrief): WeeklyDealBrief {
  return {
    ...brief,
    deals: brief.deals.map(mergeFeedFramesIntoDeal),
  };
}
