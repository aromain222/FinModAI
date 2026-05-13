'use client';

import { cn } from '@/lib/utils';
import type { RankedStock } from '@/lib/ranking/types';

type ScoreFactor = keyof RankedStock['breakdown'];

const FACTOR_LABELS: Record<ScoreFactor, string> = {
  forecastSignal:   'Forecast',
  catalystStrength: 'Catalysts',
  momentum:         'Momentum',
  earningsSetup:    'Earnings',
  valuationSignal:  'Valuation',
  riskAdjustment:   'Risk',
};

const UPGRADE_HINTS: Record<ScoreFactor, string> = {
  forecastSignal:   'A live price forecast confirmation would be the key upgrade.',
  catalystStrength: 'More near-term catalyst confirmation would push the score higher.',
  momentum:         'A cleaner price trend would materially improve the setup.',
  earningsSetup:    'A stronger earnings setup would add meaningful conviction.',
  valuationSignal:  'Better valuation relative to growth expectations would help.',
  riskAdjustment:   'Reducing the risk/volatility profile is the highest-leverage upgrade.',
};

type Tier = 'Elite' | 'Strong' | 'Constructive' | 'Watchlist';

const TIER_META: Record<
  Tier,
  { text: string; bg: string; badge: string; description: string }
> = {
  Elite: {
    text:        'text-emerald-300',
    bg:          'border-emerald-400/25 bg-emerald-500/8',
    badge:       'bg-emerald-500/20 text-emerald-300',
    description: 'Multi-factor alignment — setups like this have historically preceded strong near-term moves when catalysts confirmed.',
  },
  Strong: {
    text:        'text-emerald-300',
    bg:          'border-emerald-400/20 bg-emerald-500/5',
    badge:       'bg-emerald-500/15 text-emerald-300',
    description: 'Ready-tier score with broad factor support. Solid setup quality — still needs a catalyst trigger to size.',
  },
  Constructive: {
    text:        'text-amber-300',
    bg:          'border-amber-400/20 bg-amber-500/5',
    badge:       'bg-amber-500/15 text-amber-300',
    description: 'Quality setup in development — not bad, just short of action-ready confirmation.',
  },
  Watchlist: {
    text:        'text-[var(--cb-text-muted)]',
    bg:          'border-[var(--cb-border)]',
    badge:       'bg-white/5 text-[var(--cb-text-muted)]',
    description: 'Early-stage or deteriorating setup — monitor for score improvement before sizing.',
  },
};

function scoreTier(score: number, signal: RankedStock['signal']): Tier {
  if (signal === 'green' && score >= 8.0) return 'Elite';
  if (signal === 'green') return 'Strong';
  if (signal === 'yellow') return 'Constructive';
  return 'Watchlist';
}

function weakestFactor(stock: RankedStock): ScoreFactor {
  let min: ScoreFactor = 'forecastSignal';
  let minVal = Infinity;
  for (const [key, val] of Object.entries(stock.breakdown) as Array<[ScoreFactor, number]>) {
    if (val < minVal) { minVal = val; min = key; }
  }
  return min;
}

type Props = {
  stock: RankedStock;
  onClick?: () => void;
  disabled?: boolean;
};

export function ScoreBacktestPanel({ stock, onClick, disabled }: Props) {
  const tier    = scoreTier(stock.score, stock.signal);
  const meta    = TIER_META[tier];
  const weakest = weakestFactor(stock);
  const hasLive = stock.meta.forecastReturnPct !== null;
  const forecast = stock.meta.forecastReturnPct;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'mt-2 w-full rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50',
        meta.bg,
        onClick && 'hover:brightness-110',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
        {/* Tier badge + description */}
        <div className="min-w-[120px]">
          <div className="mb-0.5 flex items-center gap-1.5">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                meta.badge,
              )}
            >
              {tier}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              Score profile
            </span>
          </div>
          <p className="text-[10px] leading-snug text-[var(--cb-text-muted)]">
            {meta.description}
          </p>
        </div>

        {/* Upgrade hint */}
        <div className="flex-1 min-w-[140px]">
          <div className="mb-0.5 text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
            What would upgrade this
          </div>
          <p className="text-[10px] leading-snug text-[var(--cb-text-secondary)]">
            <span className="font-medium text-[var(--cb-text-primary)]">
              {FACTOR_LABELS[weakest]}
            </span>
            {' '}({stock.breakdown[weakest].toFixed(1)}) is the drag.{' '}
            {UPGRADE_HINTS[weakest]}
          </p>
        </div>

        {/* Live / estimated framing */}
        <div className="shrink-0 text-right">
          {hasLive && forecast !== null ? (
            <>
              <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                Forward check
              </div>
              <div className={cn(
                'text-xs font-semibold tabular-nums',
                forecast >= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}>
                {forecast >= 0 ? '+' : ''}{forecast.toFixed(1)}%
              </div>
              <div className="text-[9px] text-[var(--cb-text-muted)]">
                {stock.horizonWeeks} wk TimesFM
              </div>
            </>
          ) : (
            <>
              <div className="text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
                Data
              </div>
              <div className="text-[10px] font-medium text-[var(--cb-text-muted)]">
                Estimated
              </div>
              <div className="text-[9px] text-[var(--cb-text-muted)]">
                Live forecast not loaded
              </div>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
