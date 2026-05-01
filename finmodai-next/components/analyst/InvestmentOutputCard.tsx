'use client';

import {
  normalizeAnalystOutput,
  getConvictionLabel,
  type AnalystOutput,
  type InvestmentSignal,
} from '@/lib/analyst/investmentOutput';
import { ForecastSparkline } from '@/components/analyst/ForecastSparkline';

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
  if (loading) return <LoadingCard />;

  const normalized = normalizeAnalystOutput(output);

  if (!normalized.isComplete) return <LoadingCard />;

  const summaryLine = `${normalized.signal} | ${formatValuationGap(normalized.percentChange)} Gap (${normalized.edgeStrength})`;
  const showAccuracy =
    normalized.confidenceBreakdown.sampleSize >= 5 &&
    normalized.confidenceBreakdown.accuracy != null;

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

      {/* Position sizing */}
      {normalized.sizePct != null ? (
        <div className="text-xs font-medium text-[var(--cb-text-primary)]">
          Suggested Position:{' '}
          <span className="tabular-nums">{normalized.sizePct.toFixed(1)}%</span>{' '}
          <span className="text-[var(--cb-text-muted)]">
            ({getConvictionLabel(normalized.sizePct, normalized.confidence)})
          </span>
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
