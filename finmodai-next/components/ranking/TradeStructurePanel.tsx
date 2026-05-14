'use client';

import {
  sortedFactors, SCORE_LABELS, convictionGrade,
  tradeReadiness, expectedMoveForDisplay, pmBullCaseRead, setupLabel, setupRead,
} from '@/lib/ranking/chatHelpers';
import type { RankedStock } from '@/lib/ranking/types';
import { cn } from '@/lib/utils';

function scoreAccent(v: number) {
  if (v >= 7) return { border: 'border-l-emerald-400', bar: 'bg-emerald-400', text: 'text-emerald-300' };
  if (v >= 4) return { border: 'border-l-amber-400',  bar: 'bg-amber-400',   text: 'text-amber-300' };
  return          { border: 'border-l-rose-400',   bar: 'bg-rose-400',    text: 'text-rose-300' };
}

type ModuleProps = {
  label: string;
  value: string;
  read: string;
  score?: number;
  overrideText?: string;
  group: 'opportunity' | 'readiness';
};

function Module({ label, value, read, score, overrideText, group }: ModuleProps) {
  const accent = score !== undefined ? scoreAccent(score) : null;
  return (
    <div className={cn(
      'flex flex-col gap-1 rounded-lg border-l-[3px] px-3 py-2.5',
      accent ? accent.border : 'border-l-[var(--cb-border)]',
      group === 'opportunity' ? 'bg-[var(--cb-surface-subtle)]' : 'bg-[var(--cb-surface)]',
    )}>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
        {label}
      </span>
      <span className={cn('text-xl font-bold tabular-nums leading-none', overrideText ?? (accent ? accent.text : 'text-[var(--cb-text-primary)]'))}>
        {value}
      </span>
      {score !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className={cn('h-full rounded-full transition-all duration-500', accent?.bar ?? 'bg-white/30')}
            style={{ width: `${Math.max(4, Math.min(100, score * 10))}%` }}
          />
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
  'Moderate-High': 'text-emerald-300',
  Moderate:        'text-amber-300',
  'Low-Moderate':  'text-amber-300',
  Low:             'text-rose-300',
};

export function TradeStructurePanel({ stock }: { stock: RankedStock }) {
  const factors    = sortedFactors(stock);
  const conviction = convictionGrade(stock);
  const readiness  = tradeReadiness(stock);
  const em         = expectedMoveForDisplay(stock);
  const topKey     = factors[0]?.[0] ?? 'forecastSignal';
  const bottomKey  = factors[factors.length - 1]?.[0] ?? 'riskAdjustment';

  const timingRead =
    readiness.label === 'Ready'   ? 'Enter if catalyst confirms' :
    readiness.label === 'Work up' ? 'Interesting — not there yet' :
                                    'Hold — wait for repair';

  const riskRead =
    stock.breakdown.riskAdjustment >= 7 ? 'Low — favorable risk/reward' :
    stock.breakdown.riskAdjustment >= 4 ? 'Moderate — manage position size' :
                                          'Elevated — volatility is a risk';

  const signalScore = stock.signal === 'green' ? 8 : stock.signal === 'yellow' ? 5 : 2;

  return (
    <div className="shrink-0 border-b border-[var(--cb-border)] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
          Trade Structure
        </span>
      </div>

      {/* Opportunity Quality */}
      <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
        Opportunity Quality
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Module
          group="opportunity"
          label="Setup"
          value={setupLabel(stock.signal)}
          read={setupRead(stock.signal)}
          score={signalScore}
        />
        <Module
          group="opportunity"
          label={SCORE_LABELS[topKey]}
          value={stock.breakdown[topKey].toFixed(1)}
          read={`Leads · ${topKey === 'catalystStrength' ? `${stock.meta.catalystCount} catalysts` : 'top factor'}`}
          score={stock.breakdown[topKey]}
        />
        <Module
          group="opportunity"
          label="Earnings"
          value={stock.breakdown.earningsSetup.toFixed(1)}
          read={
            stock.breakdown.earningsSetup >= 7 ? 'Beat setup' :
            stock.breakdown.earningsSetup >= 4 ? 'Neutral' : 'Miss risk'
          }
          score={stock.breakdown.earningsSetup}
        />
      </div>

      <div className="my-2.5 border-t border-dashed border-[var(--cb-border)]" />

      {/* Entry Timing */}
      <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
        Entry Timing
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Module
          group="readiness"
          label="Timing"
          value={readiness.label}
          read={timingRead}
          overrideText={READINESS_COLOR[readiness.label]}
        />
        <Module
          group="readiness"
          label="Sizing"
          value={pmBullCaseRead(em)}
          read={`Bull case: ${em.bullPct >= 0 ? '+' : ''}${em.bullPct}% / Risk: ${em.riskPct}%`}
          overrideText={
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
          overrideText={CONV_COLOR[conviction.level]}
        />
      </div>

      {conviction.aiRead && (
        <div className="mt-2.5 rounded-lg border border-blue-400/20 bg-blue-500/8 px-3 py-2 text-[10px] leading-snug text-blue-100/80">
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
