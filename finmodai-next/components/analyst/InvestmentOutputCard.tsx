'use client';

import { useEffect, useState } from 'react';
import {
  normalizeAnalystOutput,
  getConvictionLabel,
  type AnalystOutput,
  type InvestmentSignal,
} from '@/lib/analyst/investmentOutput';
import { ForecastSparkline } from '@/components/analyst/ForecastSparkline';
import { createPosition, getPositions } from '@/lib/trading/positions';
import { getPortfolioWarnings, type PortfolioWarning } from '@/lib/trading/portfolio';

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

function plainSignalLabel(signal: InvestmentSignal): string {
  if (signal === 'LONG') return 'Potential opportunity';
  if (signal === 'SHORT') return 'Looks expensive';
  return 'Fair value / watchlist';
}

function plainGapExplanation(signal: InvestmentSignal, percentChange: number): string {
  const absGap = Math.abs(percentChange);
  if (signal === 'NEUTRAL' && absGap < 5) {
    return 'The model is close to the market price, so there is not enough edge for a clear long or short call.';
  }
  if (signal === 'NEUTRAL') {
    return 'The modeled gap is large, but sensitivity or conflicting signals make this better as a watchlist name than a trade.';
  }
  if (signal === 'LONG') {
    return 'The model value is above the market price, so the setup only works if the growth and margin assumptions hold.';
  }
  return 'The market price is above the model value, so the setup only works as an underweight or paper short if the bull-case assumptions fail.';
}

function plainAssumptionRead(normalized: ReturnType<typeof normalizeAnalystOutput>): string {
  const breakeven = normalized.breakeven;
  if (breakeven?.terminalGrowthPct != null) {
    const gap = breakeven.terminalGrowthPct - breakeven.currentTerminalGrowthPct;
    if (Math.abs(gap) < 0.25) {
      return `The market price is roughly justified if Alphabet can sustain about ${breakeven.currentTerminalGrowthPct.toFixed(1)}% long-term growth.`;
    }
    if (gap > 0) {
      return `To justify the current price, the model needs long-term growth closer to ${breakeven.terminalGrowthPct.toFixed(1)}% instead of ${breakeven.currentTerminalGrowthPct.toFixed(1)}%.`;
    }
    return `The current assumptions already clear the market-implied long-term growth hurdle of ${breakeven.terminalGrowthPct.toFixed(1)}%.`;
  }
  return 'The result is mainly driven by long-term growth, discount rate, and whether AI/cloud spending turns into durable free cash flow.';
}

function sanitizeAnalystText(text: string, normalized: ReturnType<typeof normalizeAnalystOutput>): string {
  const terminalGrowth = normalized.breakeven?.currentTerminalGrowthPct;
  if (terminalGrowth == null || !Number.isFinite(terminalGrowth)) return text;
  return text.replace(/\b(?:[2-9]\d|100)% terminal growth rate\b/g, `${terminalGrowth.toFixed(2)}% terminal growth rate`);
}

function eventSignalClass(signal: 'LONG' | 'SHORT' | 'NEUTRAL' | null): string {
  if (signal === 'LONG') return 'text-emerald-300';
  if (signal === 'SHORT') return 'text-rose-300';
  return 'text-[var(--cb-text-muted)]';
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
  const normalized = normalizeAnalystOutput(output);
  const [trackingState, setTrackingState] = useState<'idle' | 'saving' | 'tracked' | 'error'>('idle');
  const [portfolioWarnings, setPortfolioWarnings] = useState<PortfolioWarning[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!normalized.isComplete || normalized.sizePct == null) {
      setPortfolioWarnings([]);
      return;
    }

    getPositions()
      .then((positions) => {
        if (!cancelled) {
          setPortfolioWarnings(getPortfolioWarnings(positions, { sizePct: normalized.sizePct ?? 0 }));
        }
      })
      .catch(() => {
        if (!cancelled) setPortfolioWarnings([]);
      });

    return () => {
      cancelled = true;
    };
  }, [normalized.isComplete, normalized.sizePct]);

  if (loading || !normalized.isComplete) return <LoadingCard />;

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
  const plainTakeaway = plainGapExplanation(normalized.signal, normalized.percentChange);
  const assumptionRead = plainAssumptionRead(normalized);
  const analystNote = sanitizeAnalystText(normalized.analystNote, normalized);

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
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Decision</div>
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
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Price vs Model</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatValuationGap(normalized.percentChange)}
          </div>
          <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
            {normalized.percentChange >= 0 ? 'Model value above market' : 'Model value below market'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">Model Confidence</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--cb-text-primary)]">
            {formatConfidence(normalized.confidence)}{' '}
            <span className="text-sm font-medium text-[var(--cb-text-muted)]">
              ({normalized.confidenceBand})
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3 md:grid-cols-[0.7fr_1.3fr]">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            Plain-English Read
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">
            {plainSignalLabel(normalized.signal)}
          </div>
        </div>
        <div className="space-y-1 text-sm leading-6 text-[var(--cb-text-primary)]">
          <p>{plainTakeaway}</p>
          <p className="text-[var(--cb-text-muted)]">{assumptionRead}</p>
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

      {normalized.strategicContext ? (
        <div className="max-w-3xl rounded-lg border border-cyan-400/15 bg-cyan-500/5 px-3 py-2 text-sm leading-6 text-cyan-100/90">
          {normalized.strategicContext}
        </div>
      ) : null}

      {/* Analyst note */}
      <p className="max-w-3xl text-[15px] leading-7 text-[var(--cb-text-primary)]">
        {analystNote}
      </p>

      {normalized.investmentCapabilityMemo ? (
        <div className="max-w-3xl rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 px-3 py-2 text-sm leading-6 text-[var(--cb-text-muted)]">
          {normalized.investmentCapabilityMemo}
        </div>
      ) : null}

      {normalized.eventContext.length > 0 ? (
        <div className="max-w-3xl rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3">
          <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            Event Context
          </div>
          <div className="mt-2 space-y-2">
            {normalized.eventContext.map((event) => (
              <div key={`${event.title}-${event.severity}`} className="text-sm leading-6">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-[var(--cb-text-primary)]">{event.title}</span>
                  <span className="text-xs text-[var(--cb-text-muted)]">
                    {event.eventType} · severity {event.severity}
                  </span>
                  {event.signal ? (
                    <span className={`text-xs font-medium ${eventSignalClass(event.signal)}`}>
                      {event.signal}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--cb-text-muted)]">{event.impact}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            <div className="grid gap-2 text-xs text-[var(--cb-text-muted)] sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide">If long-term growth is 1 point higher</div>
                <div
                  className={
                    normalized.sensitivityDeltas.terminalGrowthPlus1Pct >= 0
                      ? 'mt-1 font-medium text-emerald-400'
                      : 'mt-1 font-medium text-rose-400'
                  }
                >
                  Model value changes {formatDelta(normalized.sensitivityDeltas.terminalGrowthPlus1Pct)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide">If the required return is 1 point lower</div>
                <div
                  className={
                    normalized.sensitivityDeltas.waccMinus1Pct >= 0
                      ? 'mt-1 font-medium text-emerald-400'
                      : 'mt-1 font-medium text-rose-400'
                  }
                >
                  Model value changes {formatDelta(normalized.sensitivityDeltas.waccMinus1Pct)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Position sizing */}
      {normalized.sizePct != null || normalized.targetPrice != null || normalized.stopLoss != null ? (
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-black/10 p-3 text-xs">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            Decision Setup
          </div>
          <div className="grid gap-2 text-[var(--cb-text-primary)] sm:grid-cols-4">
            <div>
              <span className="text-[var(--cb-text-muted)]">Risk Budget</span>
              <div className="font-medium tabular-nums">
                {normalized.sizePct != null ? `${normalized.sizePct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">DCF Target</span>
              <div className="font-medium tabular-nums text-emerald-400/90">
                {formatPrice(normalized.targetPrice)}
              </div>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Risk Stop</span>
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
          ) : (
            <div className="mt-2 text-[var(--cb-text-muted)]">
              No paper trade suggested because the model does not show enough edge.
            </div>
          )}

          {portfolioWarnings.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {portfolioWarnings.map((warning) => (
                <div key={warning.type} className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-amber-200/90">
                  {warning.message}
                </div>
              ))}
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
                    ? 'Paper setup tracked'
                    : 'Track Paper Setup'}
              </button>
              <span className="text-[var(--cb-text-muted)]">
                Adds this to paper tracking at a desired entry of {formatPrice(normalized.currentPrice)}. Pending means P&amp;L starts only after the entry is crossed; no brokerage order is placed.
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
