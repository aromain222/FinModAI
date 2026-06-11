import type { QuantAnalystKey } from '@/lib/pm/monitoring/types';

export type QuantThresholds = {
  change: number;
  escalation: number;
};

const DEFAULT_CHANGE_THRESHOLDS: Record<QuantAnalystKey, number> = {
  fundamentals: 15,
  growth: 15,
  news_sentiment: 20,
  sentiment: 20,
  technicals: 15,
  valuation: 15,
};

const DEFAULT_ESCALATION_THRESHOLDS: Record<QuantAnalystKey, number> = {
  fundamentals: 25,
  growth: 20,
  news_sentiment: 25,
  sentiment: 25,
  technicals: 20,
  valuation: 20,
};

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envKey(key: QuantAnalystKey): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function thresholdsFor(key: QuantAnalystKey): QuantThresholds {
  const suffix = envKey(key);
  const defaultChange = envNumber('QUANT_SIGNAL_CHANGE_THRESHOLD', DEFAULT_CHANGE_THRESHOLDS[key]);
  const defaultEscalation = envNumber('QUANT_SIGNAL_ESCALATION_THRESHOLD', DEFAULT_ESCALATION_THRESHOLDS[key]);
  return {
    change: envNumber(`QUANT_${suffix}_CHANGE_THRESHOLD`, defaultChange),
    escalation: envNumber(`QUANT_${suffix}_ESCALATION_THRESHOLD`, defaultEscalation),
  };
}

export function valuationOverextendedScore(): number {
  return envNumber('QUANT_VALUATION_OVEREXTENDED_SCORE', 30);
}

export function technicalBreakScore(): number {
  return envNumber('QUANT_TECHNICAL_BREAK_SCORE', 35);
}
