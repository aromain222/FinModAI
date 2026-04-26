/**
 * useTradingSignal
 *
 * Production-grade hook for /api/trading-signal:
 *   - AbortController cancels in-flight requests when a new call arrives
 *   - Deduplication: skips re-call when valuation_gap change < 0.5% and
 *     event count/ticker are unchanged
 *   - Debounce is handled by the caller (HeadlinesPanel uses 600ms setTimeout)
 *   - Cleans up on unmount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventImpact } from '@/types/eventStack';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TradingSignalRequest {
  ticker:            string;
  current_price:     number;
  base_valuation:    number;
  updated_valuation: number;
  event_stack: Pick<
    EventImpact,
    | 'headline'
    | 'ticker'
    | 'timestamp'
    | 'marginal_valuation_delta_pct'
    | 'cumulative_valuation_delta_pct'
    | 'impact_summary'
  >[];
  scenarios: {
    base:     { valuation_delta_pct: number };
    upside:   { valuation_delta_pct: number };
    downside: { valuation_delta_pct: number };
  };
}

export interface TradingSignal {
  ticker:            string;
  current_price:     number;
  base_valuation:    number;
  updated_valuation: number;
  valuation_gap_pct: number;

  processed_events_count: number;

  signal: {
    direction:    'long' | 'short' | 'neutral';
    conviction:   number;
    time_horizon: 'intraday' | 'short_term' | 'medium_term';
  };

  edge: {
    valuation_gap_pct: number;
    market_mispricing: 'underreacting' | 'overreacting' | 'efficient';
    catalyst_strength: 'low' | 'medium' | 'high';
  };

  position: {
    size_pct:        number;
    entry_zone:      { min: number; max: number };
    stop_loss_pct:   number;
    take_profit_pct: number;
  };

  risk: {
    primary_risk:           string;
    scenario_skew:          'upside' | 'downside' | 'balanced';
    volatility_expectation: 'low' | 'medium' | 'high';
  };

  drivers: string[];

  probabilities?: {
    bull:       number;
    base:       number;
    bear:       number;
    confidence: number;
  };

  _meta?: {
    event_count:        number;
    active_event_count: number;
    half_life_hrs:      number;
    prob_override?:     boolean;
    fallback?:          boolean;
  };
}

// ── Cache key ─────────────────────────────────────────────────────────────────

interface LastCallSnapshot {
  ticker:            string;
  event_count:       number;
  valuation_gap_pct: number; // rounded to 1 decimal for comparison
}

const GAP_THRESHOLD = 0.5; // pp — skip call if gap moved less than this

function computeGapPct(params: TradingSignalRequest): number {
  if (params.current_price === 0) return 0;
  return (
    ((params.updated_valuation - params.current_price) / Math.abs(params.current_price)) * 100
  );
}

function shouldSkip(
  snapshot: LastCallSnapshot | null,
  params: TradingSignalRequest
): boolean {
  if (!snapshot) return false;
  if (snapshot.ticker      !== params.ticker)             return false;
  if (snapshot.event_count !== params.event_stack.length) return false;

  const newGap = computeGapPct(params);
  return Math.abs(newGap - snapshot.valuation_gap_pct) < GAP_THRESHOLD;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTradingSignal() {
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState<string | null>(null);
  const [signal,  setSignal ] = useState<TradingSignal | null>(null);

  // Track the in-flight AbortController so we can cancel it on the next call
  const abortRef       = useRef<AbortController | null>(null);
  // Cache snapshot to deduplicate redundant calls
  const lastCallRef    = useRef<LastCallSnapshot | null>(null);
  // Track whether the component is still mounted
  const mountedRef     = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cancel any in-flight request on unmount
      abortRef.current?.abort();
    };
  }, []);

  const analyze = useCallback(
    async (params: TradingSignalRequest): Promise<TradingSignal | null> => {
      // Deduplication guard
      if (shouldSkip(lastCallRef.current, params)) {
        return signal;
      }

      // Cancel the previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/trading-signal', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(params),
          signal:  controller.signal,
        });

        if (!mountedRef.current) return null;

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error((err as { error?: string }).error ?? `HTTP ${response.status}`);
        }

        const data = (await response.json()) as TradingSignal;

        if (!mountedRef.current) return null;

        // Update dedup snapshot
        lastCallRef.current = {
          ticker:            params.ticker,
          event_count:       params.event_stack.length,
          valuation_gap_pct: Math.round(computeGapPct(params) * 10) / 10,
        };

        setSignal(data);
        return data;
      } catch (err) {
        if (!mountedRef.current) return null;
        // AbortError is not a real error — just a cancelled request
        if (err instanceof Error && err.name === 'AbortError') return null;

        const msg = err instanceof Error ? err.message : 'Failed to generate trading signal';
        setError(msg);
        return null;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    // `signal` deliberately not in deps — we only need the ref-stable values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    lastCallRef.current = null;
    setSignal(null);
    setError(null);
  }, []);

  return { loading, error, signal, analyze, reset } as const;
}
