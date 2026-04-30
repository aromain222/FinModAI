/**
 * useEventImpact
 *
 * React hook that manages the full lifecycle of an event → model mutation call.
 * Exposes loading, error, result, and an `analyze()` trigger.
 *
 * Usage:
 *   const { loading, error, result, analyze, reset } = useEventImpact();
 *   await analyze({ company, ticker, headline, current_model });
 */

import { useCallback, useState } from 'react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import type { CurrentModel } from './applyEventMutation';

// ─── Public types ────────────────────────────────────────────────────────────

export interface EventImpactRequest {
  company:       string;
  ticker:        string;
  headline:      string;
  context?:      string;
  current_model: CurrentModel;
}

export interface ScenarioValuation {
  valuation_delta_pct: number;
}

export interface EventImpactResult {
  company:       string;
  ticker:        string;
  headline:      string;
  current_model: CurrentModel;
  updated_model: CurrentModel;

  assumption_deltas: {
    revenue_growth_delta:    number;
    ebitda_margin_delta_bps: number;
    wacc_delta_bps:          number;
    terminal_growth_delta:   number;
    capex_delta_pct_revenue: number;
  };

  scenarios: {
    base:     ScenarioValuation;
    upside:   ScenarioValuation;
    downside: ScenarioValuation;
  };

  impact_summary: {
    primary_driver: string;
    direction:      'positive' | 'negative' | 'mixed';
    magnitude:      'low' | 'medium' | 'high';
  };

  mechanism: string[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useEventImpact() {
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState<string | null>(null);
  const [result,  setResult ] = useState<EventImpactResult | null>(null);

  const analyze = useCallback(async (params: EventImpactRequest): Promise<EventImpactResult | null> => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/event-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const parsedResponse = await readJsonResponse(response);
      if (!parsedResponse.ok) {
        setError(parsedResponse.message);
        return null;
      }

      const data: unknown = parsedResponse.data;

      if (!response.ok) {
        const msg = data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Request failed (${response.status})`;
        setError(msg);
        return null;
      }

      const impact = data as EventImpactResult;
      setResult(impact);
      return impact;
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : 'Network error';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { loading, error, result, analyze, reset };
}
