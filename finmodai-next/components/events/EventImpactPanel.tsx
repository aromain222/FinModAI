'use client';

/**
 * EventImpactPanel
 *
 * Displays the output of /api/event-impact inline below a headline card.
 * Shows:
 *  - TimesFM 30-day price forecast for the impacted ticker
 *  - Impact summary chip (direction + magnitude)
 *  - Before / After assumption table
 *  - Scenario valuation deltas (base · upside · downside)
 *  - Causal mechanism bullets
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Zap } from 'lucide-react';
import type { EventImpactResult } from '@/lib/useEventImpact';
import { fetchPriceForecast, type PriceForecastResult } from '@/lib/forecast/timesFM';
import { ForecastChart } from '@/components/charts/ForecastChart';

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmt(value: number, decimals = 2): string {
  return (value * 100).toFixed(decimals) + '%';
}

function fmtDelta(value: number, decimals = 2): string {
  const pct = value * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(decimals) + '%';
}

function fmtBps(bps: number): string {
  return (bps >= 0 ? '+' : '') + bps.toFixed(0) + ' bps';
}

function fmtValDelta(pct: number): string {
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DirectionChip({ direction }: { direction: 'positive' | 'negative' | 'mixed' }) {
  if (direction === 'positive') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
        <ArrowUp className="h-3 w-3" /> Positive
      </span>
    );
  }
  if (direction === 'negative') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-300">
        <ArrowDown className="h-3 w-3" /> Negative
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
      <Minus className="h-3 w-3" /> Mixed
    </span>
  );
}

function MagnitudeChip({ magnitude }: { magnitude: 'low' | 'medium' | 'high' }) {
  const styles: Record<string, string> = {
    low:    'border-zinc-600/40 bg-zinc-800/50 text-zinc-400',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    high:   'border-rose-500/30 bg-rose-500/10 text-rose-300',
  };
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${styles[magnitude]}`}>
      {magnitude} impact
    </span>
  );
}

function ValuationBar({ label, delta, highlight }: { label: string; delta: number; highlight?: boolean }) {
  const positive = delta >= 0;
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? 'border-cyan-400/20 bg-cyan-500/5' : 'border-zinc-800/60 bg-zinc-900/50'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {fmtValDelta(delta)}
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">vs. pre-event model</div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface EventImpactPanelProps {
  result: EventImpactResult;
  /** Called when the user confirms applying the mutation to the live model. */
  onApplyToModel?: (updatedModel: EventImpactResult['updated_model']) => void;
}

/**
 * Fetches TimesFM baseline, then applies the event's valuation delta as a linear ramp
 * to produce a "news-adjusted" forecast series shown alongside the baseline.
 *
 * Adjustment formula: adjusted[i] = baseline[i] * (1 + valuationDelta * ramp)
 * where ramp = (i+1)/horizon so the shift builds gradually over the forecast window.
 */
function EventAdjustedForecastChart({
  ticker,
  valuationDelta,       // fractional e.g. 0.05 = +5%
  eventDirection,
}: {
  ticker: string;
  valuationDelta: number;
  eventDirection: 'positive' | 'negative' | 'mixed';
}) {
  const [data, setData] = useState<PriceForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPriceForecast(ticker, 30).then((r) => {
      if (!cancelled) { setData(r); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // Build the event-adjusted series by ramping valuationDelta over the horizon.
  const eventAdjusted = useMemo(() => {
    if (!data?.forecast) return null;
    const horizon = data.forecast.values.length;
    // Cap the shift at ±20% to avoid absurd extrapolations.
    const clampedDelta = Math.max(-0.20, Math.min(0.20, valuationDelta));
    return data.forecast.values.map((v, i) => {
      const ramp = (i + 1) / horizon;
      return v * (1 + clampedDelta * ramp);
    });
  }, [data, valuationDelta]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
        <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-400" />
        Loading TimesFM forecast…
      </div>
    );
  }
  if (!data?.model_available || !data.forecast || !data.historical) return null;

  const historical = data.historical.dates.map((date, i) => ({
    date,
    actual: data.historical.prices[i] ?? 0,
  }));
  const forecast = data.forecast.dates.map((date, i) => ({
    date,
    forecast: data.forecast!.values[i] ?? 0,
    lower: data.forecast!.lower[i] ?? 0,
    upper: data.forecast!.upper[i] ?? 0,
  }));

  const directionLabel = eventDirection === 'positive' ? 'bullish' : eventDirection === 'negative' ? 'bearish' : 'mixed';

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <span>TimesFM Price Forecast</span>
        <span className="font-normal normal-case tracking-normal">
          — violet: trend baseline · cyan: event-adjusted ({directionLabel})
        </span>
      </div>
      <ForecastChart
        ticker={ticker}
        historical={historical}
        forecast={forecast}
        eventAdjusted={eventAdjusted}
        eventAdjustedLabel={`Event-adjusted (${directionLabel})`}
        modelAvailable={data.model_available}
        height={180}
      />
    </div>
  );
}

export function EventImpactPanel({ result, onApplyToModel }: EventImpactPanelProps) {
  const { assumption_deltas: d, current_model: before, updated_model: after } = result;

  const assumptions: Array<{ label: string; before: string; after: string; delta: string; changed: boolean }> = [
    {
      label:   'Revenue Growth',
      before:  fmt(before.revenue_growth),
      after:   fmt(after.revenue_growth),
      delta:   fmtDelta(d.revenue_growth_delta),
      changed: d.revenue_growth_delta !== 0,
    },
    {
      label:   'EBITDA Margin',
      before:  fmt(before.ebitda_margin),
      after:   fmt(after.ebitda_margin),
      delta:   fmtBps(d.ebitda_margin_delta_bps),
      changed: d.ebitda_margin_delta_bps !== 0,
    },
    {
      label:   'WACC',
      before:  fmt(before.wacc),
      after:   fmt(after.wacc),
      delta:   fmtBps(d.wacc_delta_bps),
      changed: d.wacc_delta_bps !== 0,
    },
    {
      label:   'Terminal Growth',
      before:  fmt(before.terminal_growth),
      after:   fmt(after.terminal_growth),
      delta:   fmtDelta(d.terminal_growth_delta),
      changed: d.terminal_growth_delta !== 0,
    },
    {
      label:   'CapEx % Revenue',
      before:  fmt(before.capex_pct_revenue),
      after:   fmt(after.capex_pct_revenue),
      delta:   fmtDelta(d.capex_delta_pct_revenue),
      changed: d.capex_delta_pct_revenue !== 0,
    },
  ];

  return (
    <div className="mt-4 space-y-5 rounded-3xl border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(6,182,212,0.06),rgba(255,255,255,0.01))] p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold text-zinc-100">Model Mutation</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DirectionChip direction={result.impact_summary.direction} />
          <MagnitudeChip magnitude={result.impact_summary.magnitude} />
        </div>
      </div>

      {/* TimesFM baseline + event-adjusted forecast chart */}
      {result.ticker && result.ticker !== 'MARKET' && (
        <EventAdjustedForecastChart
          ticker={result.ticker}
          valuationDelta={result.scenarios.base.valuation_delta_pct / 100}
          eventDirection={result.impact_summary.direction}
        />
      )}

      {/* Primary driver */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Primary Driver</div>
        <div className="mt-1 text-sm text-zinc-200">{result.impact_summary.primary_driver}</div>
      </div>

      {/* Valuation scenario bars */}
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Valuation Impact vs. Pre-Event Model
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ValuationBar label="Base"     delta={result.scenarios.base.valuation_delta_pct}     highlight />
          <ValuationBar label="Upside"   delta={result.scenarios.upside.valuation_delta_pct}           />
          <ValuationBar label="Downside" delta={result.scenarios.downside.valuation_delta_pct}         />
        </div>
      </div>

      {/* Before / After assumptions */}
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Assumption Changes
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-800/60">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/60">
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Metric</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Before</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">After</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Delta</th>
              </tr>
            </thead>
            <tbody>
              {assumptions.map((row) => (
                <tr key={row.label} className={`border-t border-zinc-800/40 ${row.changed ? 'bg-cyan-500/[0.04]' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-zinc-300">{row.label}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{row.before}</td>
                  <td className={`px-4 py-2.5 font-semibold ${row.changed ? 'text-cyan-300' : 'text-zinc-400'}`}>
                    {row.after}
                  </td>
                  <td className={`px-4 py-2.5 text-[12px] font-medium ${row.changed ? 'text-cyan-400' : 'text-zinc-600'}`}>
                    {row.changed ? row.delta : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mechanism bullets */}
      {result.mechanism.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Causal Chain
          </div>
          <ol className="space-y-1.5">
            {result.mechanism.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-[13px] leading-6 text-zinc-300">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[9px] font-bold text-zinc-400">
                  {idx + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Apply button */}
      {onApplyToModel && (
        <div className="flex justify-end border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={() => onApplyToModel(result.updated_model)}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/20"
          >
            <Zap className="h-4 w-4" />
            Apply to Active Model
          </button>
        </div>
      )}
    </div>
  );
}
