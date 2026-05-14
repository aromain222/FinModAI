'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { ScoreBacktestPanel } from '@/components/ranking/ScoreBacktestPanel';
import { factorInterpretation, SCORE_LABELS, sortedFactors } from '@/lib/ranking/chatHelpers';
import type { RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

type ScoreFactor = keyof RankedStock['breakdown'];
type ScoreChange = { delta: number; factorDeltas: Partial<Record<ScoreFactor, number>> };

function changedFactorTone(delta: number): string {
  if (delta > 0) return 'animate-pulse border-emerald-400/60 bg-emerald-500/15 shadow-[0_0_12px_rgba(52,211,153,0.14)]';
  if (delta < 0) return 'animate-pulse border-rose-400/60 bg-rose-500/15 shadow-[0_0_12px_rgba(251,113,133,0.14)]';
  return 'border-transparent';
}

type Props = {
  stock: RankedStock;
  scoreChange: ScoreChange | null;
  sourceCards: Array<{ label: string; value: string; prompt: string; mode?: string }>;
  onPrompt: (text: string, mode?: string) => void;
  disabled: boolean;
};

export function DeepResearchPanel({ stock, scoreChange, sourceCards, onPrompt, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const factors = sortedFactors(stock);
  const topKey    = factors[0]?.[0] ?? 'forecastSignal';
  const bottomKey = factors[factors.length - 1]?.[0] ?? 'riskAdjustment';
  const hasDistinctPoles = topKey !== bottomKey;

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)]">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-secondary)]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-semibold uppercase tracking-widest text-[9px]">Deep Research</span>
        <span className="text-[9px]">— Valuation · Company File · Score Breakdown · Risk File</span>
      </button>

      {open && (
        <div className="border-t border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-4 py-3 space-y-4">
          {/* Source cards */}
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Research Files</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {sourceCards.map(card => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => onPrompt(card.prompt, card.mode)}
                  disabled={disabled}
                  className="min-w-0 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] p-2 text-left transition-colors hover:border-[var(--cb-border-strong)] hover:bg-[var(--cb-surface-subtle)] disabled:opacity-50"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0 text-[var(--cb-text-muted)]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                      {card.label}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-[11px] leading-snug text-[var(--cb-text-secondary)]">
                    {card.value}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Score breakdown */}
          <div>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Factor Breakdown</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(Object.entries(stock.breakdown) as Array<[ScoreFactor, number]>).map(([key, value]) => {
                const factorDelta = scoreChange?.factorDeltas[key];
                const isTop       = hasDistinctPoles && key === topKey    && !factorDelta;
                const isBottom    = hasDistinctPoles && key === bottomKey && !factorDelta;
                const scoreColor  = value >= 7 ? 'text-emerald-300' : value >= 4 ? 'text-amber-300' : 'text-rose-300';
                const barColor    = value >= 7 ? 'bg-emerald-400'   : value >= 4 ? 'bg-amber-400'   : 'bg-rose-400';
                const borderAccent = value >= 7 ? 'border-l-emerald-400' : value >= 4 ? 'border-l-amber-400' : 'border-l-rose-400';
                return (
                  <div
                    key={key}
                    className={cn(
                      'rounded-md border border-transparent border-l-[3px] p-2 transition-all duration-300',
                      borderAccent,
                      factorDelta  && changedFactorTone(factorDelta),
                      !factorDelta && isTop    && 'bg-emerald-500/10 ring-1 ring-emerald-400/30',
                      !factorDelta && isBottom && 'bg-amber-500/10 ring-1 ring-amber-400/30',
                      !factorDelta && !isTop && !isBottom && 'bg-[var(--cb-surface)]',
                    )}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)] leading-tight">
                        {SCORE_LABELS[key]}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        {factorDelta ? (
                          <span className={cn('text-[9px] font-semibold', factorDelta > 0 ? 'text-emerald-300' : 'text-rose-300')}>
                            {factorDelta > 0 ? '+' : ''}{factorDelta.toFixed(1)}
                          </span>
                        ) : null}
                        <span className={cn('text-lg font-bold leading-none', scoreColor)}>
                          {value.toFixed(1)}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', barColor)}
                        style={{ width: `${Math.max(4, Math.min(100, value * 10))}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] leading-snug text-[var(--cb-text-muted)]">
                      {factorInterpretation(stock, key, value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score backtest */}
          <ScoreBacktestPanel
            stock={stock}
            onClick={() => onPrompt('When score > 7, what happened over next 30 days?')}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
