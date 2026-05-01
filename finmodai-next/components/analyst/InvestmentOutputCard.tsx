'use client';

import { useState } from 'react';
import {
  normalizeAnalystOutput,
  getConvictionLabel,
  type AnalystOutput,
  type InvestmentSignal,
} from '@/lib/analyst/investmentOutput';
import { ForecastSparkline } from '@/components/analyst/ForecastSparkline';
import { createPosition } from '@/lib/trading/positions';

// ─── Signal styling helpers ───────────────────────────────────────────────────

function signalClasses(signal: InvestmentSignal): string {
  if (signal === 'LONG') return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200';
  if (signal === 'SHORT') return 'border-rose-400/30 bg-rose-500/15 text-rose-200';
  return 'border-zinc-400/30 bg-zinc-500/15 text-zinc-200';
}

function signalAccentClasses(signal: InvestmentSignal): string {
  if (signal === 'LONG') return 'bg-emerald-400';
  if (signal === 'SHORT') return 'bg-rose-400';
  return 'bg-zinc-400';
}

function formatValuationGap(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatConfidence(value: number): string {
  return value.toFixed(2);
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}%`;
}

const sensitivityLabelMap: Record<string, string> = {
  terminal: 'terminal growth',
  wacc: 'discount rate',
  growth: 'revenue growth',
};

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 md:p-6">
      <div className="text-sm font-semibold text-[var(--cb-text-muted)]">Signal: Loading…</div>
      <div className="mt-1 text-xs text-[var(--cb-text-muted)]">Estimating valuation impact</div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

type InvestmentOutputCardProps = {
  output: AnalystOutput;
  loading?: boolean;
};

export function InvestmentOutputCard({ output, loading = false }: InvestmentOutputCardProps) {
  const [trackingState, setTrackingState] = useState<'idle' | 'saving' | 'tracked' | 'error'>('idle');

  if (loading) return <LoadingCard />;

  const normalized = normalizeAnalystOutput(output);

  if (!normalized.isComplete) return <LoadingCard />;

  const summaryLine = `${normalized.signal} | ${formatValuationGap(normalized.percentChange)} Gap (${normalized.edgeStrength})`;
  const showAccuracy =
    normalized.confidenceBreakdown.sampleSize >= 5 &&
    normalized.confidenceBreakdown.accuracy != null;

  const showSensitivityWarning =
    normalized.sensitivity?.isHighlySensitive === true &&
    Boolean(normalized.sensitivity.explanation);

  const sensitivityLabel = normalized.sensitivity
    ? (sensitivityLabelMap[normalized.sensitivity.primarySensitivity] ?? normalized.sensitivity.primarySensitivity)
    : '';

  const showWntbt =
    normalized.breakeven?.terminalGrowthPct != null || normalized.sensitivityDeltas != null;
  const canTrackTrade =
    normalized.signal !== 'NEUTRAL' &&
    normalized.ticker.length > 0 &&
    normalized.currentPrice != null &&
    normalized.sizePct != null;

  async function handleTrackTrade() {
    if (!canTrackTrade) return;
    const direction = normalized.signal === 'SHORT' ? 'SHORT' : 'LONG';
    const entryPrice = normalized.currentPrice;
    const sizePct = normalized.sizePct;
    if (entryPrice == null || sizePct == null) return;
    setTrackingState('saving');
    try {
      await createPosition({
        ticker: normalized.ticker,
        direction,
        entryPrice,
        targetPrice: normalized.targetPrice,
        stopLoss: normalized.stopLoss,
        sizePct,
        confidence: normalized.confidence,
        horizon: normalized.tradeHorizon || null,
        notes: normalized.valuationConclusion || normalized.analystNote,
      });
      window.dispatchEvent(new CustomEvent('capitalbase:positions-updated'));
      setTrackingState('tracked');
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[InvestmentOutputCard] Unable to track trade', error);
      }
      setTrackingState('error');
    }
  }

  return (
    <div className="relative space-y-5 overflow-hidden rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 text-[var(--cb-text-primary)] shadow-[0_18px_60px_rgba(0,0,0,0.18)] md:p-6">
      {/* Left accent bar */}
      <div className={`absolute inset-y-0 left-0 w-1 ${signalAccentClasses(normalized.signal)}`} />

      {/* Top row: signal chip + valuation gap + confidence */}
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Signal</div>
          <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${signalClasses(normalized.signal)}`}>
            {summaryLine}
          </div>
          {normalized.valuationConclusion && (
            <div className="mt-1.5 text-xs text-[var(--cb-text-muted)]">
              {normalized.valuationConclusion}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Valuation Gap</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatValuationGap(normalized.percentChange)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Confidence</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatConfidence(normalized.confidence)}{' '}
            <span className="text-sm font-medium text-[var(--cb-text-muted)]">
              ({normalized.confidenceBand})
            </span>
          </div>
        </div>
      </div>

      {/* Sensitivity warning */}
      {showSensitivityWarning && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2.5">
          <span className="shrink-0 text-xs font-bold text-amber-400">!</span>
          <div className="text-xs leading-5 text-amber-200/80">
            <span className="font-medium text-amber-200">
              High sensitivity to {sensitivityLabel} assumptions.
            </span>{' '}
            {normalized.sensitivity!.explanation}
          </div>
        </div>
      )}

      {/* Primary driver / attribution */}
      <div className="text-sm leading-6 text-[var(--cb-text-primary)]">
        {normalized.attributionExplanation}
      </div>

      {/* Forecast sparkline */}
      {normalized.forecast.length > 1 ? (
        <ForecastSparkline forecast={normalized.forecast} historical={normalized.historical} />
      ) : null}

      {/* Analyst note */}
      <p className="max-w-3xl text-[15px] leading-7 text-[var(--cb-text-primary)]">
        {normalized.analystNote}
      </p>

      {/* What Needs to Be True + Sensitivity preview */}
      {showWntbt && (
        <div className="space-y-3 rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3">
          <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            What Needs to Be True
          </div>

          {normalized.breakeven?.terminalGrowthPct != null && (
            <ul className="space-y-1.5 text-sm text-[var(--cb-text-primary)]">
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--cb-text-muted)]" />
                <span>
                  Terminal growth must reach{' '}
                  <span className="font-medium tabular-nums">
                    {normalized.breakeven.terminalGrowthPct.toFixed(1)}%
                  </span>{' '}
                  to justify{' '}
                  {normalized.breakeven.currentPriceDollars != null
                    ? `the $${normalized.breakeven.currentPriceDollars.toFixed(0)} market price`
                    : 'current market price'}{' '}
                  <span className="text-[var(--cb-text-muted)]">
                    (current: {normalized.breakeven.currentTerminalGrowthPct.toFixed(1)}%)
                  </span>
                </span>
              </li>
            </ul>
          )}

          {normalized.sensitivityDeltas != null && (
            <div className="text-xs text-[var(--cb-text-muted)]">
              Valuation sensitivity:
              <span className="ml-2 inline-flex gap-3">
                <span>
                  +1% terminal growth{' '}
                  <span
                    className={
                      normalized.sensitivityDeltas.terminalGrowthPlus1Pct >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {formatDelta(normalized.sensitivityDeltas.terminalGrowthPlus1Pct)}
                  </span>
                </span>
                <span>
                  &minus;1% WACC{' '}
                  <span
                    className={
                      normalized.sensitivityDeltas.waccMinus1Pct >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {formatDelta(normalized.sensitivityDeltas.waccMinus1Pct)}
                  </span>
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Position sizing */}
      {normalized.sizePct != null || normalized.targetPrice != null || normalized.stopLoss != null ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3 text-xs">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            Trade Setup
          </div>
          <div className="grid gap-2 text-[var(--cb-text-primary)] sm:grid-cols-4">
            <div>
              <span className="text-[var(--cb-text-muted)]">Suggested Position</span>
              <div className="font-medium tabular-nums">
                {normalized.sizePct != null ? `${normalized.sizePct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Target</span>
              <div className="font-medium tabular-nums text-emerald-400/90">
                {formatPrice(normalized.targetPrice)}
              </div>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Stop</span>
              <div className="font-medium tabular-nums text-rose-400/90">
                {formatPrice(normalized.stopLoss)}
              </div>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Horizon</span>
              <div className="font-medium">{normalized.tradeHorizon || '—'}</div>
            </div>
          </div>

          {normalized.sizePct != null ? (
            <div className="mt-2 text-[var(--cb-text-muted)]">
              Conviction: {getConvictionLabel(normalized.sizePct, normalized.confidence)}
            </div>
          ) : null}

          {canTrackTrade ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleTrackTrade()}
                disabled={trackingState === 'saving' || trackingState === 'tracked'}
                className="rounded-md border border-[var(--cb-border-strong)] bg-[var(--cb-surface-alt)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-primary)] transition-colors hover:border-[var(--cb-green)] disabled:cursor-default disabled:opacity-60"
              >
                {trackingState === 'saving'
                  ? 'Tracking…'
                  : trackingState === 'tracked'
                    ? 'Pending trade tracked'
                    : 'Track Trade'}
              </button>
              <span className="text-[var(--cb-text-muted)]">
                Creates a pending paper trade with desired entry at {formatPrice(normalized.currentPrice)}.
              </span>
            </div>
          ) : normalized.signal !== 'NEUTRAL' ? (
            <div className="mt-2 text-[var(--cb-text-muted)]">
              Add a ticker and current price before tracking this recommendation.
            </div>
          ) : null}
          {trackingState === 'error' ? (
            <div className="mt-2 text-rose-300">Unable to track trade. Try again.</div>
          ) : null}
        </div>
      ) : null}

      {/* Confidence explanation */}
      <div className="text-xs text-[var(--cb-text-muted)]">
        {normalized.confidenceExplanation}
      </div>

      {/* Collapsible details */}
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-widest text-[var(--cb-text-muted)] transition-colors hover:text-[var(--cb-text-primary)]">
          Details{' '}
          <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-4 grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--cb-text-muted)]">
              Confidence Breakdown
            </div>
            <div className="space-y-1.5 text-sm text-[var(--cb-text-primary)]">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--cb-text-muted)]">Model confidence</span>
                <span className="font-medium tabular-nums">
                  {normalized.confidenceBreakdown.model != null
                    ? formatConfidence(normalized.confidenceBreakdown.model)
                    : 'n/a'}
                </span>
              </div>
              {showAccuracy ? (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--cb-text-muted)]">Historical accuracy</span>
                  <span className="font-medium tabular-nums">
                    {Math.round((normalized.confidenceBreakdown.accuracy ?? 0) * 100)}%
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {normalized.drivers.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--cb-text-muted)]">
                Secondary Drivers
              </div>
              <ul className="space-y-1.5 text-sm leading-6 text-[var(--cb-text-primary)]">
                {normalized.drivers.map((driver) => (
                  <li key={driver} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--cb-text-muted)]" />
                    <span>{driver}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
