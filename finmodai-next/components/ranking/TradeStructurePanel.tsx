'use client';

import {
  sortedFactors, SCORE_LABELS, convictionGrade,
  tradeReadiness, expectedMoveForDisplay, pmBullCaseRead, capitalize,
} from '@/lib/ranking/chatHelpers';
import type { RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

function valueColor(v: number): string {
  if (v >= 7) return 'text-emerald-300';
  if (v >= 4) return 'text-amber-300';
  return 'text-rose-300';
}

function barWidth(v: number): string {
  return `${Math.max(4, Math.min(100, v * 10))}%`;
}

function barColor(v: number): string {
  if (v >= 7) return 'bg-emerald-400';
  if (v >= 4) return 'bg-amber-400';
  return 'bg-rose-400';
}

type ModuleProps = {
  label: string;
  value: string;
  read: string;
  barPct?: number;
  valueColor?: string;
  group: 'opportunity' | 'readiness';
};

function Module({ label, value, read, barPct, valueColor: vc, group }: ModuleProps) {
  return (
    <div className={cn(
      'space-y-1 rounded-lg px-3 py-2',
      group === 'opportunity'
        ? 'bg-[var(--cb-surface-subtle)]'
        : 'bg-[var(--cb-surface)]',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">{label}</span>
        <span className={cn('text-[11px] font-bold tabular-nums', vc ?? 'text-[var(--cb-text-primary)]')}>
          {value}
        </span>
      </div>
      {barPct !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-white/8">
          <div className={cn('h-full rounded-full transition-all duration-500', barColor(barPct / 10))}
            style={{ width: `${barPct}%` }} />
        </div>
      )}
      <p className="text-[10px] leading-tight text-[var(--cb-text-muted)]">{read}</p>
    </div>
  );
}

const READINESS_COLOR: Record<string, string> = {
  Ready:               'text-emerald-300',
  'Work up':           'text-amber-300',
  'Wait for catalyst': 'text-rose-300',
};

const CONV_COLOR: Record<string, string> = {
  High:            'text-emerald-300',
  'Moderate-High': 'text-emerald-300/80',
  Moderate:        'text-amber-300',
  'Low-Moderate':  'text-amber-300/70',
  Low:             'text-rose-300',
};

export function TradeStructurePanel({ stock }: { stock: RankedStock }) {
  const factors    = sortedFactors(stock);
  const conviction = convictionGrade(stock);
  const readiness  = tradeReadiness(stock);
  const em         = expectedMoveForDisplay(stock);
  const topKey     = factors[0]?.[0] ?? 'forecastSignal';
  const bottomKey  = factors[factors.length - 1]?.[0] ?? 'riskAdjustment';

  const signalRead =
    stock.signal === 'green'  ? 'Actionable setup' :
    stock.signal === 'yellow' ? 'Work it up' :
                                'Avoid / wait';

  const timingRead =
    readiness.label === 'Ready'               ? 'Enter if catalyst confirms' :
    readiness.label === 'Work up'             ? 'Interesting — not there yet' :
                                                'Hold — wait for repair';

  const riskRead =
    stock.breakdown.riskAdjustment >= 7 ? 'Low — favorable risk/reward' :
    stock.breakdown.riskAdjustment >= 4 ? 'Moderate — manage position size' :
                                          'Elevated — volatility is a risk';

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Trade Structure</span>
      </div>

      {/* Opportunity Quality group */}
      <div className="mb-1 text-[8px] uppercase tracking-widest text-[var(--cb-text-muted)]">Opportunity Quality</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
        <Module
          group="opportunity"
          label="Signal"
          value={capitalize(stock.signal)}
          read={signalRead}
          barPct={stock.score * 10}
          valueColor={
            stock.signal === 'green'  ? 'text-emerald-300' :
            stock.signal === 'yellow' ? 'text-amber-300'   :
                                        'text-rose-300'
          }
        />
        <Module
          group="opportunity"
          label={SCORE_LABELS[topKey]}
          value={`${stock.breakdown[topKey].toFixed(1)}`}
          read={`Leads · ${topKey === 'catalystStrength' ? `${stock.meta.catalystCount} catalysts` : 'top factor'}`}
          barPct={stock.breakdown[topKey] * 10}
          valueColor={valueColor(stock.breakdown[topKey])}
        />
        <Module
          group="opportunity"
          label="Earnings"
          value={stock.breakdown.earningsSetup.toFixed(1)}
          read={
            stock.breakdown.earningsSetup >= 7 ? 'Beat setup' :
            stock.breakdown.earningsSetup >= 4 ? 'Neutral' : 'Miss risk'
          }
          barPct={stock.breakdown.earningsSetup * 10}
          valueColor={valueColor(stock.breakdown.earningsSetup)}
        />
      </div>

      {/* Visual separator + Entry Timing group */}
      <div className="my-2 border-t border-dashed border-[var(--cb-border)]" />
      <div className="mb-1 text-[8px] uppercase tracking-widest text-[var(--cb-text-muted)]">Entry Timing</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
        <Module
          group="readiness"
          label="Timing"
          value={readiness.label}
          read={timingRead}
          valueColor={READINESS_COLOR[readiness.label]}
        />
        <Module
          group="readiness"
          label="Sizing"
          value={pmBullCaseRead(em)}
          read={`Bull case: ${em.bullPct >= 0 ? '+' : ''}${em.bullPct}% / Risk: ${em.riskPct}%`}
          valueColor={
            pmBullCaseRead(em) === 'High'   ? 'text-emerald-300' :
            pmBullCaseRead(em) === 'Medium' ? 'text-amber-300'   :
                                              'text-[var(--cb-text-muted)]'
          }
        />
        <Module
          group="readiness"
          label="Confidence"
          value={conviction.pct != null ? `${conviction.pct}%` : conviction.level}
          read={conviction.read}
          valueColor={CONV_COLOR[conviction.level]}
        />
      </div>

      {conviction.aiRead && (
        <div className="mt-2 rounded-lg border border-blue-400/20 bg-blue-500/8 px-3 py-2 text-[10px] leading-tight text-blue-100/80">
          {conviction.aiRead}
        </div>
      )}

      {topKey !== bottomKey && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--cb-text-muted)]">
          <span>
            <span className="text-emerald-300/70">↑ {SCORE_LABELS[topKey]}</span>
            {' '}leads · <span className="text-amber-300/70">{SCORE_LABELS[bottomKey]}</span> lags
          </span>
          <span className="ml-auto">{riskRead}</span>
        </div>
      )}
    </div>
  );
}
