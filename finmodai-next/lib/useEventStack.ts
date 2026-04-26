/**
 * useEventStack
 *
 * React hook that owns the full event-stacking lifecycle:
 *   – addEvent / removeEvent (with automatic snapshot recomputation)
 *   – timeline replay (step forward/backward, play animation)
 *   – derived currentModel + activeModel (live or replay)
 *
 * Callers never manipulate raw stack state directly — they go through
 * this hook's API so invariants (always recompute from base) are maintained.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEventStack,
  recomputeStackSnapshots,
  removeEvent as engineRemoveEvent,
  computeEv,
  computeMarginalDelta,
  computeCumulativeDelta,
  modelToBaseAssumptions,
} from './eventStackEngine';
import { applyEventMutation } from './applyEventMutation';
import type { CurrentModel, AssumptionDeltas } from './applyEventMutation';
import type { EventImpact, EventStack } from '@/types/eventStack';

// ─── Playback ────────────────────────────────────────────────────────────────

const PLAYBACK_INTERVAL_MS = 800;
const PLAYBACK_HOLD_MS = 1_200; // pause at the last step before exiting replay

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEventStack(initialBaseModel: CurrentModel) {
  const [stack, setStack] = useState<EventStack>(() => ({
    base_model: { ...initialBaseModel },
    events: [],
  }));

  const [timelineIndex, setTimelineIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────

  /** Model with all stacked events applied. The source of truth for "now". */
  const currentModel = useMemo(
    () => applyEventStack(stack.base_model, stack.events),
    [stack]
  );

  /**
   * Model at the active replay position, or currentModel when not replaying.
   * Always read from `activeModel` to drive UI — it handles both modes.
   */
  const activeModel = useMemo(() => {
    if (timelineIndex === null) return currentModel;
    return applyEventStack(stack.base_model, stack.events.slice(0, timelineIndex + 1));
  }, [timelineIndex, currentModel, stack]);

  /** Total EV delta from base to now (percentage). */
  const totalDeltaPct = useMemo(() => {
    if (stack.events.length === 0) return 0;
    return stack.events[stack.events.length - 1].cumulative_valuation_delta_pct;
  }, [stack.events]);

  // ── Stack mutations ─────────────────────────────────────────────────────

  /**
   * Push a new event onto the stack. Computes snapshots and contributions
   * synchronously inside the state updater so the result is always consistent.
   */
  const addEvent = useCallback(
    (
      headline: string,
      ticker: string,
      deltas: AssumptionDeltas,
      impact_summary?: EventImpact['impact_summary']
    ): void => {
      setStack((prev) => {
        const priorModel = applyEventStack(prev.base_model, prev.events);
        const resultingModel = applyEventMutation(priorModel, deltas);

        const allDeltas = [...prev.events, { deltas }] as Array<Pick<EventImpact, 'deltas'>>;
        const lastIdx = allDeltas.length - 1;

        const newEvent: EventImpact = {
          id: crypto.randomUUID(),
          headline,
          ticker,
          timestamp: Date.now(),
          deltas,
          resulting_model: resultingModel,
          marginal_valuation_delta_pct: computeMarginalDelta(prev.base_model, allDeltas, lastIdx),
          cumulative_valuation_delta_pct: computeCumulativeDelta(prev.base_model, allDeltas, lastIdx),
          impact_summary,
        };

        return { ...prev, events: [...prev.events, newEvent] };
      });

      // Exit replay so the user sees the freshly added event immediately.
      setTimelineIndex(null);
    },
    []
  );

  /**
   * Remove an event by id and recompute all snapshots from scratch.
   * The model is always derived from base — removing a middle event correctly
   * shifts every subsequent event's impact.
   */
  const removeEvent = useCallback((eventId: string): void => {
    setStack((prev) => {
      const withoutEvent = engineRemoveEvent(prev, eventId);
      return recomputeStackSnapshots(withoutEvent);
    });
    // Exit replay mode — index may now be out of range.
    setTimelineIndex(null);
  }, []);

  /** Remove all events and exit replay. */
  const clearStack = useCallback((): void => {
    setStack((prev) => ({ ...prev, events: [] }));
    setTimelineIndex(null);
  }, []);

  // ── Timeline replay ─────────────────────────────────────────────────────

  const stopPlayback = useCallback((): void => {
    if (playTimerRef.current !== null) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  /**
   * Animate through events one-by-one at PLAYBACK_INTERVAL_MS cadence,
   * then hold on the last step before exiting replay mode.
   */
  const playTimeline = useCallback((): void => {
    if (stack.events.length === 0) return;

    stopPlayback();
    setTimelineIndex(0);
    setIsPlaying(true);

    let idx = 1;
    playTimerRef.current = setInterval(() => {
      if (idx < stack.events.length) {
        setTimelineIndex(idx);
        idx++;
      } else {
        // Reached the end — stop the interval and hold briefly.
        if (playTimerRef.current !== null) {
          clearInterval(playTimerRef.current);
          playTimerRef.current = null;
        }
        setIsPlaying(false);
        setTimeout(() => setTimelineIndex(null), PLAYBACK_HOLD_MS);
      }
    }, PLAYBACK_INTERVAL_MS);
  }, [stack.events.length, stopPlayback]);

  /** Jump directly to a specific step index (or null = live). */
  const jumpToIndex = useCallback((i: number | null): void => {
    stopPlayback();
    setTimelineIndex(i);
  }, [stopPlayback]);

  /** Exit replay and return to live current model. */
  const exitReplay = useCallback((): void => {
    stopPlayback();
    setTimelineIndex(null);
  }, [stopPlayback]);

  // Cleanup on unmount.
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // ── Public API ──────────────────────────────────────────────────────────

  return {
    stack,
    currentModel,
    activeModel,
    totalDeltaPct,
    timelineIndex,
    isPlaying,
    isReplaying: timelineIndex !== null,
    addEvent,
    removeEvent,
    clearStack,
    playTimeline,
    stopPlayback,
    exitReplay,
    jumpToIndex,
  } as const;
}
