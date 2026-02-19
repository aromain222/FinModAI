export type MacroSeriesType = 'market_daily' | 'macro_monthly' | 'policy_step';

export type MacroSeriesMeta = {
  type: MacroSeriesType;
  frequency: 'daily' | 'monthly' | 'event';
  unit: 'percent' | 'bps' | 'index' | 'level';
  transform: 'none' | 'pct_change' | 'yoy';
  source: string;
  displayName?: string;
};

export type MacroPoint = { date: string; value: number | null };

export type MacroSeriesQuality = {
  level: 'high' | 'medium' | 'low';
  warnings: string[];
  repeatedValuePct?: number;
  missingPct?: number;
  maxGapDays?: number;
  inferredPct?: number;
};

export type MacroSeries = {
  key: string;
  meta: MacroSeriesMeta;
  points: MacroPoint[];
  quality: MacroSeriesQuality;
};
