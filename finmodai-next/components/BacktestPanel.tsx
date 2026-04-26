'use client';

/**
 * BacktestPanel
 *
 * Fetches /api/backtest/run, displays accuracy, win rate, avg return,
 * Sharpe-like ratio, and a sample trades table.
 * Includes a horizon selector and auto-fetches on mount.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Minus,
} from 'lucide-react';
import type { BacktestResult, BacktestTrade, BacktestHorizon } from '@/lib/backtestEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

type BacktestResponse = {
  result: BacktestResult;
  meta: {
    event_count:   number;
    horizon:       string;
    days_lookback: number;
    price_source:  string;
  };
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmtReturn(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day:   'numeric',
    hour:  '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

// ── Metric tile ───────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  positive,
}: {
  label:    string;
  value:    string;
  sub?:     string;
  positive?: boolean;
}) {
  const valueColor =
    positive === true  ? 'text-emerald-400' :
    positive === false ? 'text-rose-400'    : 'text-zinc-100';

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

// ── Direction icon ────────────────────────────────────────────────────────────

function DirectionIcon({ predicted }: { predicted: 'long' | 'short' | null }) {
  if (predicted === 'long')
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (predicted === 'short')
    return <TrendingDown className="h-3.5 w-3.5 text-rose-400" />;
  return <Minus className="h-3.5 w-3.5 text-zinc-500" />;
}

// ── Result icon ───────────────────────────────────────────────────────────────

function ResultIcon({ correct }: { correct: boolean | null }) {
  if (correct === true)  return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
  if (correct === false) return <XCircle     className="h-3.5 w-3.5 text-rose-400"    />;
  return <Minus className="h-3.5 w-3.5 text-zinc-600" />;
}

// ── Trade row ─────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const returnColor = trade.return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
      <td className="py-2 px-3 text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
        {fmtDate(trade.timestamp)}
      </td>
      <td className="py-2 px-3">
        <p className="text-[11px] text-zinc-300 leading-snug line-clamp-1 max-w-[220px]">
          {trade.headline ?? '—'}
        </p>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <DirectionIcon predicted={trade.predicted} />
          <span className="text-[10px] font-semibold uppercase text-zinc-400">
            {trade.predicted ?? 'none'}
          </span>
        </div>
      </td>
      <td className="py-2 px-3 text-right">
        <span className="text-[10px] font-mono text-zinc-400">
          {fmtPct(Math.max(trade.bull_prob, trade.bear_prob))}
        </span>
      </td>
      <td className={`py-2 px-3 text-right font-mono text-[11px] font-semibold tabular-nums ${returnColor}`}>
        {fmtReturn(trade.return_pct)}
      </td>
      <td className="py-2 px-3 text-center">
        <ResultIcon correct={trade.correct} />
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BacktestPanel() {
  const [horizon,  setHorizon ] = useState<BacktestHorizon>('3d');
  const [loading,  setLoading ] = useState(false);
  const [error,    setError   ] = useState<string | null>(null);
  const [data,     setData    ] = useState<BacktestResponse | null>(null);

  const run = useCallback(async (h: BacktestHorizon) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ horizon: h, days: 30, min_severity: 50 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData(await res.json() as BacktestResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(horizon); }, [horizon, run]);

  const result = data?.result;
  const meta   = data?.meta;

  // Sample: most recent 8 directional trades
  const sampleTrades = result?.trades
    .filter((t) => t.predicted !== null)
    .slice(-8)
    .reverse() ?? [];

  const sharpeColor =
    !result          ? 'text-zinc-100' :
    result.sharpe_like >= 0.5  ? 'text-emerald-400' :
    result.sharpe_like >= 0    ? 'text-amber-400'   : 'text-rose-400';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            Backtest
          </span>
          {meta && (
            <span className="rounded-full bg-zinc-800 px-2 py-px text-[10px] text-zinc-400">
              {meta.event_count} events · {meta.days_lookback}d · {meta.price_source}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Horizon selector */}
          {(['1d', '3d', '5d'] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              disabled={loading}
              className={`rounded px-2.5 py-1 text-[10px] font-semibold uppercase transition-colors ${
                horizon === h
                  ? 'bg-cyan-900/60 border border-cyan-600/50 text-cyan-300'
                  : 'border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {h}
            </button>
          ))}
          <button
            onClick={() => void run(horizon)}
            disabled={loading}
            className="rounded p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            title="Re-run backtest"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
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
        <div className="animate-pulse grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      )}

      {/* ── Metrics ── */}
      {!loading && result && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Accuracy"
            value={fmtPct(result.accuracy)}
            sub={`${result.trade_count} directional calls`}
            positive={result.accuracy >= 0.5}
          />
          <MetricTile
            label="Win Rate"
            value={fmtPct(result.win_rate)}
            sub="of directional trades"
            positive={result.win_rate >= 0.5}
          />
          <MetricTile
            label="Avg Return"
            value={fmtReturn(result.avg_return)}
            sub="per directional trade"
            positive={result.avg_return > 0}
          />
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
              Sharpe-like
            </div>
            <div className={`text-2xl font-black tabular-nums ${sharpeColor}`}>
              {result.sharpe_like.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-500">μ/σ of returns</div>
          </div>
        </div>
      )}

      {/* ── Call rate context ── */}
      {!loading && result && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
          <Target className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[11px] text-zinc-400">
            Model made directional calls on{' '}
            <span className="font-semibold text-zinc-300">
              {fmtPct(result.call_rate)}
            </span>{' '}
            of events (threshold: 60% probability)
          </span>
        </div>
      )}

      {/* ── Sample trades ── */}
      {!loading && sampleTrades.length > 0 && (
        <div className="space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
            Recent Directional Trades
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/40">
                  {['Time', 'Event', 'Call', 'Conviction', 'Return', '✓'].map((h) => (
                    <th
                      key={h}
                      className="py-2 px-3 text-left text-[9px] font-bold uppercase tracking-widest text-zinc-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleTrades.map((trade) => (
                  <TradeRow key={`${trade.timestamp}-${trade.index}`} trade={trade} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="text-center text-[9px] text-zinc-700">
        Synthetic price series — internal model validation only, not real-world alpha.
      </p>
    </div>
  );
}
