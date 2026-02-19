'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Table: header row + 6–10 body rows */
export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('w-full rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex gap-4 px-4 py-3 border-b border-border bg-muted/40">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            <Skeleton className="h-4 flex-1 max-w-[140px]" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cards: 3–6 cards with title + 2 lines */
export function CardSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}

/** Chart: placeholder axes + shimmering plot area */
export function ChartSkeleton({ height = 320, className }: { height?: number; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-end gap-1 px-6 pt-4 pb-2" style={{ height }}>
        <div className="flex-1 flex items-end gap-0.5 justify-around h-full min-h-[200px]">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="w-2 flex-shrink-0 rounded-t"
              style={{ height: `${30 + Math.sin(i * 0.5) * 40 + 50}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between px-6 py-2 border-t border-border">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/** Model/statement: indented rows + totals lines */
export function ModelSkeleton({ rows = 10, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('w-full rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex gap-6 px-4 py-3 border-b border-border bg-muted/40 text-xs uppercase tracking-wide">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => {
          const indent = i % 4 === 0 ? 0 : i % 4 === 1 ? 4 : 8;
          const isTotal = i === rows - 2 || i === rows - 1;
          return (
            <div key={i} className={cn('flex gap-6 px-4 py-2', isTotal && 'bg-muted/30 font-medium')}>
              <Skeleton className="h-4 flex-1 max-w-[200px]" style={{ marginLeft: indent * 4 }} />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Mini chart placeholder (for inline/section) */
export function MiniChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border p-4', className)}>
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="flex items-end gap-1 h-20">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 rounded-t min-h-[20%]" style={{ height: `${25 + (i % 3) * 25}%` }} />
        ))}
      </div>
    </div>
  );
}
