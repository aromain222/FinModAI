/**
 * Live Data Mode Types
 * Used across Startups, IPO Watch, and Macro IQ
 */

export type DataMode = 'live' | 'demo';

export type StartupSignal = 'Funding' | 'Hiring' | 'Partnerships' | 'Product' | 'Press' | 'Regulation';
export type StartupSector = 'AI' | 'Fintech' | 'DevTools' | 'Healthcare' | 'Climate' | 'Consumer' | 'Enterprise' | 'Crypto';
export type MacroSentiment = 'bullish' | 'bearish' | 'neutral';

// Startup Card (Hot Startups)
export interface StartupCard {
  id: string;
  name: string;
  sector: StartupSector;
  themes: string[];
  description: string;
  momentumScore: number; // -100 to 100 (updated from 1-100)
  momentumBreakdown?: import('../momentum/types').MomentumBreakdown; // Full explainable breakdown
  signalCountsByType: Record<StartupSignal, number>;
  whyTrending: string[]; // Array of data-backed reasons (NEVER string)
  sources: string[]; // Source names, never premium claims
  lastUpdated: string; // ISO timestamp
}

// IPO Card (IPO Watch)
export interface IpoCard {
  id: string;
  name: string;
  issuer: string;
  cik: string;
  sector: StartupSector;
  filingTypes: string[]; // ['S-1', 'S-1/A', etc.]
  firstFilingDate: string; // ISO date
  lastFilingDate: string; // ISO date
  amendmentCount: number;
  ipoProbabilityScore: number; // 0-100
  ipoProbabilityExplanation: string; // Why this score
  status: 'Filed' | 'Filed (Amended)' | 'Priced' | 'Withdrawn';
  timeline: TimelinePoint[];
  gdeltMentionMomentum: number; // 0-100
  lastUpdated: string; // ISO timestamp
}

export interface TimelinePoint {
  date: string; // ISO date
  label: string; // e.g., "S-1 Filed", "Amendment #2"
  type: 'filing' | 'mention' | 'event';
}

// Theme Summary
export interface ThemeSummary {
  theme: string;
  count: number;
  sentiment: MacroSentiment;
}

// Sector Summary
export interface SectorSummary {
  sector: StartupSector;
  momentumScore: number;
  startupCount: number;
  topSignal: StartupSignal;
}

// API Response Types
export interface StartupsApiResponse {
  dataMode: DataMode;
  updatedAt: string; // ISO timestamp
  startups: StartupCard[];
  ipoWatch: IpoCard[];
  themes: ThemeSummary[];
  activeSectors: SectorSummary[];
}

export interface IpoWatchApiResponse {
  dataMode: DataMode;
  updatedAt: string;
  candidates: IpoCard[];
}

// Market Pulse (Polygon)
export interface MarketIndex {
  symbol: string;
  name: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  lastUpdated: string | null;
  status?: 'live' | 'cached' | 'placeholder';
}

export interface MarketPulseResponse {
  indices: MarketIndex[];
  generatedAt: string;
}

