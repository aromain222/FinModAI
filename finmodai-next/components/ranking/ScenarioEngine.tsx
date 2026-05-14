'use client';

import { expectedMoveForDisplay, hasLiveConfirmation } from '@/lib/ranking/chatHelpers';
import { formatExpectedMoveRange } from '@/lib/ranking/expectedMove';
import type { RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

type Props = {
  stock: RankedStock;
  onScenarioClick?: (text: string) => void;
  disabled?: boolean;
};

export function ScenarioEngine({ stock, onScenarioClick, disabled = false }: Props) {
  const em   = expectedMoveForDisplay(stock);
  const live = hasLiveConfirmation(stock);

  const bullAbs  = Math.abs(em.bullPct);
  const bearAbs  = Math.abs(em.riskPct);
  const rrRatio  = bearAbs > 0 ? bullAbs / bearAbs : 0;
  const rrStr    = rrRatio.toFixed(1);
  const rrColor  = rrRatio >= 2.5 ? 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/20'
                 : rrRatio >= 1.5 ? 'text-amber-300 bg-amber-500/10 ring-amber-400/20'
                 :                  'text-rose-300 bg-rose-500/10 ring-rose-400/20';

  // Price path bar: map [riskPct, bullPct] onto 0–100%
  const totalRange = bullAbs + bearAbs;
  // Bear extreme is leftmost (0%), bull extreme is rightmost (100%)
  const baseLowPos  = totalRange > 0 ? ((em.baseLowPct  - em.riskPct) / totalRange) * 100 : 30;
  const baseHighPos = totalRange > 0 ? ((em.baseHighPct - em.riskPct) / totalRange) * 100 : 60;
  const midPos      = (baseLowPos + baseHighPos) / 2;

  const scenarios = [
    {
      label:  'Base',
      value:  formatExpectedMoveRange(em.baseLowPct, em.baseHighPct),
      prob:   '55%',
      desc:   'Trend holds; catalyst confirms without a full re-rate.',
      color:  'text-[var(--cb-text-primary)]',
      ring:   'ring-[var(--cb-border)]',
      bg:     '',
    },
    {
      label:  'Bull',
      value:  `${em.bullPct >= 0 ? '+' : ''}${em.bullPct}%`,
      prob:   '25%',
      desc:   'Catalyst re-rates estimates or multiple; score upgrades.',
      color:  'text-emerald-300',
      ring:   'ring-emerald-400/25',
      bg:     'bg-emerald-500/5',
    },
    {
      label:  'Bear',
      value:  `${em.riskPct}%`,
      prob:   '20%',
      desc:   'Catalyst miss, macro headwind, or risk escalation.',
      color:  'text-rose-300',
      ring:   'ring-rose-400/25',
      bg:     'bg-rose-500/5',
    },
  ];

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)] px-4 py-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
          PM Scenario Engine
        </span>
        <div className="flex items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1', rrColor)}>
            {rrStr}× R/R
          </span>
          <span className={cn('text-[9px]', live ? 'text-emerald-400/70' : 'text-[var(--cb-text-muted)]')}>
            {live ? 'Live' : 'Estimated'}
          </span>
        </div>
      </div>

      {/* Price path bar */}
      <div className="mb-3">
        <div className="relative h-3 overflow-visible rounded-full bg-gradient-to-r from-rose-500/25 via-white/5 to-emerald-500/25">
          {/* Base range highlight */}
          <div
            className="absolute top-0 h-full rounded-full bg-white/12 ring-1 ring-inset ring-white/20"
            style={{
              left:  `${Math.max(0, baseLowPos)}%`,
              right: `${Math.max(0, 100 - baseHighPos)}%`,
            }}
          />
          {/* Midpoint marker */}
          <div
            className="absolute top-0 h-full w-0.5 rounded-full bg-white/70"
            style={{ left: `${midPos}%`, transform: 'translateX(-50%)' }}
          />
        </div>
        {/* Labels */}
        <div className="mt-1 flex justify-between text-[9px] text-[var(--cb-text-muted)]">
          <span className="text-rose-400/70">{em.riskPct}%</span>
          <span className="text-[var(--cb-text-muted)]">
            Base {formatExpectedMoveRange(em.baseLowPct, em.baseHighPct)}
          </span>
          <span className="text-emerald-400/70">+{em.bullPct}%</span>
        </div>
      </div>

      {/* Probability weight strip */}
      <div className="mb-3 flex h-1 overflow-hidden rounded-full">
        <div className="bg-rose-500/40"  style={{ width: `${scenarios[2].prob}` }} />
        <div className="bg-white/15"     style={{ width: `${scenarios[0].prob}` }} />
        <div className="bg-emerald-500/40" style={{ width: `${scenarios[1].prob}` }} />
      </div>

      {/* Scenario cards */}
      <div className="grid grid-cols-3 gap-2">
        {scenarios.map(s => (
          <button
            key={s.label}
            type="button"
            disabled={disabled || !onScenarioClick}
            onClick={() => onScenarioClick?.(`Walk me through the ${s.label.toLowerCase()} case for ${stock.ticker}.`)}
            className={cn(
              'rounded-lg p-2.5 text-left ring-1 transition-colors hover:bg-[var(--cb-surface)] disabled:opacity-60',
              s.ring, s.bg,
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">{s.label}</span>
              <span className="rounded bg-white/6 px-1 py-px text-[9px] tabular-nums text-[var(--cb-text-muted)]">{s.prob}</span>
            </div>
            <div className={cn('text-xl font-bold tabular-nums leading-none', s.color)}>{s.value}</div>
            <p className="mt-1.5 text-[10px] leading-tight text-[var(--cb-text-muted)]">{s.desc}</p>
          </button>
        ))}
      </div>

      <p className="mt-2 text-[9px] text-[var(--cb-text-muted)]">{em.summary}</p>
    </div>
  );
}
