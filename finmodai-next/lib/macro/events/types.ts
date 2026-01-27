/**
 * Macro Events Types
 * Type definitions for raw news items and canonical macro events
 */

export type RawNewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  topics?: string[];
  tickers?: string[];
};

export type MacroEventCategory = 'geopolitics' | 'rates' | 'inflation' | 'jobs' | 'earnings' | 'policy' | 'commodities' | 'other';
export type MacroEventWindow = 'breaking' | 'developing' | 'known' | 'scheduled';
export type MacroEventConfidence = 'high' | 'medium' | 'low';

export type MacroEventSource = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
};

export type MacroEventAISynthesis = {
  synthesis: string; // 2-3 sentences max, evidence-only
  certainty: 'high' | 'medium' | 'low';
};

export type MacroEvent = {
  id: string;
  title: string; // canonical event title
  category: MacroEventCategory;
  window: MacroEventWindow;
  confidence: MacroEventConfidence;
  event_time: string | null; // ISO if known
  sources: MacroEventSource[];
  market_impact: {
    observed: Array<{ label: string; value: string; note?: string }>;
    likely_channels: string[];
    uncertainty: string[];
  };
  summary: string; // 2-4 sentences MAX, no hype
  ai_synthesis?: MacroEventAISynthesis; // Optional AI-generated synthesis
};

