'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  getTRState,
  setTRState,
  defaultTRState,
  nextTRState,
  TR_STATES,
  type TradeReadinessStatus,
} from '@/lib/tradeReadiness/storage';
import { cn } from '@/lib/utils';

type Props = {
  ticker: string;
  computed: { label: string; reason: string };
};

const STRIP_BG: Record<TradeReadinessStatus, string> = {
  watch:           '',
  'work-up':       'bg-amber-500/8',
  'paper-track':   'bg-blue-500/8',
  queued:          'bg-purple-500/8',
  ready:           'bg-emerald-500/8',
};

export function TradeReadinessStrip({ ticker, computed }: Props) {
  const [status, setStatus] = useState<TradeReadinessStatus>(() =>
    getTRState(ticker) ?? defaultTRState(computed)
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(getTRState(ticker) ?? defaultTRState(computed));
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const apply = useCallback(
    (next: TradeReadinessStatus) => {
      setStatus(next);
      setTRState(ticker, next);
    },
    [ticker],
  );

  const cycle = useCallback(() => apply(nextTRState(status)), [apply, status]);

  const cfg = TR_STATES.find(s => s.status === status) ?? TR_STATES[0]!;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <div
        className={cn(
          'rounded-lg border-l-2 py-1 pl-3 pr-1',
          cfg.accentCls,
          STRIP_BG[status],
        )}
      >
        <div className="flex items-start gap-0.5">
          <button
            type="button"
            onClick={cycle}
            className="min-w-0 flex-1 text-left"
          >
            <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              Trade Readiness
            </div>
            <div className={cn('text-sm font-bold leading-tight', cfg.textCls)}>
              {cfg.label}
            </div>
            <div className="mt-0.5 text-[10px] leading-tight text-[var(--cb-text-muted)]">
              {cfg.description}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="mt-1 shrink-0 rounded p-0.5 text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--cb-border)] bg-[var(--cb-bg)] shadow-xl">
          {TR_STATES.map(s => (
            <button
              key={s.status}
              type="button"
              onClick={() => {
                apply(s.status);
                setOpen(false);
              }}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors',
                s.status === status
                  ? 'bg-[var(--cb-surface)]'
                  : 'hover:bg-[var(--cb-surface-subtle)]',
              )}
            >
              <span className={cn('text-xs font-semibold', s.textCls)}>{s.label}</span>
              <span className="text-[10px] leading-tight text-[var(--cb-text-muted)]">
                {s.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
