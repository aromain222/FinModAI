'use client';

import type { Signal } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

type Props = {
  signal: Signal;
  score:  number;
  size?:  'sm' | 'md' | 'lg';
};

const CONFIG: Record<Signal, { label: string; classes: string; dot: string }> = {
  green:  { label: 'READY',   classes: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',  dot: 'bg-emerald-400' },
  yellow: { label: 'WORK UP', classes: 'bg-amber-500/15   text-amber-400   ring-amber-500/30',    dot: 'bg-amber-400'   },
  red:    { label: 'REPAIR',  classes: 'bg-rose-500/15    text-rose-400    ring-rose-500/30',      dot: 'bg-rose-400'    },
};

const SIZE = {
  sm: 'px-2 py-0.5 text-[10px] gap-1.5',
  md: 'px-2.5 py-1 text-xs gap-1.5',
  lg: 'px-3 py-1.5 text-sm gap-2',
};

export function OpportunityBadge({ signal, score, size = 'md' }: Props) {
  const { label, classes, dot } = CONFIG[signal];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold ring-1',
        SIZE[size],
        classes,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {label}
      <span className="opacity-70">{score.toFixed(1)}</span>
    </span>
  );
}
