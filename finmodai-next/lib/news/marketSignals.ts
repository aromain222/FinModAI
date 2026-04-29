/**
 * Translates processed EventItems into actionable market signals.
 * Pure rule-based — no LLM required, always produces output.
 */

import type { EventItem, Direction } from '@/lib/news/api/shared';

export type SignalDirection = 'long' | 'short' | 'neutral';

export type MarketSignal = {
  ticker: string;
  direction: SignalDirection;
  confidence: number; // 0–1
  drivers: string[];
  event_ids: string[];
  decay_adjusted_confidence: number; // confidence * avg time_decay_weight
};

type TickerAccumulator = {
  ticker: string;
  longScore: number;
  shortScore: number;
  drivers: string[];
  event_ids: string[];
  totalDecay: number;
  count: number;
};

function directionToScore(d: Direction): number {
  if (d === 'up') return 1;
  if (d === 'down') return -1;
  return 0;
}

function confidenceMultiplier(c: EventItem['confidence']): number {
  if (c === 'high') return 1.0;
  if (c === 'medium') return 0.65;
  return 0.35;
}

function toSignalDirection(long: number, short: number): SignalDirection {
  const net = long - short;
  if (net > 0.15) return 'long';
  if (net < -0.15) return 'short';
  return 'neutral';
}

/**
 * Derives per-ticker market signals from an array of scored events.
 * Aggregates across multiple events referencing the same ticker.
 */
export function deriveMarketSignals(events: EventItem[]): MarketSignal[] {
  const accumulator = new Map<string, TickerAccumulator>();

  for (const event of events) {
    const weight = (event.impact_score ?? 0.5) * confidenceMultiplier(event.confidence);
    const decay = event.time_decay_weight ?? 0.5;

    for (const { ticker, direction, rationale } of event.impacted_tickers) {
      if (!ticker || ticker.length < 1 || ticker.length > 5) continue;

      const existing = accumulator.get(ticker) ?? {
        ticker,
        longScore: 0,
        shortScore: 0,
        drivers: [],
        event_ids: [],
        totalDecay: 0,
        count: 0,
      };

      const directionalScore = directionToScore(direction) * weight * decay;
      if (directionalScore > 0) existing.longScore += directionalScore;
      else if (directionalScore < 0) existing.shortScore += Math.abs(directionalScore);

      if (rationale && existing.drivers.length < 4) {
        existing.drivers.push(`${ticker}: ${rationale}`);
      }
      if (!existing.event_ids.includes(event.id)) existing.event_ids.push(event.id);
      existing.totalDecay += decay;
      existing.count += 1;

      accumulator.set(ticker, existing);
    }
  }

  const signals: MarketSignal[] = [];

  for (const acc of accumulator.values()) {
    const totalScore = acc.longScore + acc.shortScore;
    if (totalScore < 0.05) continue; // filter noise

    const direction = toSignalDirection(acc.longScore, acc.shortScore);
    const rawConfidence = Math.min(totalScore / acc.count, 1.0);
    const avgDecay = acc.count > 0 ? acc.totalDecay / acc.count : 0.5;

    signals.push({
      ticker: acc.ticker,
      direction,
      confidence: Math.round(rawConfidence * 100) / 100,
      drivers: [...new Set(acc.drivers)].slice(0, 4),
      event_ids: acc.event_ids,
      decay_adjusted_confidence: Math.round(rawConfidence * avgDecay * 100) / 100,
    });
  }

  return signals
    .sort((a, b) => b.decay_adjusted_confidence - a.decay_adjusted_confidence)
    .slice(0, 25);
}

/**
 * Rule-based headline classifier for quick sentiment tagging
 * without any LLM call. Supplements inferEventImpact.
 */
export function classifyHeadlineSentiment(title: string): {
  sentiment: 'positive' | 'negative' | 'neutral';
  impact_score: number;
  reason: string;
} {
  const lower = title.toLowerCase();

  // Strongly negative patterns
  if (/\b(ceo|cfo|coo|president)\b.{0,30}\b(fired|ousted|resign|depart|replac)/i.test(title)) {
    return { sentiment: 'negative', impact_score: 0.85, reason: 'management_change:negative' };
  }
  if (/\b(bankrupt|default|restructur|chapter\s*11|insolvency)\b/i.test(title)) {
    return { sentiment: 'negative', impact_score: 0.92, reason: 'credit_event:negative' };
  }
  if (/\b(recall|fraud|investigation|lawsuit|fine|penalty|sanction)\b/i.test(title)) {
    return { sentiment: 'negative', impact_score: 0.72, reason: 'risk_event:negative' };
  }
  if (/\b(miss(ed)?|disappoint|below.{0,15}(estimate|expect|forecast)|guidance\s+(cut|lower))\b/i.test(title)) {
    return { sentiment: 'negative', impact_score: 0.78, reason: 'earnings:miss' };
  }

  // Strongly positive patterns
  if (/\b(beat|exceed|surpass|above.{0,15}(estimate|expect|forecast)|record\s+(revenue|profit|earnings))\b/i.test(title)) {
    return { sentiment: 'positive', impact_score: 0.76, reason: 'earnings:beat' };
  }
  if (/\b(acqui(re|sition)|merger|deal|buyout|take.?over)\b/i.test(title)) {
    return { sentiment: 'positive', impact_score: 0.80, reason: 'ma:announced' };
  }
  if (/\b(rate\s+cut|cuts\s+rate|dovish|easing|stimulus)\b/i.test(title)) {
    return { sentiment: 'positive', impact_score: 0.82, reason: 'policy:dovish' };
  }
  if (/\b(guidance\s+(raise|raise?d?|increas|upgrad)|dividend\s+increas|buyback)\b/i.test(title)) {
    return { sentiment: 'positive', impact_score: 0.70, reason: 'corporate_action:positive' };
  }

  // Macro positive
  if (/\b(rate\s+hike|tighten|inflation\s+(surge|jump|surges?|hot))\b/i.test(lower)) {
    return { sentiment: 'negative', impact_score: 0.68, reason: 'macro:hawkish' };
  }

  return { sentiment: 'neutral', impact_score: 0.35, reason: 'no_signal' };
}
