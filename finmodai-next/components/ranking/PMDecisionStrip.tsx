'use client';

import { useEffect, useState } from 'react';
import { getTRState, defaultTRState, TR_STATES } from '@/lib/tradeReadiness/storage';
import {
  sortedFactors, SCORE_LABELS, factorInterpretation,
  convictionGrade, expectedMoveForDisplay, finalPmRead,
  keyCatalystStr, tradeReadiness, setupLabel, coreDebate,
} from '@/lib/ranking/chatHelpers';
import { formatExpectedMoveRange } from '@/lib/ranking/expectedMove';
import type { RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

const SIGNAL_LEFT: Record<string, string> = {
  green:  'border-l-emerald-500',
  yellow: 'border-l-amber-500',
  red:    'border-l-rose-500',
};
const SIGNAL_BG: Record<string, string> = {
  green:  'bg-emerald-500/5',
  yellow: 'bg-amber-500/5',
  red:    'bg-rose-500/5',
};
const SIGNAL_BADGE: Record<string, string> = {
  green:  'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25',
  yellow: 'bg-amber-500/15 text-amber-300 ring-amber-400/25',
  red:    'bg-rose-500/15 text-rose-300 ring-rose-400/25',
};
const CONV_COLOR: Record<string, string> = {
  High:          'text-emerald-300',
  'Moderate-High': 'text-emerald-300/80',
  Moderate:      'text-amber-300',
  'Low-Moderate': 'text-amber-300/70',
  Low:           'text-rose-300',
};

type Props = {
  stock: RankedStock;
  displayedScore: number;
  scoreChange: { delta: number; fromSignal: string; toSignal: string } | null;
};

export function PMDecisionStrip({ stock, displayedScore, scoreChange }: Props) {
  const [trLabel, setTrLabel] = useState('');

  useEffect(() => {
    const readiness = tradeReadiness(stock);
    const stored    = getTRState(stock.ticker);
    const status    = stored ?? defaultTRState(readiness);
    const cfg       = TR_STATES.find(s => s.status === status);
    setTrLabel(cfg?.label ?? readiness.label);
  }, [stock]);

  const expectedMove = expectedMoveForDisplay(stock);
  const conviction   = convictionGrade(stock);
  const pmView       = finalPmRead(stock, expectedMove);
  const nextCatalyst = keyCatalystStr(stock);
  const factors      = sortedFactors(stock);
  const [topKey, topVal]       = factors[0]!;
  const [bottomKey, bottomVal] = factors[factors.length - 1]!;
  const showDrag               = topKey !== bottomKey && bottomVal < topVal - 1.5;

  const signalChanged = Boolean(scoreChange && scoreChange.fromSignal !== scoreChange.toSignal);

  return (
    <div className={cn(
      'shrink-0 border-b border-[var(--cb-border)] border-l-4 px-4 py-4',
      SIGNAL_LEFT[stock.signal],
      SIGNAL_BG[stock.signal],
    )}>
      {/* Ticker row */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-[var(--cb-text-primary)]">
          {stock.ticker}
        </span>
        <span className={cn(
          'rounded px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 transition-all duration-300',
          SIGNAL_BADGE[stock.signal],
          signalChanged && 'animate-pulse',
        )}>
          {setupLabel(stock.signal)} · {displayedScore.toFixed(1)}
        </span>
        {trLabel && (
          <span className="rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--cb-text-muted)]">
            {trLabel}
          </span>
        )}
        {scoreChange && (
          <span className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            scoreChange.delta >= 0 ? 'text-emerald-300' : 'text-rose-300',
          )}>
            {scoreChange.delta >= 0 ? '+' : ''}{scoreChange.delta.toFixed(1)}
          </span>
        )}
      </div>

      {/* PM View — hero text */}
      <p className="mb-3 text-sm font-medium leading-snug text-[var(--cb-text-primary)]">
        {pmView}
      </p>

      {/* Expected move + conviction */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Base</span>
          <span className="font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatExpectedMoveRange(expectedMove.baseLowPct, expectedMove.baseHighPct)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Bull</span>
          <span className="font-semibold tabular-nums text-emerald-300">
            {expectedMove.bullPct >= 0 ? '+' : ''}{expectedMove.bullPct}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Risk</span>
          <span className="font-semibold tabular-nums text-rose-300">
            {expectedMove.riskPct}%
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[var(--cb-text-muted)]">
          Confidence
          <span className={cn('font-semibold', CONV_COLOR[conviction.level] ?? 'text-[var(--cb-text-secondary)]')}>
            {conviction.pct ?? '--'}%
          </span>
        </div>
      </div>

      {conviction.aiRead && (
        <div className="mb-3 rounded-lg border border-blue-400/20 bg-blue-500/8 px-3 py-2 text-[11px] leading-snug text-blue-100/85">
          <span className="font-semibold text-blue-200">Confidence link:</span> {conviction.aiRead}
        </div>
      )}

      {/* What matters / drag / next catalyst */}
      <div className={cn('grid gap-x-5 gap-y-2 text-[11px]', showDrag ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">What Matters</div>
          <p className="leading-tight text-[var(--cb-text-secondary)]">
            <span className="font-semibold text-[var(--cb-text-primary)]">{SCORE_LABELS[topKey]}</span>
            {' '}({topVal.toFixed(1)}) — {factorInterpretation(stock, topKey, topVal)}
          </p>
        </div>
        {showDrag && (
          <div className="space-y-0.5">
            <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Drag</div>
            <p className="leading-tight text-amber-200/75">
              <span className="font-semibold text-amber-300">{SCORE_LABELS[bottomKey]}</span>
              {' '}({bottomVal.toFixed(1)}) — {factorInterpretation(stock, bottomKey, bottomVal)}
            </p>
          </div>
        )}
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Next Catalyst</div>
          <p className="leading-tight text-[var(--cb-text-secondary)]">{nextCatalyst}</p>
        </div>
      </div>

      {/* Core Debate */}
      <div className="mt-3 border-t border-[var(--cb-border)] pt-3">
        <div className="mb-1 text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">Core Debate</div>
        <p className="text-[11px] leading-snug text-[var(--cb-text-secondary)]">{coreDebate(stock)}</p>
      </div>
    </div>
  );
}
