export type EventLinkedModelSourceType = 'feed_item' | 'pasted_text';
export type EventLinkedModelSignal = 'positive' | 'negative' | 'mixed' | 'neutral';
export type EventLinkedModelImpactSeverity = 'low' | 'medium' | 'high';
export type EventLinkedModelSuggestionDirection = 'up' | 'down' | 'flat';

export type EventLinkedModelDriverKey =
  | 'revenue_growth'
  | 'operating_margin'
  | 'cogs_percentage'
  | 'opex_percentage'
  | 'wacc'
  | 'terminal_growth_rate'
  | 'multiple';

export type EventLinkedModelDriverChange = {
  old: number | null;
  new: number | null;
};

export type EventLinkedModelDriverChanges = Record<
  EventLinkedModelDriverKey,
  EventLinkedModelDriverChange
>;

export type EventLinkedModelEventSource = {
  sourceType: EventLinkedModelSourceType;
  eventId?: string | null;
  title?: string | null;
  rawEventText: string;
  publishedAt?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  impactedTickers?: string[] | null;
  impactedSectors?: string[] | null;
  horizon?: string | null;
  severity?: number | null;
};

export type EventLinkedModelCompanyContext = {
  companyName?: string | null;
  ticker?: string | null;
  sector?: string | null;
  industry?: string | null;
};

export type EventLinkedModelCurrentAssumptions = {
  revenue_growth: number | null;
  operating_margin: number | null;
  wacc: number | null;
  terminal_growth_rate: number | null;
};

export type EventLinkedModelApplicability = {
  scope: 'company_specific' | 'sector_wide' | 'macro';
  relevanceSummary: string;
  companyMatch: boolean;
  sectorMatch: boolean;
};

export type EventLinkedModelImpactItem = {
  key: string;
  label: string;
  signal: EventLinkedModelSignal;
  severity: EventLinkedModelImpactSeverity;
  summary: string;
};

export type EventLinkedModelSuggestedAssumption = {
  driver: Extract<
    EventLinkedModelDriverKey,
    'revenue_growth' | 'operating_margin' | 'wacc' | 'terminal_growth_rate'
  >;
  label: string;
  direction: EventLinkedModelSuggestionDirection;
  magnitude: EventLinkedModelImpactSeverity;
  rationale: string;
};

export type EventLinkedModelTranscription = {
  eventSummary: string;
  whatChanged: string;
  whyItMatters: string;
  transmissionChannels: string[];
  companyExposure: string;
  suggestedImpacts: {
    business: EventLinkedModelImpactItem[];
    market: EventLinkedModelImpactItem[];
    model: EventLinkedModelImpactItem[];
  };
  suggestedAssumptions: EventLinkedModelSuggestedAssumption[];
  confidence: 'low' | 'medium' | 'high';
  warnings: string[];
};

export type EventLinkedModelChangedDriver = {
  driver: EventLinkedModelDriverKey;
  label: string;
  old: number | null;
  new: number | null;
  rationale: string;
};

export type EventLinkedModelAdjustmentInput = {
  event: EventLinkedModelEventSource;
  company: EventLinkedModelCompanyContext;
  currentAssumptions: EventLinkedModelCurrentAssumptions;
  modelType?: string | null;
};

export type EventLinkedModelAdjustmentResult = {
  event: EventLinkedModelEventSource;
  eventCategory: string;
  confidence: 'low' | 'medium' | 'high';
  normalizedEventSummary: string;
  scenarioBias: 'bullish' | 'base' | 'bearish' | 'mixed' | 'neutral';
  applicability: EventLinkedModelApplicability;
  transcription: EventLinkedModelTranscription;
  changes: EventLinkedModelDriverChanges;
  changedDrivers: EventLinkedModelChangedDriver[];
  normalizedOverrides: Record<string, unknown>;
  warnings: string[];
  blockingErrors: string[];
  hasMaterialChanges: boolean;
  summary: string;
  detailedReasoning: string;
};
