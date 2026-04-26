'use client';

/**
 * TradingSignalCard
 *
 * Displays a full trading signal: direction, conviction, position sizing,
 * risk parameters, valuation edge, and causal drivers.
 */

import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Shield,
  Zap,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { TradingSignal } from '@/lib/useTradingSignal';

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

function fmtAsPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmtPrice(n: number): string {
  return n.toFixed(2);
}

// ── Direction badge ───────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: TradingSignal['signal']['direction'] }) {
  if (direction === 'long') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <TrendingUp className="h-6 w-6 text-emerald-400" />
        </div>
        <span className="text-4xl font-black tracking-tight text-emerald-400">LONG</span>
      </div>
    );
  }
  if (direction === 'short') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-500/30">
          <TrendingDown className="h-6 w-6 text-rose-400" />
        </div>
        <span className="text-4xl font-black tracking-tight text-rose-400">SHORT</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-700/50 ring-1 ring-zinc-600/40">
        <Minus className="h-6 w-6 text-zinc-400" />
      </div>
      <span className="text-4xl font-black tracking-tight text-zinc-400">NEUTRAL</span>
    </div>
  );
}

// ── Conviction bar ────────────────────────────────────────────────────────────

function ConvictionBar({
  value,
  direction,
}: {
  value: number;
  direction: TradingSignal['signal']['direction'];
}) {
  const pct   = Math.round(value * 100);
  const color =
    direction === 'long'  ? 'bg-emerald-500' :
    direction === 'short' ? 'bg-rose-500'    : 'bg-zinc-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Conviction
        </span>
        <span className="font-mono text-sm font-bold text-zinc-200">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Horizon chip ──────────────────────────────────────────────────────────────

function HorizonChip({ horizon }: { horizon: TradingSignal['signal']['time_horizon'] }) {
  const label =
    horizon === 'intraday'    ? 'Intraday'    :
    horizon === 'short_term'  ? 'Short Term'  : 'Medium Term';
  const color =
    horizon === 'intraday'    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'   :
    horizon === 'short_term'  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'      :
                                'border-violet-500/30 bg-violet-500/10 text-violet-300';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Catalyst chip ─────────────────────────────────────────────────────────────

function CatalystChip({ strength }: { strength: 'low' | 'medium' | 'high' }) {
  const color =
    strength === 'high'   ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'   :
    strength === 'medium' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
                            'border-zinc-600/40 bg-zinc-800/50 text-zinc-400';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      <Zap className="h-3 w-3" />
      {strength} catalyst
    </span>
  );
}

// ── Volatility chip ───────────────────────────────────────────────────────────

function VolatilityChip({ level }: { level: 'low' | 'medium' | 'high' }) {
  const color =
    level === 'high'   ? 'text-rose-400'   :
    level === 'medium' ? 'text-amber-400'  : 'text-zinc-400';
  return (
    <span className={`font-semibold capitalize ${color}`}>{level}</span>
  );
}

// ── Mispricing chip ───────────────────────────────────────────────────────────

function MispricingChip({ type }: { type: TradingSignal['edge']['market_mispricing'] }) {
  const label = type === 'underreacting' ? 'Underreacting' : type === 'overreacting' ? 'Overreacting' : 'Efficient';
  const color =
    type === 'underreacting' ? 'text-emerald-400' :
    type === 'overreacting'  ? 'text-rose-400'    : 'text-zinc-400';
  return <span className={`font-semibold ${color}`}>{label}</span>;
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
      {label}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function TradingSignalSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-zinc-800" />
        <div className="h-9 w-32 rounded-lg bg-zinc-800" />
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-800" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-zinc-800/60" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-zinc-800/60" />
        <div className="h-3 w-4/5 rounded bg-zinc-800/60" />
      </div>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function TradingSignalCard({
  signal,
}: {
  signal: TradingSignal;
}) {
  const { signal: sig, edge, position, risk, drivers } = signal;

  const directionAccent =
    sig.direction === 'long'  ? 'border-emerald-500/20' :
    sig.direction === 'short' ? 'border-rose-500/20'    : 'border-zinc-700/40';

  return (
    <div className={`rounded-xl border bg-zinc-950 p-5 space-y-5 ${directionAccent}`}>

      {/* ── Header ── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <DirectionBadge direction={sig.direction} />
          <div className="flex flex-col items-end gap-1.5">
            <HorizonChip horizon={sig.time_horizon} />
            <CatalystChip strength={edge.catalyst_strength} />
          </div>
        </div>
        <ConvictionBar value={sig.conviction} direction={sig.direction} />
      </div>

      <div className="h-px bg-zinc-800/60" />

      {/* ── Edge ── */}
      <div className="space-y-1">
        <SectionLabel label="Valuation Edge" />
        <Row label="Valuation Gap" value={fmtPct(edge.valuation_gap_pct)} />
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="text-xs text-zinc-500">Market Pricing</span>
          <MispricingChip type={edge.market_mispricing} />
        </div>
      </div>

      <div className="h-px bg-zinc-800/60" />

      {/* ── Position ── */}
      <div className="space-y-1">
        <SectionLabel label="Position Parameters" />
        <Row label="Size" value={fmtAsPct(position.size_pct)} />
        <Row
          label="Entry Zone"
          value={`${fmtPrice(position.entry_zone.min)} – ${fmtPrice(position.entry_zone.max)}`}
        />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-2.5 text-center">
            <div className="text-[9px] font-bold uppercase tracking-widest text-rose-500/70">
              Stop Loss
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-rose-400">
              -{fmtAsPct(position.stop_loss_pct)}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2.5 text-center">
            <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/70">
              Take Profit
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-emerald-400">
              +{fmtAsPct(position.take_profit_pct)}
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-zinc-800/60" />

      {/* ── Risk ── */}
      <div className="space-y-1">
        <SectionLabel label="Risk" />
        <div className="flex items-start gap-2 rounded-lg border border-amber-900/30 bg-amber-950/10 p-2.5">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-zinc-400 leading-snug">{risk.primary_risk}</p>
        </div>
        <Row label="Scenario Skew" value={risk.scenario_skew} />
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="text-xs text-zinc-500">Volatility</span>
          <VolatilityChip level={risk.volatility_expectation} />
        </div>
      </div>

      {/* ── Drivers ── */}
      {drivers.length > 0 && (
        <>
          <div className="h-px bg-zinc-800/60" />
          <div className="space-y-2">
            <SectionLabel label="Key Drivers" />
            <ol className="space-y-1.5">
              {drivers.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="text-xs leading-snug text-zinc-300">{d}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* ── Scenario probabilities ── */}
      {signal.probabilities && (
        <>
          <div className="h-px bg-zinc-800/60" />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel label="Scenario Probabilities" />
              <span className="text-[10px] text-zinc-500">
                conf {fmtAsPct(signal.probabilities.confidence, 0)}
              </span>
            </div>
            {(
              [
                { key: 'bull', label: 'Bull', color: 'bg-emerald-500', text: 'text-emerald-400' },
                { key: 'base', label: 'Base', color: 'bg-zinc-500',    text: 'text-zinc-300'   },
                { key: 'bear', label: 'Bear', color: 'bg-rose-500',    text: 'text-rose-400'   },
              ] as const
            ).map(({ key, label, color, text }) => {
              const val = signal.probabilities![key];
              return (
                <div key={key} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">{label}</span>
                    <span className={`text-[10px] font-mono font-semibold tabular-nums ${text}`}>
                      {fmtAsPct(val, 1)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color}`}
                      style={{ width: `${(val * 100).toFixed(1)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {signal._meta?.prob_override && (
              <p className="text-[10px] text-amber-400/80">
                Direction overridden by probability model
              </p>
            )}
          </div>
        </>
      )}

      {/* ── R/R summary ── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">
          <span>Risk / Reward</span>
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            <Shield className="h-3 w-3" />
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs font-mono">
          <span className="text-rose-400">-{fmtAsPct(position.stop_loss_pct)}</span>
          <span className="text-zinc-600 mx-1">vs</span>
          <span className="text-emerald-400">+{fmtAsPct(position.take_profit_pct)}</span>
          {position.stop_loss_pct > 0 && (
            <>
              <span className="text-zinc-600 mx-1">=</span>
              <span className="font-semibold text-zinc-300">
                {(position.take_profit_pct / position.stop_loss_pct).toFixed(1)}:1
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Meta ── */}
      {signal._meta && (
        <div className="space-y-1">
          {signal._meta.fallback && (
            <div className="flex items-center justify-center gap-1.5 rounded-md border border-amber-800/40 bg-amber-950/20 py-1.5 px-2">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] font-medium text-amber-400">
                Degraded — using fallback signal
              </span>
            </div>
          )}
          <p className="text-center text-[10px] text-zinc-600">
            {signal._meta.active_event_count} of {signal._meta.event_count} events active
            {' · '}T½ {signal._meta.half_life_hrs}h
          </p>
        </div>
      )}
    </div>
  );
}
