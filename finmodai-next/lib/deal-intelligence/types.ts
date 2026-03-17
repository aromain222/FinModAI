export const DEAL_CATEGORIES = [
  'M&A',
  'Venture Funding',
  'Private Equity / Buyouts',
  'ECM',
  'DCM',
  'Strategic Partnership',
  'Restructuring',
] as const;

export type DealCategory = (typeof DEAL_CATEGORIES)[number];

export type MarketSignalTone = 'Risk-On' | 'Balanced' | 'Risk-Off';

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'] as const;
export type DealCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type SourceType = 'demo' | 'supabase' | 'openai' | 'newswire' | 'manual';

export type SourceAttribution = {
  sourceType: SourceType;
  sourceName: string;
  sourceUrl?: string;
  fetchedAt?: string;
  notes?: string;
};

export const DEAL_FEEDS = [
  'VC',
  'IB',
  'Consulting',
  'Capital Markets',
  'PE / Buyouts',
  'Macro / Markets',
] as const;

export type DealFeedType = (typeof DEAL_FEEDS)[number];

export type DealFeedFrame = {
  feed: DealFeedType;
  summary?: string;
  whyItMatters?: string;
  tags?: string[];
  featured?: boolean;
};

export type WeeklyFeedSnapshot = {
  feed: DealFeedType;
  leadInsight: string;
  trendSnapshot: string;
};

export type FeedDealItem = {
  id: string;
  week: string;
  title: string;
  company: string;
  counterparty: string | null;
  category: DealCategory;
  dealType: string;
  dealSize: number | null;
  currency: DealCurrency;
  summary: string;
  whyItMatters: string;
  tags: string[];
  feed: DealFeedType;
  inclusionRationale?: string;
  quantitativeContext?: string;
};

export type FeedMetrics = {
  totalItems: number;
  disclosedItems: number;
  undisclosedItems: number;
  disclosedVolume: number;
  avgDisclosedSize: number | null;
  dominantCategory: DealCategory | null;
  largestDealCompany: string | null;
  largestDealSize: number | null;
};

export type WeeklyFeedView = {
  feed: DealFeedType;
  leadInsight: string;
  featuredItem: FeedDealItem | null;
  keyItems: FeedDealItem[];
  trendSnapshot: string;
  analystTake: string;
  metrics: FeedMetrics;
};

/**
 * Canonical deal entity used by the UI.
 * This shape is source-agnostic and works for demo seeds, Supabase rows, or AI-generated entries.
 */
export type DealEntry = {
  id: string;
  week: string;
  title: string;
  date: string; // ISO date
  company: string;
  counterparty: string | null;
  dealType: string;
  category: DealCategory;
  dealSize: number | null; // in millions, e.g. 1500 = $1.5B
  currency: DealCurrency;
  sector: string;
  summary: string;
  whyItMatters: string;
  tags: string[];
  featured: boolean;
  feedFrames?: DealFeedFrame[];
  sourceAttribution?: SourceAttribution[];
};

export type WeeklyDealIntelligence = {
  id: string;
  week: string;
  title: string;
  date: string; // week-ending date for sorting
  startDate: string; // ISO date
  endDate: string; // ISO date
  marketSignal: {
    tone: MarketSignalTone;
    headline: string;
    detail: string;
  };
  analystTake: string;
  deals: DealEntry[];
  feedSnapshots?: WeeklyFeedSnapshot[];
  sourceAttribution?: SourceAttribution[];
};

export type WeeklyDealIntelligenceWithResolvedDeal = WeeklyDealIntelligence & {
  dealFlow: Record<DealCategory, DealEntry[]>;
  allDeals: DealEntry[];
  dealOfWeek: DealEntry | null;
  feedViews: WeeklyFeedView[];
};

/**
 * Supabase-compatible row shape for deal entries.
 * Add/remove columns here as the DB schema evolves without changing UI-facing types.
 */
export type DealEntryRow = {
  id: string;
  week: string;
  title: string;
  date: string;
  company: string;
  counterparty: string | null;
  deal_type: string;
  category: string | null;
  deal_size: number | null;
  currency: string | null;
  sector: string | null;
  summary: string;
  why_it_matters: string;
  tags: string[] | null;
  featured: boolean | null;
  feed_frames?: DealFeedFrame[] | null;
};

/**
 * Supabase-compatible row shape for weekly briefs.
 */
export type WeeklyDealIntelligenceRow = {
  id: string;
  week: string;
  title: string;
  date: string;
  start_date: string;
  end_date: string;
  market_signal_tone: MarketSignalTone;
  market_signal_headline: string;
  market_signal_detail: string;
  analyst_take: string;
};

/**
 * AI output can be partial; normalize before serving to UI.
 */
export type AIDealEntryOutput = Partial<DealEntry> & {
  id?: string;
  company?: string;
  category?: DealCategory;
  feedFrames?: DealFeedFrame[];
};

/**
 * Backward-compatible aliases used by existing feature code.
 */
export type WeeklyDealBrief = WeeklyDealIntelligence;
export type WeeklyDealBriefWithResolvedDeal = WeeklyDealIntelligenceWithResolvedDeal;
