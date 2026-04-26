/**
 * eventStack.ts
 *
 * Core types for the event stacking / timeline replay system.
 * An EventStack is an ordered list of market events layered on top of a
 * base financial model. The current model is always recomputed from base
 * by applying every event's deltas in sequence — snapshots are cached for
 * display only and must never be trusted as authoritative state.
 */

import type { CurrentModel, AssumptionDeltas } from '@/lib/applyEventMutation';

export type { CurrentModel, AssumptionDeltas };

export type EventImpact = {
  /** Stable unique identifier */
  id: string;
  /** Full headline text */
  headline: string;
  /** Ticker/company hint used when calling /api/event-impact */
  ticker: string;
  /** Unix epoch ms */
  timestamp: number;

  /** Raw deltas returned by the LLM */
  deltas: AssumptionDeltas;

  /**
   * Cached model snapshot *at this step* (base + events[0..this]).
   * Always recomputed when the stack mutates — treat as display cache only.
   */
  resulting_model: CurrentModel;

  /**
   * Marginal EV % change caused by this event alone (prior model → this step).
   * Positive = EV went up, negative = EV went down.
   */
  marginal_valuation_delta_pct: number;

  /**
   * Cumulative EV % change from base_model to this step.
   */
  cumulative_valuation_delta_pct: number;

  /** Enriched metadata from the LLM (optional — may be absent on parse error) */
  impact_summary?: {
    primary_driver: string;
    direction: 'positive' | 'negative' | 'mixed';
    magnitude: 'low' | 'medium' | 'high';
  };
};

export type EventStack = {
  /** The model state before any events were applied. Fixed at stack creation. */
  base_model: CurrentModel;
  /** Ordered list of events, earliest first. */
  events: EventImpact[];
};
