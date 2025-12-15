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

export interface MacroNewsArticle {
  id: string;
  title: string;
  source: string;
  publishedAt: string; // ISO
  url: string;
  summary: string; // AI-generated short summary
  aiInsight: string; // AI opinion/oversight line
  sentiment: 'bullish' | 'bearish' | 'neutral';
  tags?: string[];
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

