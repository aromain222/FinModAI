'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton, CardSkeleton, MiniChartSkeleton } from './skeletons';
import { cn } from '@/lib/utils';

const STEP_INTERVAL_MS = 900;

type InlineSkeleton = 'row' | 'card' | 'miniChart';

export interface LoadingInlineProps {
  label: string;
  steps?: string[];
  skeleton: InlineSkeleton;
  compact?: boolean;
  className?: string;
}

export function LoadingInline({
  label,
  steps = [],
  skeleton,
  compact = false,
  className,
}: LoadingInlineProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (steps.length === 0) return;
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  const currentStep = steps[stepIndex] ?? steps[0];

  const SkeletonEl =
    skeleton === 'row' ? (
      <TableSkeleton rows={compact ? 4 : 6} className={compact ? 'rounded-md' : undefined} />
    ) : skeleton === 'card' ? (
      <CardSkeleton count={compact ? 2 : 4} className={compact ? 'grid-cols-1' : undefined} />
    ) : (
      <MiniChartSkeleton />
    );

  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={`Loading ${label}: ${currentStep}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {steps.length > 0 && (
          <span className="text-xs text-muted-foreground truncate max-w-[220px]">{currentStep}</span>
        )}
      </div>
      <div className={compact ? 'min-h-[80px]' : 'min-h-[140px]'}>{SkeletonEl}</div>
    </div>
  );
}
