import type { QuantAnalystKey, QuantScoreComponents } from '@/lib/pm/monitoring/types';

type MarketInputs = {
  price: number | null;
  changePct: number | null;
  pe: number | null;
  forwardPe: number | null;
  high52w: number | null;
  low52w: number | null;
  revenueGrowthPct?: number | null;
  ebitdaMarginPct?: number | null;
  netMarginPct?: number | null;
  netDebtToEbitda?: number | null;
  forecastReturnPct?: number | null;
  momentum20dPct?: number | null;
  annualizedVolatilityPct?: number | null;
  analystTargetUpsidePct?: number | null;
  newsScore?: number | null;
};

const TARGET_DETERMINISTIC_WEIGHT: Record<QuantAnalystKey, number> = {
  fundamentals: 0.6,
  growth: 0.6,
  news_sentiment: 0.25,
  sentiment: 0.35,
  technicals: 0.75,
  valuation: 0.75,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function inverseMultipleScore(multiple: number): number {
  if (multiple <= 0) return 20;
  if (multiple <= 12) return 85;
  if (multiple <= 18) return 72;
  if (multiple <= 25) return 58;
  if (multiple <= 35) return 43;
  if (multiple <= 50) return 30;
  return 18;
}

function optionalScore(label: string, value: number | null | undefined, score: (value: number) => number) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? []
    : [{ label, score: clamp(score(value)) }];
}

function deterministicInputs(
  analystKey: QuantAnalystKey,
  market: MarketInputs,
): Array<{ label: string; score: number }> {
  const rangePosition =
    market.price !== null
    && market.high52w !== null
    && market.low52w !== null
    && market.high52w > market.low52w
      ? clamp((market.price - market.low52w) / (market.high52w - market.low52w), 0, 1)
      : null;

  if (analystKey === 'technicals') {
    return [
      ...(rangePosition === null ? [] : [{
        label: '52-week range position',
        score: 20 + rangePosition * 70,
      }]),
      ...(market.changePct === null ? [] : [{
        label: 'one-day price momentum',
        score: clamp(50 + market.changePct * 5),
      }]),
      ...optionalScore('20-day momentum', market.momentum20dPct, value => 50 + value * 2.2),
      ...optionalScore('horizon forecast return', market.forecastReturnPct, value => 50 + value * 2),
      ...optionalScore('annualized volatility', market.annualizedVolatilityPct, value => 80 - value),
    ];
  }

  if (analystKey === 'valuation') {
    return [
      ...(market.pe === null ? [] : [{
        label: 'trailing P/E',
        score: inverseMultipleScore(market.pe),
      }]),
      ...(market.forwardPe === null ? [] : [{
        label: 'forward P/E',
        score: inverseMultipleScore(market.forwardPe),
      }]),
      ...optionalScore('consensus target upside', market.analystTargetUpsidePct, value => 50 + value * 1.5),
    ];
  }

  if (analystKey === 'growth') {
    return [
      ...(market.pe !== null && market.forwardPe !== null && market.pe > 0 ? [{
          label: 'forward versus trailing earnings multiple',
          score: clamp(50 + ((market.pe - market.forwardPe) / market.pe) * 140),
        }] : []),
      ...optionalScore('historical revenue growth', market.revenueGrowthPct, value => 45 + value * 2),
    ];
  }

  if (analystKey === 'fundamentals') {
    return [
      ...optionalScore('EBITDA margin', market.ebitdaMarginPct, value => 35 + value * 1.8),
      ...optionalScore('net margin', market.netMarginPct, value => 40 + value * 1.6),
      ...optionalScore('net debt / EBITDA', market.netDebtToEbitda, value => 80 - Math.max(0, value) * 16),
    ];
  }

  if (analystKey === 'news_sentiment') {
    return optionalScore('verified headline sentiment', market.newsScore, value => value);
  }

  return [];
}

export function buildHybridScore(params: {
  analystKey: QuantAnalystKey;
  llmScore: number;
  market: MarketInputs;
  asOf: string;
}): QuantScoreComponents {
  const inputs = deterministicInputs(params.analystKey, params.market);
  const deterministicScore = average(inputs.map(input => input.score));
  const maxInputs: Record<QuantAnalystKey, number> = {
    fundamentals: 3,
    growth: 2,
    news_sentiment: 1,
    sentiment: 1,
    technicals: 5,
    valuation: 3,
  };
  const deterministicCoverage = clamp(inputs.length / maxInputs[params.analystKey], 0, 1);
  const deterministicWeight = deterministicScore === null
    ? 0
    : TARGET_DETERMINISTIC_WEIGHT[params.analystKey] * deterministicCoverage;
  const llmWeight = 1 - deterministicWeight;
  const llmScore = clamp(params.llmScore);
  const score = Math.round(
    (deterministicScore ?? 50) * deterministicWeight + llmScore * llmWeight,
  );

  return {
    score,
    deterministicScore: deterministicScore === null ? null : Math.round(deterministicScore),
    llmScore: Math.round(llmScore),
    deterministicWeight: Math.round(deterministicWeight * 100) / 100,
    llmWeight: Math.round(llmWeight * 100) / 100,
    deterministicCoverage: Math.round(deterministicCoverage * 100) / 100,
    deterministicInputs: inputs.map(input => input.label),
    asOf: params.asOf,
  };
}

export function signalFromHybridScore(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score >= 60) return 'bullish';
  if (score <= 40) return 'bearish';
  return 'neutral';
}
