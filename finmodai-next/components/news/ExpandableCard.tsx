'use client';

import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExpandableCard({
  isOpen,
  onToggle,
  header,
  children,
  rightAccessory,
}: {
  isOpen: boolean;
  onToggle: () => void;
  header: ReactNode;
  children: ReactNode;
  rightAccessory?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'group rounded-lg border transition-colors duration-150',
        isOpen
          ? 'border-zinc-700/60 bg-zinc-900/50'
          : 'border-zinc-800/40 bg-zinc-900/20 hover:border-zinc-700/50 hover:bg-zinc-900/30'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <ChevronRight
          className={cn(
            'mt-1 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200',
            isOpen && 'rotate-90 text-zinc-300'
          )}
        />
        <div className="min-w-0 flex-1">{header}</div>
        {rightAccessory && (
          <div className="flex shrink-0 items-center gap-2 pt-0.5">{rightAccessory}</div>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-zinc-800/30 px-4 pb-4 pt-3">
          <div className="space-y-4">{children}</div>
        </div>
      )}
    </div>
  );
}
