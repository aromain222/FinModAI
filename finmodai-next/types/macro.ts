/**
 * Macro Data Types
 */

export type TimeRange = '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX';

export interface MacroSeriesPoint {
  date: string;
  value: number;
}

export type MacroSeries = MacroSeriesPoint[];

export interface MacroSnapshot {
  fedFunds: MacroSeries;
  treasury10Y: MacroSeries;
  cpiYoY: MacroSeries;
  unemployment: MacroSeries;
  sp500: MacroSeries;
  vix: MacroSeries;
  asOf: string;
  range: TimeRange;
}

/**
 * Macro News Types
 */

/**
 * Macro Article Analysis (per article)
 */
export interface MacroArticleAnalysis {
  what_happened_sentences: string[]; // 2-3 sentences
  market_impact_sentences: string[]; // 5-6 sentences
  second_order_effects: string[]; // 2-3 bullets
  affected_channels: string[]; // equities, rates, FX, commodities, credit, volatility, capital flows
  sentiment_by_asset: {
    equities?: 'up' | 'down' | 'mixed';
    rates?: 'up' | 'down' | 'mixed';
    usd?: 'up' | 'down' | 'mixed';
    oil?: 'up' | 'down' | 'mixed';
    credit?: 'up' | 'down' | 'mixed';
    commodities?: 'up' | 'down' | 'mixed';
    fx?: 'up' | 'down' | 'mixed';
  };
  confidence: 'low' | 'medium' | 'high';
  key_numbers?: Array<{ label: string; value: string }>; // Optional
  reasoning_short: string; // 1 sentence internal or tooltip
}

export interface MacroNewsArticle {
  id: string;
  title: string;
  source: string;
  publishedAt: string; // ISO
  url: string;
  summary: string; // AI-generated short summary (legacy - kept for backward compatibility)
  aiInsight: string; // AI opinion/oversight line (legacy)
  sentiment: 'bullish' | 'bearish' | 'neutral'; // Legacy sentiment
  tags?: string[]; // Legacy tags
  
  // New Macro IQ fields
  analysis?: MacroArticleAnalysis; // Article summary + market impact analysis
}

export interface MacroNewsResponse {
  articles: MacroNewsArticle[];
  generatedAt: string;
}

/**
 * Macro Detail Types (for expanded AI overview)
 */

export interface MacroDetail {
  whatsWorking: string[];
  whatsStruggling: string[];
  crossAssetRead: string[];
  riskFlags: string[];
}

export interface MacroOverviewResponse {
  summary: string;
  detailedBreakdown: MacroDetail;
  generatedAt: string;
  horizon: TimeRange;
}
