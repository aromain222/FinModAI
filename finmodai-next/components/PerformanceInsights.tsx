'use client';

/**
 * PerformanceInsights
 *
 * Displays the quant layer's self-assessment:
 *   - Signal quality score + tier
 *   - Feature importance ranked bars
 *   - Regime indicator
 *   - PnL attribution by event type and direction
 *   - Best / worst performing categories
 */

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart2,
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Activity,
  Layers,
} from 'lucide-react';
import type { PnlAttributionResult, BucketStats } from '@/lib/pnlAttribution';
import type { SignalQualityResult }                from '@/lib/signalQuality';
import type { FeatureImportance }                  from '@/lib/featureImportance';
import type { RegimeResult }                       from '@/lib/regimeDetection';
import { signalQualityLabel }                      from '@/lib/signalQuality';
import { regimeSummary }                           from '@/lib/regimeDetection';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PerformanceInsightsProps = {
  attribution?:        PnlAttributionResult;
  signalQuality?:      SignalQualityResult;
  featureImportance?:  FeatureImportance[];
  regime?:             RegimeResult;
  /** If provided, component will auto-fetch from the backtest API */
  autoFetch?:          boolean;
};

// ── Backtest API response shape (subset) ──────────────────────────────────────

type BacktestApiResponse = {
  result: {
    attribution:        PnlAttributionResult;
    signal_quality:     SignalQualityResult;
    feature_importance: FeatureImportance[];
  };
};

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPct(n: number, d = 1): string {
  return `${(n * 100).toFixed(d)}%`;
}

function fmtPnl(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
      {label}
    </div>
  );
}

// ── Signal quality score card ─────────────────────────────────────────────────

function QualityCard({ sq }: { sq: SignalQualityResult }) {
  const tier  = signalQualityLabel(sq.signal_score);
  const color =
    tier === 'excellent' ? 'text-emerald-400' :
    tier === 'good'      ? 'text-cyan-400'    :
    tier === 'fair'      ? 'text-amber-400'   : 'text-rose-400';
  const borderColor =
    tier === 'excellent' ? 'border-emerald-500/20' :
    tier === 'good'      ? 'border-cyan-500/20'    :
    tier === 'fair'      ? 'border-amber-500/20'   : 'border-rose-500/20';

  return (
    <div className={`rounded-lg border ${borderColor} bg-zinc-900/60 p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <SectionLabel label="Signal Quality" />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{tier}</span>
      </div>
      <div className={`text-3xl font-black tabular-nums ${color}`}>
        {(sq.signal_score * 100).toFixed(0)}
        <span className="text-lg text-zinc-500">/100</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { label: 'Accuracy',    value: fmtPct(sq.accuracy) },
            { label: 'Win Rate',    value: fmtPct(sq.win_rate) },
            { label: 'Consistency', value: fmtPct(sq.consistency) },
          ] as const
        ).map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">{label}</div>
            <div className="text-xs font-semibold text-zinc-300 tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            tier === 'excellent' ? 'bg-emerald-500' :
            tier === 'good'      ? 'bg-cyan-500'    :
            tier === 'fair'      ? 'bg-amber-500'   : 'bg-rose-500'
          }`}
          style={{ width: `${(sq.signal_score * 100).toFixed(0)}%` }}
        />
      </div>
      <div className="text-[10px] text-zinc-500">
        {sq.sample_size} directional trades · avg {fmtPnl(sq.avg_return)} per trade
      </div>
    </div>
  );
}

// ── Regime badge ──────────────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: RegimeResult }) {
  const color =
    regime.regime === 'risk_on'  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
    regime.regime === 'risk_off' ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'           :
                                   'border-zinc-600/40 bg-zinc-800/40 text-zinc-300';

  const Icon =
    regime.regime === 'risk_on'  ? TrendingUp   :
    regime.regime === 'risk_off' ? TrendingDown : Activity;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
      <SectionLabel label="Market Regime" />
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {regime.regime.replace('_', '-')}
        </span>
      </div>
      <p className="text-[10px] text-zinc-500">{regimeSummary(regime)}</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="text-center">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Size ×</div>
          <div className="text-sm font-bold text-zinc-300 tabular-nums">{regime.size_multiplier}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Stop ×</div>
          <div className="text-sm font-bold text-zinc-300 tabular-nums">{regime.stop_loss_multiplier}</div>
        </div>
      </div>
    </div>
  );
}

// ── Feature importance chart ──────────────────────────────────────────────────

function FeatureImportanceChart({ features }: { features: FeatureImportance[] }) {
  const maxImp = Math.max(...features.map((f) => f.importance), 0.01);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <SectionLabel label="Feature Importance (|Pearson r| vs PnL)" />
      <div className="space-y-2.5">
        {features.map((f) => {
          const pct     = (f.importance / maxImp) * 100;
          const barColor =
            f.direction === 'positive' ? 'bg-emerald-500' :
            f.direction === 'negative' ? 'bg-rose-500'    : 'bg-zinc-500';
          const label = f.feature.replace(/_/g, ' ');
          const sign  = f.direction === 'positive' ? '+' : f.direction === 'negative' ? '−' : '';

          return (
            <div key={f.feature} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] capitalize text-zinc-400">{label}</span>
                <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                  {sign}{(f.importance * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Attribution row ───────────────────────────────────────────────────────────

function AttributionRow({
  rank,
  label,
  stats,
}: {
  key?:   string;   // consumed by React, never passed to component
  rank:   number;
  label:  string;
  stats:  BucketStats;
}) {
  const pnlColor = stats.total_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
  const Icon = stats.total_pnl >= 0 ? CheckCircle : AlertTriangle;
  const iconColor = stats.total_pnl >= 0 ? 'text-emerald-500' : 'text-amber-500';

  return (
    <div className="flex items-center gap-3 py-2 border-t border-zinc-800/60">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400">
        {rank}
      </span>
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
      <span className="flex-1 text-[11px] capitalize text-zinc-300">{label}</span>
      <div className="text-right">
        <div className={`text-[11px] font-mono font-semibold tabular-nums ${pnlColor}`}>
          {fmtPnl(stats.avg_pnl)}
        </div>
        <div className="text-[9px] text-zinc-600">{stats.count} trades</div>
      </div>
      <div className="text-right w-12">
        <div className="text-[11px] font-mono text-zinc-400 tabular-nums">
          {fmtPct(stats.win_rate, 0)}
        </div>
        <div className="text-[9px] text-zinc-600">win</div>
      </div>
    </div>
  );
}

// ── Attribution panel ─────────────────────────────────────────────────────────

function AttributionPanel({ attribution }: { attribution: PnlAttributionResult }) {
  const eventRanked = Object.entries(attribution.by_event_type)
    .map(([key, stats]) => ({ key, stats }))
    .sort((a, b) => b.stats.total_pnl - a.stats.total_pnl);
  const directionStats = attribution.by_direction;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel label="PnL Attribution by Event Type" />
        <span className="text-[10px] text-zinc-500">
          {attribution.total_count} trades · {fmtPnl(attribution.total_pnl)} total
        </span>
      </div>

      {/* Event type breakdown */}
      <div className="space-y-0">
        {eventRanked.slice(0, 6).map(({ key, stats }, i) => (
          <AttributionRow key={key} rank={i + 1} label={key} stats={stats} />
        ))}
        {eventRanked.length === 0 && (
          <p className="text-[11px] text-zinc-600 py-2">No attribution data yet.</p>
        )}
      </div>

      {/* Direction split */}
      {Object.keys(directionStats).length > 0 && (
        <div className="border-t border-zinc-800/60 pt-3">
          <SectionLabel label="By Direction" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['long', 'short'] as const).map((dir) => {
              const s = directionStats[dir];
              if (!s) return null;
              const pnlColor = s.total_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
              return (
                <div
                  key={dir}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5 text-center"
                >
                  <div className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">
                    {dir}
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${pnlColor}`}>
                    {fmtPnl(s.avg_pnl)}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {fmtPct(s.win_rate, 0)} win · {s.count}x
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signal strength bucket */}
      {Object.keys(attribution.by_signal_strength).length > 0 && (
        <div className="border-t border-zinc-800/60 pt-3 space-y-2">
          <SectionLabel label="By Signal Strength" />
          {(['high', 'medium', 'low'] as const).map((tier) => {
            const s = attribution.by_signal_strength[tier];
            if (!s) return null;
            const pct    = s.count / Math.max(attribution.total_count, 1);
            const color  = tier === 'high' ? 'bg-emerald-500' : tier === 'medium' ? 'bg-amber-500' : 'bg-zinc-600';
            const pnlClr = s.total_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
            return (
              <div key={tier} className="flex items-center gap-2">
                <span className="w-12 text-[10px] capitalize text-zinc-500">{tier}</span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${(pct * 100).toFixed(0)}%` }} />
                </div>
                <span className={`w-14 text-right text-[10px] font-mono tabular-nums ${pnlClr}`}>
                  {fmtPnl(s.avg_pnl)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PerformanceInsights({
  attribution:       attributionProp,
  signalQuality:     sqProp,
  featureImportance: fiProp,
  regime:            regimeProp,
  autoFetch = false,
}: PerformanceInsightsProps) {
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [attribution, setAttr]  = useState<PnlAttributionResult | undefined>(attributionProp);
  const [signalQuality, setSq]  = useState<SignalQualityResult | undefined>(sqProp);
  const [featureImportance, setFi] = useState<FeatureImportance[] | undefined>(fiProp);
  const regime = regimeProp;  // regime must be passed as prop (needs vol/trend inputs)

  const fetchData = useCallback(async () => {
    if (!autoFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ horizon: '3d', days: 30, min_severity: 50 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BacktestApiResponse;
      setAttr(data.result.attribution);
      setSq(data.result.signal_quality);
      setFi(data.result.feature_importance);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [autoFetch]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const hasData = attribution || signalQuality || featureImportance;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            Performance Intelligence
          </span>
        </div>
        {autoFetch && (
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="rounded p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-300">{error}</p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="h-32 rounded-lg bg-zinc-800/60" />
          <div className="h-24 rounded-lg bg-zinc-800/60" />
          <div className="h-40 rounded-lg bg-zinc-800/60" />
        </div>
      )}

      {/* ── Content ── */}
      {!loading && hasData && (
        <div className="space-y-4">

          {/* Row 1: quality + regime */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {signalQuality && <QualityCard sq={signalQuality} />}
            {regime && <RegimeBadge regime={regime} />}
          </div>

          {/* Feature importance */}
          {featureImportance && featureImportance.length > 0 && (
            <FeatureImportanceChart features={featureImportance} />
          )}

          {/* Attribution */}
          {attribution && attribution.total_count > 0 && (
            <AttributionPanel attribution={attribution} />
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !hasData && !error && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-zinc-600">
          <BarChart2 className="h-8 w-8" />
          <p className="text-xs">No performance data available yet.</p>
          {!autoFetch && (
            <p className="text-[10px]">Pass attribution, signalQuality, or featureImportance props.</p>
          )}
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="text-center text-[9px] text-zinc-700">
        Model self-assessment — synthetic backtest data, not live trading performance.
      </p>
    </div>
  );
}
