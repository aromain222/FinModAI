'use client';

import { cn } from '@/lib/utils';

type Props = {
  value: number; // 0–10
  label?: string;
  dim?:   boolean;
};

function barColor(v: number): string {
  if (v >= 7) return 'bg-emerald-500';
  if (v >= 4) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function ScoreBar({ value, label, dim }: Props) {
  const pct = Math.round((value / 10) * 100);
  return (
    <div className={cn('space-y-1', dim && 'opacity-60')}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--cb-text-muted)]">{label}</span>
          <span className="text-[10px] font-medium tabular-nums text-[var(--cb-text-secondary)]">
            {value.toFixed(1)}
          </span>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--cb-border)]">
        <div
          className={cn('h-full rounded-full transition-all', barColor(value))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
