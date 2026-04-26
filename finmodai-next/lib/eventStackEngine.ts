/**
 * eventStackEngine.ts
 *
 * Pure functions for event stacking. All state lives in the caller;
 * these functions never read or write React state.
 *
 * Key invariant: the current model is ALWAYS recomputed from base_model
 * by replaying every event's deltas in order. Cached snapshots on
 * EventImpact objects are convenience copies, never the source of truth.
 */

import { applyEventMutation, type CurrentModel } from './applyEventMutation';
import { computeValuation } from './frameEngine';
import type { BaseAssumptions } from './frameEngine';
import type { EventImpact, EventStack } from '@/types/eventStack';

// ─── Core replay ────────────────────────────────────────────────────────────

/**
 * Replay every event's deltas onto baseModel in order.
 * The result is the authoritative current model for a given stack slice.
 */
export function applyEventStack(
  baseModel: CurrentModel,
  events: ReadonlyArray<Pick<EventImpact, 'deltas'>>
): CurrentModel {
  let model: CurrentModel = { ...baseModel };
  for (const event of events) {
    model = applyEventMutation(model, event.deltas);
  }
  return model;
}

// ─── Mutation helpers ────────────────────────────────────────────────────────

/**
 * Remove one event by id. Does NOT recompute cached snapshots — call
 * recomputeStackSnapshots() after this if you need up-to-date caches.
 */
export function removeEvent(stack: EventStack, eventId: string): EventStack {
  return {
    ...stack,
    events: stack.events.filter((e) => e.id !== eventId),
  };
}

/**
 * Recompute every event's resulting_model, marginal_valuation_delta_pct,
 * and cumulative_valuation_delta_pct after the stack is mutated (add/remove).
 * Must be called any time the events array changes.
 */
export function recomputeStackSnapshots(stack: EventStack): EventStack {
  const baseEv = computeEv(stack.base_model);

  const recomputed: EventImpact[] = stack.events.map((event, i) => {
    const priorModel =
      i === 0
        ? stack.base_model
        : applyEventStack(stack.base_model, stack.events.slice(0, i));

    const resultingModel = applyEventMutation(priorModel, event.deltas);
    const priorEv = computeEv(priorModel);
    const currentEv = computeEv(resultingModel);

    const marginal =
      priorEv === 0 ? 0 : ((currentEv - priorEv) / Math.abs(priorEv)) * 100;
    const cumulative =
      baseEv === 0 ? 0 : ((currentEv - baseEv) / Math.abs(baseEv)) * 100;

    return {
      ...event,
      resulting_model: resultingModel,
      marginal_valuation_delta_pct: marginal,
      cumulative_valuation_delta_pct: cumulative,
    };
  });

  return { ...stack, events: recomputed };
}

// ─── Valuation helpers ───────────────────────────────────────────────────────

/**
 * Convert a CurrentModel (decimal-form assumptions) into BaseAssumptions
 * for frameEngine.computeValuation. Revenue is normalised to 1 000 so
 * percentage deltas are comparable across companies.
 */
export function modelToBaseAssumptions(model: CurrentModel): BaseAssumptions {
  const spread = model.wacc - model.terminal_growth;
  const exitMultiple =
    spread > 0.001 ? Math.min(30, Math.max(5, Math.round(1 / spread))) : 12;

  return {
    revenue: 1_000,
    revenueGrowth: model.revenue_growth,
    ebitdaMargin: model.ebitda_margin,
    taxRate: 0.21,
    capexPct: model.capex_pct_revenue,
    nwcPct: 0.02,
    discountRate: model.wacc,
    exitMultiple,
    projectionYears: 5,
  };
}

/** Enterprise value of a CurrentModel (normalised to revenue = 1 000). */
export function computeEv(model: CurrentModel): number {
  return computeValuation(modelToBaseAssumptions(model)).enterpriseValue;
}

/**
 * Cumulative EV % change from base_model to after applying events[0..upToIndex].
 */
export function computeCumulativeDelta(
  baseModel: CurrentModel,
  events: ReadonlyArray<Pick<EventImpact, 'deltas'>>,
  upToIndex: number
): number {
  const baseEv = computeEv(baseModel);
  if (baseEv === 0) return 0;
  const model = applyEventStack(baseModel, events.slice(0, upToIndex + 1));
  return ((computeEv(model) - baseEv) / Math.abs(baseEv)) * 100;
}

/**
 * Marginal EV % change for a single event (step i-1 → step i).
 */
export function computeMarginalDelta(
  baseModel: CurrentModel,
  events: ReadonlyArray<Pick<EventImpact, 'deltas'>>,
  index: number
): number {
  const priorModel =
    index === 0 ? baseModel : applyEventStack(baseModel, events.slice(0, index));
  const afterModel = applyEventStack(baseModel, events.slice(0, index + 1));

  const priorEv = computeEv(priorModel);
  if (priorEv === 0) return 0;
  return ((computeEv(afterModel) - priorEv) / Math.abs(priorEv)) * 100;
}
