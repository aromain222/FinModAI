'use client';

import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { TableSkeleton, CardSkeleton, ChartSkeleton, ModelSkeleton } from './skeletons';
import { cn } from '@/lib/utils';
import type { LoadingVariant } from '@/lib/loadingCopy';

const STEP_INTERVAL_MS = 1050;

export interface LoadingPanelProps {
  title: string;
  subtitle?: string;
  steps: string[];
  variant: LoadingVariant;
  showProgress?: boolean;
  lastKnownDataHint?: string;
  className?: string;
}

export function LoadingPanel({
  title,
  subtitle,
  steps,
  variant,
  showProgress = true,
  lastKnownDataHint,
  className,
}: LoadingPanelProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (steps.length === 0) return;
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  useEffect(() => {
    if (!showProgress) return;
    const id = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + Math.random() * 4 + 2));
    }, 800);
    return () => clearInterval(id);
  }, [showProgress]);

  const currentStep = steps[stepIndex] ?? steps[0];

  const SkeletonComponent =
    variant === 'table'
      ? TableSkeleton
      : variant === 'cards'
        ? CardSkeleton
        : variant === 'model'
          ? ModelSkeleton
          : ChartSkeleton;

  return (
    <div
      className={cn('space-y-6 rounded-xl border border-border bg-card p-6', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={`Loading: ${title}. ${currentStep}`}
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {lastKnownDataHint && (
        <p className="text-xs text-muted-foreground italic">{lastKnownDataHint}</p>
      )}

      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Status:</span> {currentStep}
      </div>

      {showProgress && (
        <div className="space-y-1">
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      <div className="min-h-[200px]">
        <SkeletonComponent />
      </div>
    </div>
  );
}
