"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type SpeedCategory = 'fast' | 'normal' | 'slow';

const RUNNING_WARNING_MS = 30_000;
const RUNNING_DANGER_MS = 60_000;
const MAX_PROGRESS_MS = 60_000;

interface TimerStats {
  p50Ms: number | null;
  p80Ms: number | null;
}

export interface ModelGenerationTimerProps {
  isRunning: boolean;
  durationMs?: number;
  stats?: TimerStats;
}

const formatSeconds = (ms: number) => {
  if (!Number.isFinite(ms)) return '0.0s';
  const seconds = ms / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
};

const determineRunningCategory = (elapsedMs: number): SpeedCategory => {
  if (elapsedMs > RUNNING_DANGER_MS) {
    return 'slow';
  }
  if (elapsedMs > RUNNING_WARNING_MS) {
    return 'normal';
  }
  return 'fast';
};

const determineCompletedCategory = (durationMs: number, stats?: TimerStats): SpeedCategory => {
  if (stats?.p50Ms && durationMs <= stats.p50Ms) {
    return 'fast';
  }
  if (stats?.p80Ms && durationMs <= stats.p80Ms) {
    return 'normal';
  }
  if (!stats?.p50Ms && durationMs <= RUNNING_WARNING_MS) {
    return 'fast';
  }
  if (!stats?.p80Ms && durationMs <= RUNNING_DANGER_MS) {
    return 'normal';
  }
  return 'slow';
};

const categoryStyles: Record<SpeedCategory, { stroke: string; badge: string }> = {
  fast: {
    stroke: '#22C55E',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  normal: {
    stroke: '#2B74FF',
    badge: 'bg-blue-100 text-blue-700',
  },
  slow: {
    stroke: '#EF4444',
    badge: 'bg-red-100 text-red-700',
  },
};

export function ModelGenerationTimer({ isRunning, durationMs, stats }: ModelGenerationTimerProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning) {
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      startRef.current = start;
      setElapsedMs(0);
      interval = setInterval(() => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setElapsedMs(Math.max(0, Math.round(now - start)));
      }, 200);
    } else if (typeof durationMs === 'number') {
      startRef.current = null;
      setElapsedMs(durationMs);
    } else if (!isRunning && startRef.current) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setElapsedMs(Math.max(0, Math.round(now - startRef.current)));
      startRef.current = null;
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, durationMs]);

  const displayMs = isRunning ? elapsedMs : durationMs ?? elapsedMs;

  const category: SpeedCategory = useMemo(() => {
    if (isRunning) {
      return determineRunningCategory(displayMs);
    }
    if (typeof displayMs === 'number' && displayMs > 0) {
      return determineCompletedCategory(displayMs, stats);
    }
    return 'fast';
  }, [displayMs, isRunning, stats]);

  const badgeLabel =
    isRunning && displayMs === 0
      ? 'Queued'
      : isRunning
      ? category === 'fast'
        ? 'Optimizing'
        : category === 'normal'
        ? 'Working'
        : 'Crunching'
      : category === 'fast'
      ? 'Fast run'
      : category === 'normal'
      ? 'Normal run'
      : 'Slow run';

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = Math.min(displayMs / MAX_PROGRESS_MS, 1);
  const dashOffset = circumference * (1 - progressRatio);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-28 w-28">
        <svg width="112" height="112" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="#E2E6EE"
            strokeWidth="8"
            fill="transparent"
            transform="rotate(-90 50 50)"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={categoryStyles[category].stroke}
            strokeWidth="8"
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
            className="transition-all duration-200 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-cb-ink">{formatSeconds(displayMs)}</span>
        </div>
      </div>

      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
          categoryStyles[category].badge
        )}
      >
        {badgeLabel}
      </span>

      {stats && (stats.p50Ms || stats.p80Ms) && (
        <p className="text-[11px] text-center text-cb-slate">
          {stats.p50Ms ? `Median ${formatSeconds(stats.p50Ms)}` : 'Limited data'}
          {stats.p80Ms ? ` · p80 ${formatSeconds(stats.p80Ms)}` : null}
        </p>
      )}
    </div>
  );
}
