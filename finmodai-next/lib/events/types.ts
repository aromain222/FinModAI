export type ImpactDirection = 'up' | 'down' | 'flat' | 'unknown';

export type EventImpact = {
  score: number; // 0-100
  direction: 'risk_on' | 'risk_off' | 'mixed' | 'neutral';
  confidence: number; // 0-1
  primaryChannel: 'rates' | 'fx' | 'equities' | 'credit' | 'commodities' | 'macro';
  channels: {
    rates: number; // -3..+3
    fx: number; // -3..+3
    equities: number; // -3..+3
    credit: number; // -3..+3
    commodities: number; // -3..+3
  };
  whyItMatters: string;
  transmission: string[];
  likelyWinners: string[];
  likelyLosers: string[];
  watchNext: string[];
  timeHorizon: 'intraday' | '1w' | '1-3m' | '3-12m';
};

export type EventWithImpact<T = any> = T & {
  impact?: EventImpact;
  tags?: string[];
};
