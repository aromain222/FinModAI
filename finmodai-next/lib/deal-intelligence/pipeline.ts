import {
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfISOWeek,
} from 'date-fns';
import {
  type DealCategory,
  type DealCurrency,
  type DealEntry,
  type MarketSignalTone,
  type WeeklyDealBrief,
} from '@/lib/deal-intelligence/types';

export type RawDealArticle = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string; // ISO datetime
  summary?: string | null;
  body?: string | null;
  extractedDeals?: ExtractedDealCandidate[];
};

export type ExtractedDealCandidate = {
  title?: string | null;
  company?: string | null;
  counterparty?: string | null;
  dealType?: string | null;
  category?: DealCategory | string | null;
  dealSize?: number | null;
  currency?: DealCurrency | string | null;
  sector?: string | null;
  summary?: string | null;
  whyItMatters?: string | null;
  tags?: string[] | null;
  eventDate?: string | null; // ISO date
  featured?: boolean | null;
};

type NormalizedDealDraft = Omit<DealEntry, 'id' | 'week' | 'featured' | 'date'> & {
  week: string;
  date: string;
  startDate: string;
  endDate: string;
  featuredHint: boolean;
  sourceArticleId: string;
  dedupeKey: string;
};

type WeekBucket = {
  week: string;
  startDate: string;
  endDate: string;
  deals: DealEntry[];
  rawArticles: RawDealArticle[];
};

export type WeeklyNarrativeInput = {
  week: string;
  startDate: string;
  endDate: string;
  deals: DealEntry[];
  rawArticles: RawDealArticle[];
};

export type WeeklyNarrativeOutput = {
  title: string;
  marketSignal: {
    tone: MarketSignalTone;
    headline: string;
    detail: string;
  };
  analystTake: string;
};

export interface DealExtractionEngine {
  extractFromArticle(article: RawDealArticle): Promise<ExtractedDealCandidate[]>;
}

export interface WeeklyNarrativeWriter {
  writeWeeklyNarrative(input: WeeklyNarrativeInput): Promise<WeeklyNarrativeOutput>;
}

/**
 * Default extraction engine used in demo mode.
 * Future AI integration should replace this engine with LLM-backed extraction.
 */
export class SeededFieldDealExtractionEngine implements DealExtractionEngine {
  async extractFromArticle(article: RawDealArticle): Promise<ExtractedDealCandidate[]> {
    return article.extractedDeals ?? [];
  }
}

/**
 * Rule-based fallback narrative writer for demo mode.
 * Future AI integration should replace this with a model-driven writer.
 */
export class RuleBasedWeeklyNarrativeWriter implements WeeklyNarrativeWriter {
  async writeWeeklyNarrative(input: WeeklyNarrativeInput): Promise<WeeklyNarrativeOutput> {
    const categoryCounts = new Map<DealCategory, number>();
    for (const deal of input.deals) {
      categoryCounts.set(deal.category, (categoryCounts.get(deal.category) ?? 0) + 1);
    }

    const rankedCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
    const primary = rankedCategories[0] ?? 'M&A';
    const secondary = rankedCategories[1] ?? 'ECM';

    const distressedCount = categoryCounts.get('Restructuring') ?? 0;
    const growthCount = (categoryCounts.get('Venture Funding') ?? 0) + (categoryCounts.get('M&A') ?? 0) + (categoryCounts.get('ECM') ?? 0);
    const tone: MarketSignalTone =
      distressedCount >= 2 ? 'Risk-Off' : growthCount >= Math.max(3, Math.floor(input.deals.length / 2)) ? 'Risk-On' : 'Balanced';

    const featured = input.deals.find((deal) => deal.featured) ?? input.deals[0];
    const title = `${primary} and ${secondary} Lead Weekly Deal Flow`;

    return {
      title,
      marketSignal: {
        tone,
        headline: `${primary} activity set the pace while ${secondary} remained active.`,
        detail: `Deal flow was concentrated in ${primary.toLowerCase()} with ${input.deals.length} notable transactions across the week.`,
      },
      analystTake: featured
        ? `The highest-conviction setup remains ${featured.sector.toLowerCase()}, where strategic buyers and sponsors are still paying for workflow control and recurring revenue visibility.`
        : 'Deal flow remains active, but capital is still selective around quality, earnings durability, and refinancing clarity.',
    };
  }
}

export const seededFieldDealExtractionEngine = new SeededFieldDealExtractionEngine();
export const ruleBasedWeeklyNarrativeWriter = new RuleBasedWeeklyNarrativeWriter();

function parseWeekParts(isoDate: string): { week: string; startDate: string; endDate: string; eventDate: string } | null {
  const parsed = parseISO(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const isoWeekYear = getISOWeekYear(parsed);
  const isoWeek = String(getISOWeek(parsed)).padStart(2, '0');
  const week = `${isoWeekYear}-W${isoWeek}`;

  return {
    week,
    startDate: format(startOfISOWeek(parsed), 'yyyy-MM-dd'),
    endDate: format(endOfISOWeek(parsed), 'yyyy-MM-dd'),
    eventDate: format(parsed, 'yyyy-MM-dd'),
  };
}

function normalizeDealCategory(rawCategory: ExtractedDealCandidate['category'], dealType: string): DealCategory {
  const normalized = (rawCategory ?? '').toString().trim().toLowerCase();
  if (normalized === 'm&a' || normalized.includes('acquisition') || normalized.includes('merger')) return 'M&A';
  if (normalized.includes('venture')) return 'Venture Funding';
  if (normalized.includes('private equity') || normalized.includes('buyout') || normalized === 'pe') return 'Private Equity / Buyouts';
  if (normalized === 'ecm' || normalized.includes('equity capital markets') || normalized.includes('ipo') || normalized.includes('follow-on'))
    return 'ECM';
  if (normalized === 'dcm' || normalized.includes('debt capital markets') || normalized.includes('notes') || normalized.includes('term loan'))
    return 'DCM';
  if (normalized.includes('partnership') || normalized.includes('alliance')) return 'Strategic Partnership';
  if (normalized.includes('restructuring') || normalized.includes('distressed') || normalized.includes('recap')) return 'Restructuring';

  const dealTypeNormalized = dealType.trim().toLowerCase();
  if (dealTypeNormalized.includes('ipo') || dealTypeNormalized.includes('follow-on')) return 'ECM';
  if (dealTypeNormalized.includes('notes') || dealTypeNormalized.includes('term loan') || dealTypeNormalized.includes('bond')) return 'DCM';
  if (dealTypeNormalized.includes('partnership') || dealTypeNormalized.includes('alliance')) return 'Strategic Partnership';
  if (dealTypeNormalized.includes('restructuring') || dealTypeNormalized.includes('exchange') || dealTypeNormalized.includes('recap'))
    return 'Restructuring';
  if (dealTypeNormalized.includes('buyout') || dealTypeNormalized.includes('take-private')) return 'Private Equity / Buyouts';
  if (dealTypeNormalized.includes('series')) return 'Venture Funding';
  return 'M&A';
}

function normalizeCurrency(value: ExtractedDealCandidate['currency']): DealCurrency {
  const normalized = (value ?? 'USD').toString().trim().toUpperCase();
  if (normalized === 'EUR' || normalized === 'GBP' || normalized === 'JPY' || normalized === 'CAD') return normalized;
  return 'USD';
}

function normalizeDealSize(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildDealId(week: string, company: string, dealType: string, index: number): string {
  const slug = slugify(`${company}-${dealType}`) || `deal-${index}`;
  return `${week}-${slug}-${index + 1}`;
}

function normalizeTags(tags: string[] | null | undefined, category: DealCategory, sector: string): string[] {
  const clean = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const next = clean.length > 0 ? clean : [sector, category];
  return [...new Set(next)].slice(0, 6);
}

function normalizeCandidate(article: RawDealArticle, candidate: ExtractedDealCandidate): NormalizedDealDraft | null {
  const company = candidate.company?.trim();
  if (!company) return null;

  const dealType = candidate.dealType?.trim() || 'Undisclosed Transaction';
  const weekInfo = parseWeekParts(candidate.eventDate ?? article.publishedAt);
  if (!weekInfo) return null;

  const category = normalizeDealCategory(candidate.category, dealType);
  const sector = candidate.sector?.trim() || 'General';
  const summary = candidate.summary?.trim() || article.summary?.trim() || article.title;
  const whyItMatters = candidate.whyItMatters?.trim() || `This ${category.toLowerCase()} event is relevant for sector positioning and capital allocation.`;

  return {
    week: weekInfo.week,
    date: weekInfo.eventDate,
    startDate: weekInfo.startDate,
    endDate: weekInfo.endDate,
    title: candidate.title?.trim() || `${company} ${dealType}`,
    company,
    counterparty: candidate.counterparty?.trim() || null,
    dealType,
    category,
    dealSize: normalizeDealSize(candidate.dealSize),
    currency: normalizeCurrency(candidate.currency),
    sector,
    summary,
    whyItMatters,
    tags: normalizeTags(candidate.tags, category, sector),
    featuredHint: Boolean(candidate.featured),
    sourceArticleId: article.id,
    dedupeKey: [
      company.toLowerCase(),
      (candidate.counterparty ?? '').toLowerCase(),
      dealType.toLowerCase(),
      category.toLowerCase(),
      weekInfo.eventDate,
    ].join('|'),
    sourceAttribution: [
      {
        sourceType: 'newswire',
        sourceName: article.sourceName,
        sourceUrl: article.url,
        fetchedAt: article.publishedAt,
      },
    ],
  };
}

function selectFeaturedDeal(deals: DealEntry[]): DealEntry[] {
  if (deals.length === 0) return deals;
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < deals.length; index += 1) {
    const sizeScore = deals[index].dealSize ?? 0;
    const featuredBoost = deals[index].featured ? 1_000_000 : 0;
    const score = sizeScore + featuredBoost;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return deals.map((deal, index) => ({ ...deal, featured: index === bestIndex }));
}

function createWeekBucket(week: string, startDate: string, endDate: string): WeekBucket {
  return {
    week,
    startDate,
    endDate,
    deals: [],
    rawArticles: [],
  };
}

/**
 * AI-ready transformation pipeline:
 * raw articles -> normalized deal items -> grouped weekly intelligence brief -> UI-ready feed
 */
export async function transformRawArticlesToWeeklyBriefs(params: {
  articles: RawDealArticle[];
  extractionEngine?: DealExtractionEngine;
  narrativeWriter?: WeeklyNarrativeWriter;
}): Promise<WeeklyDealBrief[]> {
  const extractionEngine = params.extractionEngine ?? seededFieldDealExtractionEngine;
  const narrativeWriter = params.narrativeWriter ?? ruleBasedWeeklyNarrativeWriter;
  const weekBuckets = new Map<string, WeekBucket>();

  for (const article of params.articles) {
    // TODO(deal extraction): replace seeded extraction with LLM extraction + schema validation.
    const candidates = await extractionEngine.extractFromArticle(article);
    if (candidates.length === 0) continue;

    for (const candidate of candidates) {
      const normalized = normalizeCandidate(article, candidate);
      if (!normalized) continue;

      let bucket = weekBuckets.get(normalized.week);
      if (!bucket) {
        bucket = createWeekBucket(normalized.week, normalized.startDate, normalized.endDate);
        weekBuckets.set(normalized.week, bucket);
      }

      if (bucket.deals.some((existing) => {
        const existingKey = [
          existing.company.toLowerCase(),
          (existing.counterparty ?? '').toLowerCase(),
          existing.dealType.toLowerCase(),
          existing.category.toLowerCase(),
          existing.date,
        ].join('|');
        return existingKey === normalized.dedupeKey;
      })) {
        continue;
      }

      const id = buildDealId(normalized.week, normalized.company, normalized.dealType, bucket.deals.length);
      const deal: DealEntry = {
        id,
        week: normalized.week,
        date: normalized.date,
        title: normalized.title,
        company: normalized.company,
        counterparty: normalized.counterparty,
        dealType: normalized.dealType,
        category: normalized.category,
        dealSize: normalized.dealSize,
        currency: normalized.currency,
        sector: normalized.sector,
        summary: normalized.summary,
        whyItMatters: normalized.whyItMatters,
        tags: normalized.tags,
        featured: normalized.featuredHint,
        sourceAttribution: normalized.sourceAttribution,
      };

      bucket.deals.push(deal);
      if (!bucket.rawArticles.some((raw) => raw.id === normalized.sourceArticleId)) {
        bucket.rawArticles.push(article);
      }
    }
  }

  const briefs: WeeklyDealBrief[] = [];
  const sortedBuckets = [...weekBuckets.values()].sort((a, b) => b.endDate.localeCompare(a.endDate));

  for (const bucket of sortedBuckets) {
    const deals = selectFeaturedDeal(bucket.deals);

    // TODO(AI-written market signal / analyst take): call a model here with
    // normalized weekly deal packets + source metadata and store generated prose.
    const narrative = await narrativeWriter.writeWeeklyNarrative({
      week: bucket.week,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      deals,
      rawArticles: bucket.rawArticles,
    });

    briefs.push({
      id: bucket.week,
      week: bucket.week,
      title: narrative.title,
      date: bucket.endDate,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      marketSignal: narrative.marketSignal,
      analystTake: narrative.analystTake,
      deals,
      sourceAttribution: bucket.rawArticles.map((article) => ({
        sourceType: 'newswire',
        sourceName: article.sourceName,
        sourceUrl: article.url,
        fetchedAt: article.publishedAt,
      })),
    });
  }

  return briefs;
}

export function buildDealExtractionPrompt(article: RawDealArticle): string {
  return [
    'You are extracting investment-relevant deal events from one article.',
    'Return JSON only.',
    'Extract only confirmed transactions or financings.',
    'For each event include: title, company, counterparty, dealType, category, dealSize, currency, sector, summary, whyItMatters, tags, eventDate, featured.',
    '',
    `Article title: ${article.title}`,
    `Source: ${article.sourceName}`,
    `Published at: ${article.publishedAt}`,
    `URL: ${article.url}`,
    '',
    `Summary: ${article.summary ?? ''}`,
    `Body: ${article.body ?? ''}`,
  ].join('\n');
}

export function buildWeeklyNarrativePrompt(input: WeeklyNarrativeInput): string {
  const dealLines = input.deals
    .map((deal) => {
      const size = deal.dealSize === null ? 'undisclosed' : `${deal.dealSize} ${deal.currency}m`;
      return `- ${deal.category} | ${deal.company} | ${deal.dealType} | ${size} | ${deal.sector}`;
    })
    .join('\n');

  return [
    'You are writing a concise weekly institutional deal brief.',
    'Return JSON with keys: title, marketSignal{tone,headline,detail}, analystTake.',
    'Use only information in the provided deals and sources.',
    '',
    `Week: ${input.week} (${input.startDate} to ${input.endDate})`,
    `Deals:\n${dealLines}`,
    '',
    'Focus on cause -> mechanism -> market relevance.',
  ].join('\n');
}
