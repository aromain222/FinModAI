'use client';

import { cn } from '@/lib/utils';
import type { ImpactDirection, ImpactedSector, ImpactedTicker } from '@/lib/news/types';

type ChipItem = ImpactedSector | ImpactedTicker;

function directionGlyph(direction: ImpactDirection): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  if (direction === 'mixed') return '•';
  return '?';
}

function directionClass(direction: ImpactDirection): string {
  if (direction === 'up') return 'text-emerald-300 border-emerald-600/30 bg-emerald-500/10';
  if (direction === 'down') return 'text-rose-300 border-rose-600/30 bg-rose-500/10';
  if (direction === 'mixed') return 'text-zinc-200 border-zinc-700/40 bg-zinc-700/20';
  return 'text-zinc-400 border-zinc-800/40 bg-zinc-800/20';
}

function itemLabel(item: ChipItem): string {
  if ('sector' in item) return item.sector;
  return item.ticker;
}

export default function ImpactChips({
  title,
  items,
}: {
  title: string;
  items: ChipItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400/70">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <span
            key={`${title}-${itemLabel(item)}-${idx}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
              directionClass(item.direction)
            )}
            title={item.rationale || undefined}
          >
            <span>{directionGlyph(item.direction)}</span>
            <span>{itemLabel(item)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

