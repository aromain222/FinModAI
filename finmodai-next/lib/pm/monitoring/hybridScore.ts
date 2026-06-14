import type { QuantAnalystKey, QuantScoreComponents } from '@/lib/pm/monitoring/types';

type MarketInputs = {
  price: number | null;
  changePct: number | null;
  pe: number | null;
  forwardPe: number | null;
  high52w: number | null;
  low52w: number | null;
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
    ];
  }

  if (analystKey === 'growth') {
    return market.pe !== null && market.forwardPe !== null && market.pe > 0
      ? [{
          label: 'forward versus trailing earnings multiple',
          score: clamp(50 + ((market.pe - market.forwardPe) / market.pe) * 140),
        }]
      : [];
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
  const maxInputs = params.analystKey === 'technicals' || params.analystKey === 'valuation' ? 2 : 1;
  const deterministicCoverage = clamp(inputs.length / maxInputs, 0, 1);
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
