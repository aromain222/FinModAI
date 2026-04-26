/**
 * useTradingSignal
 *
 * Hook that manages the full lifecycle of a /api/trading-signal call.
 * Exposes loading, error, signal, analyze(), and reset().
 */

import { useCallback, useState } from 'react';
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

  signal: {
    direction:    'long' | 'short' | 'neutral';
    conviction:   number;           // 0–1
    time_horizon: 'intraday' | 'short_term' | 'medium_term';
  };

  edge: {
    valuation_gap_pct: number;
    market_mispricing: 'underreacting' | 'overreacting' | 'efficient';
    catalyst_strength: 'low' | 'medium' | 'high';
  };

  position: {
    size_pct:        number;         // 0–0.10
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

  _meta?: {
    event_count:        number;
    active_event_count: number;
    decay_constant_hrs: number;
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTradingSignal() {
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState<string | null>(null);
  const [signal,  setSignal ] = useState<TradingSignal | null>(null);

  const analyze = useCallback(
    async (params: TradingSignalRequest): Promise<TradingSignal | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/trading-signal', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(params),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error((err as { error?: string }).error ?? `HTTP ${response.status}`);
        }

        const data = (await response.json()) as TradingSignal;
        setSignal(data);
        return data;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to generate trading signal';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setSignal(null);
    setError(null);
  }, []);

  return { loading, error, signal, analyze, reset } as const;
}
