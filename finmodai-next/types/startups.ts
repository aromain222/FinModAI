/**
 * Startups Impact-Weighted Signals System
 * 
 * Institutional-grade signal dashboard with transparent, explainable scoring.
 * Every number must be traceable to its source and calculation.
 */

export type SignalType = 
  | "mentions" 
  | "funding" 
  | "hiring" 
  | "layoffs" 
  | "regulation" 
  | "lawsuit" 
  | "partnership" 
  | "product" 
  | "press";

export type SignalDirection = "positive" | "negative" | "neutral";
export type SignalConfidence = "high" | "medium" | "low";
export type ImpactDirection = "up" | "down" | "flat";
export type ImpactStrength = "mild" | "moderate" | "strong";
export type Timeframe = "7d" | "30d" | "90d";

export interface SignalSource {
  domain: string;
  url?: string;
  title?: string;
  publishedAt?: string;
}

export interface SignalImpact {
  id: string;
  type: SignalType;
  direction: SignalDirection;
  impactScore: number; // 0..100
  contribution: number; // signed contribution (-100 to +100)
  description: string; // short sentence
  detail?: string; // optional extra (amounts, %, stage, etc.)
  confidence: SignalConfidence;
  sources?: SignalSource[];
  ts?: string; // ISO date when known
}

export interface TimelineGroup {
  date: string; // ISO date
  items: SignalImpact[];
}

export interface StartupImpactSummary {
  timeframe: Timeframe;
  totalPositiveImpact: number; // sum of positive contributions
  totalNegativeImpact: number; // sum of absolute negative contributions
  netImpact: number; // pos - neg (signed)
  direction: ImpactDirection;
  strength: ImpactStrength;
  explanation: string; // 1-2 sentence human explanation
  marketImpact: number; // portion attributable to market themes
  companyImpact: number; // portion attributable to company-specific events
  bullDrivers: SignalImpact[]; // top 3 positive
  bearDrivers: SignalImpact[]; // top 3 negative
  timeline: TimelineGroup[]; // grouped for expand view
  
  // Before/after comparison
  priorPeriodNetImpact?: number; // net impact from previous equal period
  delta?: number; // change vs prior period
}

export interface StartupRow {
  id: string;
  name: string;
  oneLiner: string; // what they do
  sector: string;
  website?: string;
  logoUrl?: string;
  impact: StartupImpactSummary;
  signals: SignalImpact[]; // full list
  rank?: number; // assigned by UI
}

export interface StartupFilters {
  timeframe: Timeframe;
  sector: string | null;
  signalTypes: SignalType[];
  confidence: SignalConfidence[];
  searchQuery: string;
}

