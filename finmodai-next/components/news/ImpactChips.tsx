'use client';

import { cn } from '@/lib/utils';
import type { ImpactDirection, ImpactedSector, ImpactedTicker } from '@/lib/news/types';

type ChipItem = ImpactedSector | ImpactedTicker;

function directionGlyph(direction: ImpactDirection): string {
  if (direction === 'up') return '▲';
  if (direction === 'down') return '▼';
  if (direction === 'mixed') return '◆';
  return '—';
}

function directionClasses(direction: ImpactDirection): string {
  if (direction === 'up') return 'text-emerald-400 border-emerald-500/25 bg-emerald-500/8';
  if (direction === 'down') return 'text-rose-400 border-rose-500/25 bg-rose-500/8';
  if (direction === 'mixed') return 'text-amber-300 border-amber-500/20 bg-amber-500/6';
  return 'text-zinc-400 border-zinc-700/40 bg-zinc-800/20';
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
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <span
            key={`${title}-${itemLabel(item)}-${idx}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
              directionClasses(item.direction)
            )}
            title={item.rationale || undefined}
          >
            <span className="text-[9px] leading-none">{directionGlyph(item.direction)}</span>
            <span>{itemLabel(item)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
