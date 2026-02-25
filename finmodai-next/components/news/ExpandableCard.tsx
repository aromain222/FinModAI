'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeightPx, setMaxHeightPx] = useState(0);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    if (!isOpen) {
      setMaxHeightPx(0);
      return;
    }

    const measure = () => setMaxHeightPx(node.scrollHeight);
    measure();

    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOpen, children]);

  return (
    <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-zinc-800/20"
      >
        <div className="min-w-0 flex-1">{header}</div>
        <div className="flex items-center gap-2 pt-0.5">
          {rightAccessory}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-zinc-400 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>
      <div
        className={cn(
          'overflow-hidden border-t border-zinc-800/40 transition-[max-height,opacity] duration-300 ease-out',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
        style={{ maxHeight: `${maxHeightPx}px` }}
      >
        <div ref={contentRef} className="space-y-3 px-3 py-3">{children}</div>
      </div>
    </div>
  );
}
