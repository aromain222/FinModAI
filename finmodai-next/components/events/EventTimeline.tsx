'use client';

import { useCallback } from 'react';
import { Play, Square, X, Trash2, ChevronRight } from 'lucide-react';
import type { EventStack } from '@/types/eventStack';

type EventTimelineProps = {
  stack: EventStack;
  timelineIndex: number | null;
  isPlaying: boolean;
  isReplaying: boolean;
  totalDeltaPct: number;
  onJumpToIndex: (i: number | null) => void;
  onRemoveEvent: (eventId: string) => void;
  onClearStack: () => void;
  onPlayTimeline: () => void;
  onStopPlayback: () => void;
  onExitReplay: () => void;
};

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;
  const formatted = `${positive ? '+' : ''}${value.toFixed(1)}%`;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold tabular-nums ${
        positive
          ? 'bg-emerald-950 text-emerald-400 ring-1 ring-emerald-700/50'
          : 'bg-rose-950 text-rose-400 ring-1 ring-rose-700/50'
      }`}
    >
      {formatted}
    </span>
  );
}

function formatTimestamp(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

export default function EventTimeline({
  stack,
  timelineIndex,
  isPlaying,
  isReplaying,
  totalDeltaPct,
  onJumpToIndex,
  onRemoveEvent,
  onClearStack,
  onPlayTimeline,
  onStopPlayback,
  onExitReplay,
}: EventTimelineProps) {
  const events = stack.events;

  const handleEventClick = useCallback(
    (i: number) => {
      if (timelineIndex === i) {
        onJumpToIndex(null);
      } else {
        onJumpToIndex(i);
      }
    },
    [timelineIndex, onJumpToIndex]
  );

  if (events.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Event Timeline
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 tabular-nums">
            {events.length}
          </span>
          {totalDeltaPct !== 0 && (
            <DeltaBadge value={totalDeltaPct} />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isReplaying && (
            <button
              onClick={onExitReplay}
              className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
            >
              <ChevronRight className="h-3 w-3 rotate-180" />
              Live
            </button>
          )}

          {isPlaying ? (
            <button
              onClick={onStopPlayback}
              className="flex items-center gap-1 rounded-md border border-amber-700 bg-amber-950 px-2.5 py-1 text-xs text-amber-300 hover:border-amber-500 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={onPlayTimeline}
              className="flex items-center gap-1 rounded-md border border-cyan-700 bg-cyan-950 px-2.5 py-1 text-xs text-cyan-300 hover:border-cyan-500 hover:text-cyan-100 transition-colors"
            >
              <Play className="h-3 w-3 fill-current" />
              Play
            </button>
          )}

          <button
            onClick={onClearStack}
            className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 hover:border-rose-700 hover:text-rose-400 transition-colors"
            title="Clear all events"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Event list */}
      <ol className="space-y-1.5">
        {events.map((event, i) => {
          const isActive = timelineIndex === i;
          const isFuture = isReplaying && timelineIndex !== null && i > timelineIndex;

          return (
            <li key={event.id}>
              <div
                className={`group relative flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                  isActive
                    ? 'border-cyan-600 bg-cyan-950/40 ring-1 ring-cyan-600/30'
                    : isFuture
                      ? 'border-zinc-800 bg-zinc-900/30 opacity-40 hover:opacity-60'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/60'
                }`}
                onClick={() => handleEventClick(i)}
              >
                {/* Step number */}
                <span
                  className={`mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                    isActive
                      ? 'bg-cyan-500 text-zinc-950'
                      : isFuture
                        ? 'bg-zinc-800 text-zinc-500'
                        : 'bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {i + 1}
                </span>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-medium leading-snug line-clamp-2 ${
                      isFuture ? 'text-zinc-500' : 'text-zinc-200'
                    }`}
                  >
                    {event.headline}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 tabular-nums">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    {event.ticker && event.ticker !== 'MARKET' && (
                      <span className="rounded bg-zinc-800 px-1 py-px text-[10px] font-mono text-zinc-400">
                        {event.ticker}
                      </span>
                    )}
                    {event.impact_summary && (
                      <span
                        className={`text-[10px] font-medium capitalize ${
                          event.impact_summary.direction === 'positive'
                            ? 'text-emerald-500'
                            : event.impact_summary.direction === 'negative'
                              ? 'text-rose-500'
                              : 'text-amber-500'
                        }`}
                      >
                        {event.impact_summary.direction}
                      </span>
                    )}
                  </div>
                </div>

                {/* Marginal delta */}
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <DeltaBadge value={event.marginal_valuation_delta_pct} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveEvent(event.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-zinc-600 hover:text-rose-400 transition-all"
                    title="Remove event"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Replay indicator */}
      {isReplaying && timelineIndex !== null && (
        <p className="text-center text-[10px] text-zinc-500">
          Viewing step {timelineIndex + 1} of {events.length} &mdash; click any step or{' '}
          <button
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            onClick={onExitReplay}
          >
            return to live
          </button>
        </p>
      )}
    </div>
  );
}
