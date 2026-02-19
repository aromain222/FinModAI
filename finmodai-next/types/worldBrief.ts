export type MacroRegion =
  | 'north_america'
  | 'latin_america'
  | 'europe'
  | 'middle_east'
  | 'africa'
  | 'asia_pacific'
  | 'global';

export type MacroImpactTag =
  | 'rates'
  | 'fx'
  | 'equities'
  | 'credit'
  | 'commodities'
  | 'energy'
  | 'inflation'
  | 'growth'
  | 'trade'
  | 'policy'
  | 'geopolitics';

export type MacroEventSource = {
  url: string;
  source: string;
  title: string;
  publishedAt: string;
};

export type MacroEvent = {
  id: string;
  eventTitle: string;
  whatHappened: string;
  whyItMatters: Array<{ tag: MacroImpactTag; text: string }>;
  region: MacroRegion;
  countryCodes: string[];
  impactTags: MacroImpactTag[];
  confidence: number;
  importanceScore: number;
  sources: MacroEventSource[];
  entities: string[];
  publishedAt: string;
  updatedAt: string;
};

export interface MacroEventsResponse {
  events: MacroEvent[];
  developing: MacroEvent[];
  generatedAt: string;
  rangeDays: number;
  note?: string;
}

export type WorldBriefSource = {
  source_name: string;
  published_at: string;
  title: string;
  url: string;
  snippet: string;
};

export type WorldBriefEventCard = {
  event_id: string;
  headline: string;
  what_happened: string;
  why_it_matters: string;
  key_points: string[];
  confidence: 'high' | 'med' | 'low';
  primary_regions: string[];
  tags: string[];
  sources: Array<{
    source_name: string;
    published_at: string;
    title: string;
    url: string;
  }>;
};

export type WorldBriefResponseV2 = {
  cluster_id: string;
  now_utc: string;
  region: string;
  tag: string;
  timeframe: string;
  events: WorldBriefEventCard[];
};

// Legacy World Brief types (used by older utilities and self-test routes)
export type WorldTopic =
  | 'conflict'
  | 'diplomacy'
  | 'sanctions'
  | 'trade'
  | 'elections'
  | 'energy_security'
  | 'migration'
  | 'climate_disaster'
  | 'cyber'
  | 'public_health'
  | 'other';

export type WorldRegion =
  | 'us'
  | 'europe'
  | 'china'
  | 'russia_ukraine'
  | 'middle_east'
  | 'latam'
  | 'africa'
  | 'asia'
  | 'global';

export type WorldBriefAnalysis = {
  what_happened: [string, string];
  market_impact: string[];
  affected_channels: Array<
    'equities' | 'rates' | 'FX' | 'commodities' | 'credit' | 'volatility' | 'capital_flows'
  >;
  confidence: 'low' | 'medium' | 'high';
  key_numbers: { label: string; value: string }[];
  notes: string;
};

export interface WorldBriefItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  topic: WorldTopic;
  region: WorldRegion;
  tags: string[];
  whyIncluded: string[];
  analysis: WorldBriefAnalysis;
}

export interface WorldBriefResponse {
  items: WorldBriefItem[];
  generatedAt: string;
  mode: string;
  rangeDays: number;
  aiSummary?: string;
  note?: string;
}
