import { type DealIntelligenceDataProvider } from '@/lib/deal-intelligence/providers/provider';
import { demoDealIntelligenceProvider } from '@/lib/deal-intelligence/providers/demoDealIntelligenceProvider';
import { demoDealIntelligenceArticleProvider } from '@/lib/deal-intelligence/providers/demoDealIntelligenceArticleProvider';
import { type DealIntelligenceArticleProvider } from '@/lib/deal-intelligence/providers/articleProvider';
import { transformRawArticlesToWeeklyBriefs } from '@/lib/deal-intelligence/pipeline';
import { buildWeeklyFeedViews, normalizeWeeklyBriefFeeds } from '@/lib/deal-intelligence/feedViews';
import {
  type DealCategory,
  type DealEntry,
  type WeeklyDealBrief,
  type WeeklyDealBriefWithResolvedDeal,
} from '@/lib/deal-intelligence/types';

function emptyDealFlow(): Record<DealCategory, DealEntry[]> {
  return {
    'M&A': [],
    'Venture Funding': [],
    'Private Equity / Buyouts': [],
    ECM: [],
    DCM: [],
    'Strategic Partnership': [],
    Restructuring: [],
  };
}

function groupDealsByCategory(deals: DealEntry[]): Record<DealCategory, DealEntry[]> {
  const grouped = emptyDealFlow();
  for (const deal of deals) {
    grouped[deal.category].push(deal);
  }
  return grouped;
}

function resolveDealOfWeek(allDeals: DealEntry[]): DealEntry | null {
  return allDeals.find((deal) => deal.featured) ?? allDeals[0] ?? null;
}

function withDefaultSourceAttribution(briefs: WeeklyDealBrief[]): WeeklyDealBrief[] {
  // TODO(source attribution): replace demo fallbacks with ingestion-time attribution from
  // signed sources/articles (URL + fetched timestamp + publisher metadata).
  return briefs.map((brief) => ({
    ...brief,
    sourceAttribution:
      brief.sourceAttribution ??
      [
        {
          sourceType: 'demo',
          sourceName: 'CapitalBase Demo Deal Dataset',
          notes: 'Synthetic sample feed for product demos.',
        },
      ],
    deals: brief.deals.map((deal) => ({
      ...deal,
      sourceAttribution:
        deal.sourceAttribution ??
        [
          {
            sourceType: 'demo',
            sourceName: 'CapitalBase Demo Deal Dataset',
          },
        ],
    })),
  }));
}

async function maybeApplyAISummaryEnrichment(briefs: WeeklyDealBrief[]): Promise<WeeklyDealBrief[]> {
  // TODO(OpenAI-generated summaries): enrich/refresh marketSignal + analystTake using
  // ranked source packets, then persist output to Supabase cache before returning.
  return briefs;
}

function resolveWeeklyBriefProvider(): DealIntelligenceDataProvider {
  // TODO(Supabase integration): add a Supabase provider and switch here using env flags
  // (example: DEAL_INTELLIGENCE_PROVIDER=supabase) once tables/migrations are finalized.
  return demoDealIntelligenceProvider;
}

function resolveArticleProvider(): DealIntelligenceArticleProvider {
  // TODO(article ingestion): replace with Supabase-backed or queue-backed article provider
  // once ingestion writes normalized raw articles into storage.
  return demoDealIntelligenceArticleProvider;
}

async function maybeBuildBriefsFromIngestedArticles(): Promise<WeeklyDealBrief[] | null> {
  const articleProvider = resolveArticleProvider();

  // TODO(article ingestion): tune lookback window + limits based on production throughput.
  let rawArticles: Awaited<ReturnType<DealIntelligenceArticleProvider['listRawArticles']>>;
  try {
    rawArticles = await articleProvider.listRawArticles({ limit: 500 });
  } catch (error) {
    console.error('[deal-intelligence] article provider failed, falling back to weekly brief provider', error);
    return null;
  }

  if (rawArticles.length === 0) return null;

  // TODO(deal extraction / AI summaries): the pipeline is already scaffolded for
  // LLM extraction + weekly narrative generation; wire model adapters there.
  let transformedBriefs: WeeklyDealBrief[];
  try {
    transformedBriefs = await transformRawArticlesToWeeklyBriefs({ articles: rawArticles });
  } catch (error) {
    console.error('[deal-intelligence] article pipeline failed, falling back to weekly brief provider', error);
    return null;
  }

  return transformedBriefs.length > 0 ? transformedBriefs : null;
}

/**
 * Canonical read entrypoint used by UI layers.
 * Keeps presentation components decoupled from storage/provider details.
 */
export async function getWeeklyDealIntelligenceBriefs(): Promise<WeeklyDealBriefWithResolvedDeal[]> {
  const provider = resolveWeeklyBriefProvider();
  const articleDerivedBriefs = await maybeBuildBriefsFromIngestedArticles();
  let providerBriefs: WeeklyDealBrief[] = [];
  if (!articleDerivedBriefs) {
    try {
      providerBriefs = await provider.listWeeklyBriefs();
    } catch (error) {
      console.error('[deal-intelligence] weekly brief provider failed, using demo fallback', error);
      providerBriefs = await demoDealIntelligenceProvider.listWeeklyBriefs();
    }
  }

  const rawBriefs = articleDerivedBriefs ?? providerBriefs;
  const attributedBriefs = withDefaultSourceAttribution(rawBriefs);
  const enrichedBriefs = await maybeApplyAISummaryEnrichment(attributedBriefs);
  const sorted = [...enrichedBriefs].sort((a, b) => b.date.localeCompare(a.date));

  return sorted.map((brief) => {
    const normalizedBrief = normalizeWeeklyBriefFeeds(brief);
    const allDeals = normalizedBrief.deals;

    return {
      ...normalizedBrief,
      dealFlow: groupDealsByCategory(allDeals),
      allDeals,
      dealOfWeek: resolveDealOfWeek(allDeals),
      feedViews: buildWeeklyFeedViews(normalizedBrief),
    };
  });
}

/**
 * Operational boundary for scheduled data refresh.
 */
export async function refreshWeeklyDealIntelligence(reason: 'manual' | 'scheduled' | 'startup' = 'manual'): Promise<void> {
  const provider = resolveWeeklyBriefProvider();

  // TODO(weekly scheduled refreshes): call this from Vercel Cron (weekly) and from
  // backfill jobs. Persist refresh telemetry (started_at, completed_at, status, source count).
  if (!provider.refreshWeeklyBriefs) return;

  await provider.refreshWeeklyBriefs({
    reason,
    triggeredAtIso: new Date().toISOString(),
  });
}
